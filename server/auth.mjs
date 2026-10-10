// PULSE · cuentas: registro, inicio de sesión, recuperación de contraseña (reemplaza Supabase Auth)
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool, transaccion, ErrorNegocio, mensajeDeError } from "./db.mjs";
import { config } from "./config.mjs";
import { enviarEnlace } from "./correo.mjs";

const COSTO_BCRYPT = 12;
const HASH_FALSO = bcrypt.hashSync("no-es-una-cuenta", 4);  // iguala el tiempo de respuesta cuando el correo no existe
const CORREO_OK = /^\S+@\S+\.\S+$/;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Los mensajes en inglés son códigos que el frontend traduce (ver mensajeError en app/src/lib/api.ts)
const E = {
  credenciales: "Invalid login credentials",
  sinConfirmar: "Email not confirmed",
  existe: "User already registered",
  clave: "Password should be at least 8 characters",
};

// ---------- Límite de intentos (en memoria; basta para un solo servidor) ----------
const intentos = new Map();
export function limitar(clave, max, ventanaMs) {
  const ahora = Date.now();
  const ya = (intentos.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (ya.length >= max) { intentos.set(clave, ya); return false; }
  ya.push(ahora); intentos.set(clave, ya);
  return true;
}
setInterval(() => { const ahora = Date.now(); for (const [k, v] of intentos) if (!v.some((t) => ahora - t < 3600_000)) intentos.delete(k); }, 600_000).unref();
const limite = (req, nombre, max, ms, extra = "") => {
  if (!limitar(`${nombre}|${req.ip}|${extra}`, max, ms)) throw new ErrorNegocio("Demasiados intentos. Espera un minuto y vuelve a intentarlo.", 429);
};

// ---------- Sesión (JWT) ----------
export const firmar = (usuario) => jwt.sign({ sub: usuario.id, em: usuario.correo }, config.jwtSecreto, { expiresIn: `${config.jwtDias}d` });
const respuestaSesion = (usuario) => ({ token: firmar(usuario), user: { id: usuario.id, email: usuario.correo } });

/** Middleware: exige sesión válida y carga el perfil actual (rol, empresa, estado) desde la base de datos. */
export async function requiereSesion(req, res, next) {
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    if (!m) throw new ErrorNegocio("Sesión requerida.", 401);
    let p;
    try { p = jwt.verify(m[1], config.jwtSecreto, { algorithms: ["HS256"] }); }
    catch { throw new ErrorNegocio("La sesión venció. Inicia sesión de nuevo.", 401); }
    const [[perfil]] = await pool.query("SELECT id, rol, empresa_id, area_id, estado, correo FROM perfiles WHERE id = ?", [p.sub]);
    if (!perfil) throw new ErrorNegocio("La sesión no es válida.", 401);
    req.u = perfil;
    // Renovación deslizante: si el token tiene más de un día, se entrega uno nuevo
    if (Date.now() / 1000 - p.iat > 86400) res.setHeader("X-Token-Renovado", firmar({ id: perfil.id, correo: perfil.correo }));
    next();
  } catch (e) {
    const { estado, mensaje } = mensajeDeError(e);
    res.status(estado).json({ data: null, error: { message: mensaje } });
  }
}

// ---------- Tokens de un solo uso ----------
async function crearToken(con, usuarioId, tipo, horas) {
  const token = crypto.randomBytes(32).toString("hex");
  await con.query("DELETE FROM tokens WHERE usuario_id = ? AND tipo = ?", [usuarioId, tipo]);
  await con.query("INSERT INTO tokens (usuario_id, tipo, hash, expira) VALUES (?, ?, ?, ?)",
    [usuarioId, tipo, sha256(token), new Date(Date.now() + horas * 3600_000)]);
  return token;
}
export const crearTokenInvitacion = (con, usuarioId) => crearToken(con, usuarioId, "invitar", 24 * 7);
export const enlaceDe = (tipo, token) =>
  tipo === "confirmar" ? `${config.appUrl}/api/auth/confirmar?token=${token}`
                       : `${config.appUrl}/nueva-contrasena#type=${tipo === "invitar" ? "invite" : "recovery"}&token=${token}`;

async function consumirToken(con, token, tipos) {
  const [[t]] = await con.query(
    `SELECT id, usuario_id, tipo FROM tokens WHERE hash = ? AND usado = 0 AND expira > NOW(3) AND tipo IN (${tipos.map(() => "?").join(",")}) FOR UPDATE`,
    [sha256(String(token ?? "")), ...tipos]);
  if (!t) throw new ErrorNegocio("El enlace venció o ya se usó. Solicita uno nuevo.", 400);
  await con.query("UPDATE tokens SET usado = 1 WHERE id = ?", [t.id]);
  return t;
}

const validarClave = (c) => { if (typeof c !== "string" || c.length < 8) throw new ErrorNegocio(E.clave, 400); if (c.length > 200) throw new ErrorNegocio("Contraseña demasiado larga.", 400); };

// ---------- Rutas ----------
const envolver = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { const { estado, mensaje } = mensajeDeError(e); res.status(estado).json({ data: null, error: { message: mensaje } }); }
};

