// PULSE · POST /api/invitar — invita colaboradores a una empresa (alta individual o carga CSV desde la consola)
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool, transaccion, ErrorNegocio, mensajeDeError } from "./db.mjs";
import { esAnalistaDe } from "./permisos.mjs";
import { crearTokenInvitacion, enlaceDe } from "./auth.mjs";
import { enviarEnlace } from "./correo.mjs";

export async function manejarInvitar(req, res) {
  try {
    const b = req.body ?? {};
    if (!b.empresa_id || !Array.isArray(b.colaboradores)) throw new ErrorNegocio("Faltan datos");
    if (b.colaboradores.length > 500) throw new ErrorNegocio("Máximo 500 colaboradores por carga");
    // Sólo superadmin o consultor asignado a la empresa
    if (!(await esAnalistaDe(req.u, b.empresa_id))) throw new ErrorNegocio("Sin permiso para esta empresa", 403);

    const [areas] = await pool.query("SELECT id, nombre FROM areas WHERE empresa_id = ?", [b.empresa_id]);
    const porNombre = new Map(areas.map((a) => [a.nombre.trim().toLowerCase(), a.id]));
    const ids = new Set(areas.map((a) => a.id));

    let creados = 0;
    const errores = [];
    for (const f of b.colaboradores) {
      const correo = String(f.correo ?? "").trim().toLowerCase();
      const areaId = f.area_id && ids.has(f.area_id) ? f.area_id : porNombre.get(String(f.area ?? "").trim().toLowerCase());
      const nombre = String(f.nombre ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(correo)) { errores.push({ correo, motivo: "Correo no válido" }); continue; }
      if (!nombre) { errores.push({ correo, motivo: "Falta el nombre" }); continue; }
      if (!areaId) { errores.push({ correo, motivo: `Área no encontrada: ${f.area ?? ""}` }); continue; }

      let token;
      try {
        token = await transaccion(async (con) => {
          const [[ya]] = await con.query("SELECT 1 AS ok FROM usuarios WHERE correo = ?", [correo]);
          if (ya) throw new ErrorNegocio("Ya tiene cuenta");
          const id = crypto.randomUUID();
          // Contraseña aleatoria que nadie conoce: la persona define la suya con el enlace de invitación
          await con.query("INSERT INTO usuarios (id, correo, hash, confirmado) VALUES (?, ?, ?, 1)",
            [id, correo, await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 4)]);
          await con.query(
            "INSERT INTO perfiles (id, correo, nombre, apellido, empresa_id, area_id, puesto, estado, rol) VALUES (?, ?, ?, ?, ?, ?, ?, 'Invitado', 'colaborador')",
            [id, correo, nombre, String(f.apellido ?? "").trim(), b.empresa_id, areaId, f.puesto ? String(f.puesto).trim() : null]);
          return await crearTokenInvitacion(con, id);
        });
      } catch (e) { errores.push({ correo, motivo: mensajeDeError(e).mensaje }); continue; }
      creados++;
      try { await enviarEnlace("invitar", correo, enlaceDe("invitar", token), nombre); }
      catch (e) { console.error("[correo]", e.message); errores.push({ correo, motivo: "Cuenta creada, pero no se pudo enviar el correo" }); }
    }
    await pool.query("INSERT INTO bitacora (perfil_id, accion) VALUES (?, ?)", [req.u.id, `Invitó a ${creados} colaboradores`]);
    res.json({ data: { creados, errores }, error: null });
  } catch (e) {
    const { estado, mensaje } = mensajeDeError(e);
    res.status(estado).json({ data: null, error: { message: mensaje } });
  }
}
