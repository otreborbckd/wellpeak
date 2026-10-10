// PULSE · reglas de acceso. Reemplazan las políticas Row Level Security (RLS) de Supabase.
// Cada regla devuelve un fragmento SQL { sql, params } que se agrega al WHERE de la consulta,
// de modo que la base de datos sólo entrega (o modifica) las filas que el usuario puede ver.
import { pool } from "./db.mjs";

export const T = { sql: "1=1", params: [] };   // permitido
export const F = { sql: "1=0", params: [] };   // denegado

export const o = (...fs) => ({ sql: "(" + fs.map((f) => f.sql).join(" OR ") + ")", params: fs.flatMap((f) => f.params) });
export const y = (...fs) => ({ sql: "(" + fs.map((f) => f.sql).join(" AND ") + ")", params: fs.flatMap((f) => f.params) });
export const igual = (col, valor) => (valor == null ? F : { sql: `${col} = ?`, params: [valor] });
export const crudo = (sql, params = []) => ({ sql, params });

// ---------- Quién es quién ----------
export const esStaff = (u) => ["superadmin", "consultor", "editor"].includes(u.rol);
export const esSuper = (u) => u.rol === "superadmin";
export const puedeEditarContenido = esStaff;
/** Empresa del usuario; nula si su cuenta está suspendida. */
export const miEmpresa = (u) => (u.estado !== "Suspendido" ? u.empresa_id : null);

const asignadas = "(SELECT empresa_id FROM staff_empresas WHERE perfil_id = ?)";

/** ¿Puede operar la empresa `col`? Superadmin: todas. Consultor o editor: las asignadas. */
export function staffDe(u, col) {
  if (esSuper(u)) return T;
  if (u.rol === "consultor" || u.rol === "editor") return crudo(`${col} IN ${asignadas}`, [u.id]);
  return F;
}

