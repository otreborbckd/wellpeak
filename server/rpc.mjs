// PULSE · POST /api/rpc/:funcion — lógica de negocio (antes funciones SQL de Supabase)
import { pool, transaccion, ErrorNegocio, mensajeDeError } from "./db.mjs";
import { esStaff, puedeEditarContenido, esAnalistaDe } from "./permisos.mjs";
import { calcularResultados, calcularComentarios, UMBRAL_CONFIDENCIALIDAD } from "./agregados.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v, campo = "id") => { if (!UUID.test(String(v ?? ""))) throw new ErrorNegocio(`${campo} no válido`); return v; };
const uuidOpc = (v, campo) => (v == null ? null : uuid(v, campo));

// ---------- Públicas (sin sesión) ----------
async function empresa_por_codigo({ p_codigo }) {
  const codigo = String(p_codigo ?? "").trim();
  if (!codigo || codigo.length > 60) return [];
  const [emp] = await pool.query("SELECT id, nombre, sigla, color, logo_url FROM empresas WHERE UPPER(codigo) = UPPER(?)", [codigo]);
  if (!emp.length) return [];
  const [areas] = await pool.query("SELECT id, nombre FROM areas WHERE empresa_id = ? ORDER BY nombre", [emp[0].id]);
  const { id, ...resto } = emp[0];
  return [{ empresa_id: id, ...resto, areas }];
}

// ---------- Colaborador ----------
async function aceptar_aviso(_a, u) {
  await pool.query("UPDATE perfiles SET aviso_aceptado_at = NOW(3) WHERE id = ? AND aviso_aceptado_at IS NULL", [u.id]);
  return null;
}

async function enviar_respuestas({ p_cuestionario, p_valores, p_modulo = null, p_evento = null }, u) {
  uuid(p_cuestionario, "Cuestionario"); uuidOpc(p_modulo, "Módulo"); uuidOpc(p_evento, "Evento");
  if (u.estado === "Suspendido") throw new ErrorNegocio("Acceso restringido", 403);
  if (!p_valores || typeof p_valores !== "object" || Array.isArray(p_valores)) throw new ErrorNegocio("Respuestas no válidas");

  return transaccion(async (con) => {
    const [[q]] = await con.query("SELECT tipo FROM cuestionarios WHERE id = ?", [p_cuestionario]);
    if (!q) throw new ErrorNegocio("Cuestionario no encontrado");
    const [reactivos] = await con.query("SELECT id, tipo FROM reactivos WHERE cuestionario_id = ?", [p_cuestionario]);
    const ids = new Set(reactivos.map((r) => r.id));

    // Sólo reactivos del cuestionario
    if (Object.keys(p_valores).some((k) => !ids.has(k))) throw new ErrorNegocio("Respuestas no válidas");
    // Escala 1 a 5
    for (const r of reactivos) {
      if (r.tipo === "likert" && r.id in p_valores) {
        const v = p_valores[r.id];
        if (typeof v !== "number" || ![1, 2, 3, 4, 5].includes(v)) throw new ErrorNegocio("Valor fuera de escala");
      }
    }
    // Obligatorias: todas salvo las abiertas
    if (reactivos.some((r) => r.tipo !== "abierta" && !(r.id in p_valores))) throw new ErrorNegocio("Faltan respuestas");
    // El diagnóstico de clima se responde una sola vez
    if (q.tipo === "clima") {
      const [ya] = await con.query("SELECT 1 FROM respuestas WHERE perfil_id = ? AND cuestionario_id = ?", [u.id, p_cuestionario]);
      if (ya.length) throw new ErrorNegocio("Este cuestionario ya fue respondido");
    }
    if (p_modulo) {
      const [m] = await con.query("SELECT 1 FROM modulos WHERE id = ? AND evaluacion_id = ?", [p_modulo, p_cuestionario]);
      if (!m.length) throw new ErrorNegocio("La evaluación no corresponde al módulo");
    }

    await con.query(
      `INSERT INTO respuestas (id, perfil_id, cuestionario_id, valores, empresa_id, area_id, evento_id)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE valores = VALUES(valores), created_at = NOW(3)`,
      [u.id, p_cuestionario, JSON.stringify(p_valores), u.empresa_id, u.area_id, p_evento]);
    await con.query("DELETE FROM borradores WHERE perfil_id = ? AND cuestionario_id = ?", [u.id, p_cuestionario]);
    if (p_modulo) await con.query("INSERT IGNORE INTO avance (perfil_id, modulo_id) VALUES (?, ?)", [u.id, p_modulo]);

    const [[fila]] = await con.query("SELECT id FROM respuestas WHERE perfil_id = ? AND cuestionario_id = ?", [u.id, p_cuestionario]);
    return fila.id;
  });
}

// Módulos sin evaluación se marcan como vistos
async function completar_modulo({ p_modulo }, u) {
  uuid(p_modulo, "Módulo");
  const [[m]] = await pool.query("SELECT evaluacion_id FROM modulos WHERE id = ?", [p_modulo]);
  if (!m) throw new ErrorNegocio("Módulo no encontrado");
  if (m.evaluacion_id) throw new ErrorNegocio("Este módulo se completa al enviar su evaluación");
  await pool.query("INSERT IGNORE INTO avance (perfil_id, modulo_id) VALUES (?, ?)", [u.id, p_modulo]);
  return null;
}