export function rutasAuth(app) {
  app.post("/api/auth/login", envolver(async (req) => {
    const correo = String(req.body?.email ?? "").trim().toLowerCase();
    const clave = String(req.body?.password ?? "");
    limite(req, "login", 10, 15 * 60_000, correo);
    const [[u]] = await pool.query("SELECT id, correo, hash, confirmado FROM usuarios WHERE correo = ?", [correo]);
    const ok = await bcrypt.compare(clave, u?.hash ?? HASH_FALSO);
    if (!u || !ok) throw new ErrorNegocio(E.credenciales, 400);
    if (!u.confirmado) throw new ErrorNegocio(E.sinConfirmar, 400);
    const [[p]] = await pool.query("SELECT 1 AS ok FROM perfiles WHERE id = ?", [u.id]);
    if (!p) throw new ErrorNegocio(E.credenciales, 400);
    return { data: respuestaSesion(u), error: null };
  }));

  // Registro con código de empresa (las cuentas del equipo de WellPeak se crean con «npm run admin»)
  app.post("/api/auth/signup", envolver(async (req) => {
    limite(req, "signup", 10, 60 * 60_000);
    const b = req.body ?? {};
    const correo = String(b.email ?? "").trim().toLowerCase();
    if (!CORREO_OK.test(correo) || correo.length > 255) throw new ErrorNegocio("Escribe un correo válido.");
    validarClave(b.password);
    const d = b.data ?? {};
    const nombre = String(d.nombre ?? "").trim().slice(0, 100), apellido = String(d.apellido ?? "").trim().slice(0, 100);
    if (!nombre || !apellido) throw new ErrorNegocio("Escribe tu nombre y apellidos.");

    const [[emp]] = await pool.query("SELECT id FROM empresas WHERE UPPER(codigo) = UPPER(?)", [String(d.codigo ?? "").trim()]);
    if (!emp) throw new ErrorNegocio("Código de empresa no válido");
    const [[area]] = await pool.query("SELECT id FROM areas WHERE id = ? AND empresa_id = ?", [String(d.area_id ?? ""), emp.id]);
    if (!area) throw new ErrorNegocio("El área no pertenece a la empresa");

    const hash = await bcrypt.hash(b.password, COSTO_BCRYPT);
    const id = crypto.randomUUID();
    const confirmar = config.confirmarCorreo;
    let token = null;
    await transaccion(async (con) => {
      const [[ya]] = await con.query("SELECT 1 AS ok FROM usuarios WHERE correo = ?", [correo]);
      if (ya) throw new ErrorNegocio(E.existe);
      await con.query("INSERT INTO usuarios (id, correo, hash, confirmado) VALUES (?, ?, ?, ?)", [id, correo, hash, confirmar ? 0 : 1]);
      await con.query("INSERT INTO perfiles (id, correo, nombre, apellido, empresa_id, area_id, estado) VALUES (?, ?, ?, ?, ?, ?, 'Activo')",
        [id, correo, nombre, apellido, emp.id, area.id]);
      if (confirmar) token = await crearToken(con, id, "confirmar", 48);
    });
    if (confirmar) {
      await enviarEnlace("confirmar", correo, enlaceDe("confirmar", token), nombre).catch((e) => console.error("[correo]", e.message));
      return { data: { session: null }, error: null };
    }
    return { data: { session: respuestaSesion({ id, correo }) }, error: null };
  }));

  app.get("/api/auth/confirmar", async (req, res) => {
    try {
      await transaccion(async (con) => {
        const t = await consumirToken(con, req.query.token, ["confirmar"]);
        await con.query("UPDATE usuarios SET confirmado = 1 WHERE id = ?", [t.usuario_id]);
      });
    } catch { /* enlace vencido: igual se manda a iniciar sesión */ }
    res.redirect("/entrar");
  });

  // Siempre responde igual, exista o no la cuenta (no revela qué correos están registrados)
  app.post("/api/auth/recuperar", envolver(async (req) => {
    const correo = String(req.body?.email ?? "").trim().toLowerCase();
    limite(req, "recuperar", 5, 15 * 60_000, correo);
    const [[u]] = await pool.query("SELECT u.id, u.correo, p.nombre FROM usuarios u JOIN perfiles p ON p.id = u.id WHERE u.correo = ?", [correo]);
    if (u) {
      const token = await transaccion((con) => crearToken(con, u.id, "recuperar", 1));
      await enviarEnlace("recuperar", u.correo, enlaceDe("recuperar", token), u.nombre ?? "").catch((e) => console.error("[correo]", e.message));
    }
    return { data: { ok: true }, error: null };
  }));

  // Define la contraseña con el enlace de invitación o de recuperación y abre sesión
  app.post("/api/auth/restablecer", envolver(async (req) => {
    limite(req, "restablecer", 10, 15 * 60_000);
    validarClave(req.body?.password);
    const hash = await bcrypt.hash(req.body.password, COSTO_BCRYPT);
    const usuario = await transaccion(async (con) => {
      const t = await consumirToken(con, req.body?.token, ["recuperar", "invitar"]);
      await con.query("UPDATE usuarios SET hash = ?, confirmado = 1 WHERE id = ?", [hash, t.usuario_id]);
      await con.query("UPDATE perfiles SET estado = 'Activo' WHERE id = ? AND estado = 'Invitado'", [t.usuario_id]);
      const [[u]] = await con.query("SELECT id, correo FROM usuarios WHERE id = ?", [t.usuario_id]);
      return u;
    });
    return { data: respuestaSesion(usuario), error: null };
  }));

  app.post("/api/auth/clave", requiereSesion, envolver(async (req) => {
    validarClave(req.body?.password);
    await pool.query("UPDATE usuarios SET hash = ? WHERE id = ?", [await bcrypt.hash(req.body.password, COSTO_BCRYPT), req.u.id]);
    return { data: { ok: true }, error: null };
  }));

  app.get("/api/auth/yo", requiereSesion, (req, res) => res.json({ data: { user: { id: req.u.id, email: req.u.correo } }, error: null }));
}