/** Superadmin o consultor de la empresa: los únicos que ven resultados y administran la empresa. */
export function analistaDe(u, col) {
  if (esSuper(u)) return T;
  if (u.rol === "consultor") return crudo(`${col} IN ${asignadas}`, [u.id]);
  return F;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Literal SQL seguro para un UUID (cualquier otra cosa se vuelve NULL y se deniega). */
export const literalUuid = (v) => (typeof v === "string" && UUID.test(v) ? `'${v}'` : "NULL");

/** ¿La empresa `empresaId` puede ser operada por este analista? (para el servidor, fuera de las tablas) */
export async function esAnalistaDe(u, empresaId) {
  if (!UUID.test(String(empresaId))) return false;
  const f = analistaDe(u, literalUuid(empresaId));
  if (f === T) return true;
  const [r] = await pool.query(`SELECT 1 AS ok FROM DUAL WHERE ${f.sql}`, f.params);
  return r.length > 0;
}

const editarContenido = (u) => (puedeEditarContenido(u) ? T : F);
const soloSuper = (u) => (esSuper(u) ? T : F);
const empresaPropiaOStaff = (col) => (u) => o(igual(col, miEmpresa(u)), staffDe(u, col));

const porEmpresaAnalista = { empresa_id: (u, lit) => analistaDe(u, lit) };

// ---------- Tablas expuestas por /api/db ----------
// cols: columnas existentes · leerCols: columnas legibles (por defecto todas) · escribibles: columnas que el cliente puede enviar
// leer/actualizar/borrar: fragmento por fila (null = no permitido) · insertar: fragmento general (null = no permitido)
// porFila: validaciones sobre el VALOR nuevo de una columna (equivalen al WITH CHECK de RLS)
export const TABLAS = {
  cuestionarios: {
    cols: ["id", "codigo", "nombre", "tipo", "instrucciones", "created_at"],
    escribibles: () => ["codigo", "nombre", "tipo", "instrucciones"],
    leer: () => T, insertar: editarContenido, actualizar: editarContenido, borrar: editarContenido,
  },
  reactivos: {
    cols: ["id", "cuestionario_id", "orden", "tipo", "texto", "opciones", "correcta", "dimension"],
    // La respuesta correcta nunca sale por esta vía; el staff la lee con la función reactivos_completos.
    leerCols: ["id", "cuestionario_id", "orden", "tipo", "texto", "opciones", "dimension"],
    escribibles: () => ["cuestionario_id", "orden", "tipo", "texto", "opciones", "correcta", "dimension"],
    json: ["opciones"],
    leer: () => T, insertar: editarContenido, actualizar: editarContenido, borrar: editarContenido,
  },
  programas: {
    cols: ["id", "nombre", "objetivo", "base_cuestionario_id", "estado", "created_at"],
    escribibles: () => ["nombre", "objetivo", "base_cuestionario_id", "estado"],
    leer: () => T, insertar: editarContenido, actualizar: editarContenido, borrar: editarContenido,
  },
  modulos: {
    cols: ["id", "programa_id", "orden", "titulo", "duracion_min", "intro", "video_path", "pdf_path", "pdf_nombre", "evaluacion_id"],
    escribibles: () => ["programa_id", "orden", "titulo", "duracion_min", "intro", "video_path", "pdf_path", "pdf_nombre", "evaluacion_id"],
    leer: () => T, insertar: editarContenido, actualizar: editarContenido, borrar: editarContenido,
  },
  empresas: {
    cols: ["id", "nombre", "sigla", "color", "logo_url", "codigo", "contacto", "estado", "programa_id", "programa_liberado", "mensaje_escuchamos", "created_at"],
    escribibles: () => ["nombre", "sigla", "color", "logo_url", "codigo", "contacto", "estado", "programa_id", "programa_liberado", "mensaje_escuchamos"],
    bool: ["programa_liberado"],
    leer: empresaPropiaOStaff("id"),
    insertar: soloSuper,
    actualizar: (u) => analistaDe(u, "id"),
    borrar: soloSuper,
  },
  areas: {
    cols: ["id", "empresa_id", "nombre", "responsable"],
    escribibles: () => ["empresa_id", "nombre", "responsable"],
    leer: empresaPropiaOStaff("empresa_id"),
    insertar: () => T, porFila: porEmpresaAnalista,
    actualizar: (u) => analistaDe(u, "empresa_id"),
    borrar: (u) => analistaDe(u, "empresa_id"),
  },
  empresa_diagnostico: {
    cols: ["empresa_id", "cuestionario_id", "orden"],
    escribibles: () => ["empresa_id", "cuestionario_id", "orden"],
    relaciones: { cuestionarios: { tabla: "cuestionarios", local: "cuestionario_id" } },
    leer: empresaPropiaOStaff("empresa_id"),
    insertar: () => T, porFila: porEmpresaAnalista,
    actualizar: (u) => analistaDe(u, "empresa_id"),
    borrar: (u) => analistaDe(u, "empresa_id"),
  },
  eventos: {
    cols: ["id", "empresa_id", "nombre", "fecha", "lugar", "cuestionario_id", "despues_de_modulo"],
    escribibles: () => ["empresa_id", "nombre", "fecha", "lugar", "cuestionario_id", "despues_de_modulo"],
    leer: empresaPropiaOStaff("empresa_id"),
    insertar: () => T, porFila: porEmpresaAnalista,
    actualizar: (u) => analistaDe(u, "empresa_id"),
    borrar: (u) => analistaDe(u, "empresa_id"),
  },
  perfiles: {
    cols: ["id", "rol", "nombre", "apellido", "correo", "empresa_id", "area_id", "puesto", "estado", "aviso_aceptado_at", "created_at"],
    // Sólo el superadmin cambia roles y empresa; los consultores gestionan a los colaboradores de sus empresas.
    escribibles: (u) => (esSuper(u) ? ["rol", "nombre", "apellido", "empresa_id", "area_id", "puesto", "estado"]
                                    : ["nombre", "apellido", "puesto", "estado", "area_id"]),
    leer: (u) => o(igual("id", u.id), esSuper(u) ? T : F, y(crudo("empresa_id IS NOT NULL"), staffDe(u, "empresa_id"))),
    insertar: () => null,   // las cuentas se crean por registro, invitación o por el programador
    actualizar: (u) => (esSuper(u) ? T : y(crudo("empresa_id IS NOT NULL AND rol = 'colaborador'"), analistaDe(u, "empresa_id"))),
    borrar: () => null,
  },
  staff_empresas: {
    cols: ["perfil_id", "empresa_id"],
    escribibles: () => ["perfil_id", "empresa_id"],
    leer: (u) => o(igual("perfil_id", u.id), esSuper(u) ? T : F),
    insertar: soloSuper, actualizar: soloSuper, borrar: soloSuper,
  },
  recursos: {
    cols: ["id", "nombre", "tipo", "path", "url", "empresa_id", "area_id", "publicado", "created_at"],
    escribibles: () => ["nombre", "tipo", "path", "url", "empresa_id", "area_id", "publicado"],
    bool: ["publicado"],
    leer: (u) => esStaff(u) ? T : y(
      crudo("publicado = 1"),
      o(crudo("empresa_id IS NULL"), igual("empresa_id", miEmpresa(u))),
      o(crudo("area_id IS NULL"), igual("area_id", u.area_id))),
    insertar: editarContenido, actualizar: editarContenido, borrar: editarContenido,
  },
  respuestas: {   // sólo lectura: se escribe con enviar_respuestas
    cols: ["id", "perfil_id", "cuestionario_id", "valores", "empresa_id", "area_id", "evento_id", "created_at"],
    escribibles: () => [],
    json: ["valores"],
    leer: (u) => o(igual("perfil_id", u.id), y(crudo("empresa_id IS NOT NULL"), analistaDe(u, "empresa_id"))),
    insertar: () => null, actualizar: () => null, borrar: () => null,
  },
  borradores: {
    cols: ["perfil_id", "cuestionario_id", "idx", "valores", "updated_at"],
    escribibles: () => ["perfil_id", "cuestionario_id", "idx", "valores", "updated_at"],
    json: ["valores"], fechas: ["updated_at"], upsert: ["perfil_id", "cuestionario_id"],
    leer: (u) => igual("perfil_id", u.id),
    insertar: () => T, porFila: { perfil_id: (u, lit) => crudo(`${lit} = ?`, [u.id]) },
    actualizar: (u) => igual("perfil_id", u.id),
    borrar: (u) => igual("perfil_id", u.id),
  },
  avance: {       // sólo lectura: se escribe con enviar_respuestas / completar_modulo
    cols: ["perfil_id", "modulo_id", "estado", "completado_at"],
    escribibles: () => [],
    leer: (u) => { const s = staffDe(u, "p.empresa_id");
      return o(igual("perfil_id", u.id),
        crudo(`EXISTS (SELECT 1 FROM perfiles p WHERE p.id = avance.perfil_id AND p.empresa_id IS NOT NULL AND ${s.sql})`, s.params)); },
    insertar: () => null, actualizar: () => null, borrar: () => null,
  },
  bitacora: {     // sólo lectura para el staff: se escribe con la función registrar
    cols: ["id", "perfil_id", "accion", "created_at"],
    escribibles: () => [],
    leer: (u) => (esStaff(u) ? T : F),
    insertar: () => null, actualizar: () => null, borrar: () => null,
  },
};