// Retroalimentación de una evaluación de módulo, sólo después de responderla
async function resultado_evaluacion({ p_cuestionario }, u) {
  uuid(p_cuestionario, "Cuestionario");
  const [filas] = await pool.query(
    `SELECT r.id AS reactivo_id, r.orden, r.tipo, r.texto, r.opciones, r.correcta, x.valores
       FROM reactivos r JOIN respuestas x ON x.cuestionario_id = r.cuestionario_id AND x.perfil_id = ?
      WHERE r.cuestionario_id = ? ORDER BY r.orden`, [u.id, p_cuestionario]);
  return filas.map(({ valores, ...f }) => ({ ...f, mi_respuesta: valores?.[f.reactivo_id] ?? null }));
}

// ---------- Staff ----------
async function reactivos_completos({ p_cuestionario }, u) {
  if (!puedeEditarContenido(u)) throw new ErrorNegocio("Sin acceso", 403);
  uuid(p_cuestionario, "Cuestionario");
  const [f] = await pool.query("SELECT * FROM reactivos WHERE cuestionario_id = ? ORDER BY orden", [p_cuestionario]);
  return f;
}

async function registrar({ p_accion }, u) {
  if (!esStaff(u)) return null;
  await pool.query("INSERT INTO bitacora (perfil_id, accion) VALUES (?, ?)", [u.id, String(p_accion ?? "").slice(0, 500)]);
  return null;
}

async function datosDiagnostico(empresaId) {
  const [diagF] = await pool.query("SELECT cuestionario_id FROM empresa_diagnostico WHERE empresa_id = ?", [empresaId]);
  return diagF.map((d) => d.cuestionario_id);
}

async function resultados_empresa({ p_empresa, p_area = null }, u) {
  uuid(p_empresa, "Empresa"); uuidOpc(p_area, "Área");
  if (!(await esAnalistaDe(u, p_empresa))) throw new ErrorNegocio("Sin acceso a resultados de esta empresa", 403);
  const diag = await datosDiagnostico(p_empresa);

  const [colaboradores] = await pool.query(
    `SELECT id, area_id FROM perfiles WHERE empresa_id = ? AND rol = 'colaborador' ${p_area ? "AND area_id = ?" : ""}`,
    p_area ? [p_empresa, p_area] : [p_empresa]);
  const [areas] = await pool.query(
    `SELECT id, nombre FROM areas WHERE empresa_id = ? ${p_area ? "AND id = ?" : ""}`, p_area ? [p_empresa, p_area] : [p_empresa]);
  const respuestas = diag.length
    ? (await pool.query(`SELECT perfil_id, cuestionario_id, valores FROM respuestas WHERE cuestionario_id IN (${diag.map(() => "?").join(",")})
                         AND perfil_id IN (SELECT id FROM perfiles WHERE empresa_id = ?)`, [...diag, p_empresa]))[0]
    : [];
  const reactivos = diag.length
    ? (await pool.query(`SELECT id, cuestionario_id, tipo, dimension FROM reactivos WHERE cuestionario_id IN (${diag.map(() => "?").join(",")})`, diag))[0]
    : [];
  return calcularResultados({ diag, colaboradores, areas, respuestas, reactivos });
}

async function comentarios_empresa({ p_empresa }, u) {
  uuid(p_empresa, "Empresa");
  if (!(await esAnalistaDe(u, p_empresa))) throw new ErrorNegocio("Sin acceso a resultados de esta empresa", 403);
  const diag = await datosDiagnostico(p_empresa);
  if (!diag.length) return [];
  const marcas = diag.map(() => "?").join(",");
  const [respuestas] = await pool.query(
    `SELECT perfil_id, cuestionario_id, area_id, valores FROM respuestas WHERE empresa_id = ? AND cuestionario_id IN (${marcas})`, [p_empresa, ...diag]);
  const [reactivos] = await pool.query(`SELECT id, cuestionario_id, tipo, texto FROM reactivos WHERE tipo = 'abierta' AND cuestionario_id IN (${marcas})`, diag);
  const [areas] = await pool.query("SELECT id, nombre FROM areas WHERE empresa_id = ?", [p_empresa]);
  return calcularComentarios({ diag, respuestas, reactivos, areas });
}

const umbral_confidencialidad = async () => UMBRAL_CONFIDENCIALIDAD;

const FUNCIONES = {
  aceptar_aviso, enviar_respuestas, completar_modulo, resultado_evaluacion,
  reactivos_completos, registrar, resultados_empresa, comentarios_empresa, umbral_confidencialidad,
};
const PUBLICAS = { empresa_por_codigo };

/** POST /api/rpc/:fn — `req.u` existe sólo si la función exige sesión (ver index.mjs). */
export async function manejarRpc(req, res) {
  const nombre = req.params.fn;
  const fn = Object.prototype.hasOwnProperty.call(PUBLICAS, nombre) ? PUBLICAS[nombre]
           : Object.prototype.hasOwnProperty.call(FUNCIONES, nombre) ? FUNCIONES[nombre] : null;
  if (!fn) return res.status(404).json({ data: null, error: { message: "Función no encontrada." } });
  try {
    const data = await fn(req.body?.args ?? {}, req.u);
    res.json({ data, error: null });
  } catch (e) {
    const { estado, mensaje } = mensajeDeError(e);
    res.status(estado).json({ data: null, error: { message: mensaje } });
  }
}
export const esPublica = (nombre) => Object.prototype.hasOwnProperty.call(PUBLICAS, nombre);
