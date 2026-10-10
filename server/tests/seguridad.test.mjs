// Pruebas de permisos de la API de datos y de las funciones de negocio.
// No necesitan MySQL: se sustituyen las consultas por un registro y se comprueba qué SQL se habría ejecutado
// y que las operaciones prohibidas se rechazan ANTES de tocar la base de datos.
import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db.mjs";
import { manejarDb } from "../datos.mjs";
import { manejarRpc } from "../rpc.mjs";
import { analistaDe, staffDe, literalUuid, T, F, TABLAS } from "../permisos.mjs";

const E1 = "00000000-0000-4000-a000-0000000000e1";
const OTRO = "99999999-0000-4000-a000-000000000009";
const usuario = (rol) => ({
  id: "11111111-0000-4000-a000-00000000000" + { superadmin: 1, consultor: 2, editor: 3, colaborador: 4 }[rol],
  rol, empresa_id: rol === "colaborador" ? E1 : null, area_id: null, estado: "Activo",
});
const colab = usuario("colaborador"), consultor = usuario("consultor"), editor = usuario("editor"), admin = usuario("superadmin");

let sql = [];
let filasPorDefecto = [];
const conexion = {
  beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
  query: async (s, p) => { sql.push({ s, p }); return [filasPorDefecto, []]; },
};
pool.getConnection = async () => conexion;
pool.query = async (s, p) => {
  sql.push({ s, p });
  const lit = /WHERE '([0-9a-f-]{36})' = \?/.exec(s);          // comprobación de borradores.perfil_id
  if (lit) return [lit[1] === p[0] ? [{ ok: 1 }] : [], []];
  if (/FROM DUAL WHERE 1=0$/.test(s)) return [[], []];          // regla «denegado»
  if (/FROM DUAL WHERE/.test(s)) return [[{ ok: 1 }], []];      // regla «permitido» (consulta de asignación simulada)
  return [filasPorDefecto, []];
};
const reiniciar = (filas = []) => { sql = []; filasPorDefecto = filas; };

const respuestaFalsa = () => ({ codigo: 200, status(n) { this.codigo = n; return this; }, json(b) { this.cuerpo = b; return this; } });
async function db(u, cuerpo) { const res = respuestaFalsa(); await manejarDb({ u, body: cuerpo }, res); return res; }
async function rpc(u, fn, args) { const res = respuestaFalsa(); await manejarRpc({ u, params: { fn }, body: { args } }, res); return res; }

// ---------- Lectura ----------
test("nadie lee la respuesta correcta por la API de datos", async () => {
  reiniciar();
  for (const u of [colab, consultor, editor, admin]) {
    assert.equal((await db(u, { tabla: "reactivos", op: "select", columnas: "id,correcta" })).codigo, 403);
    assert.equal((await db(u, { tabla: "reactivos", op: "select", columnas: "*", filtros: [["correcta", "eq", 1]] })).codigo, 400, "tampoco se puede filtrar por ella");
  }
  assert.equal(sql.length, 0, "no debe tocar la base de datos");
  await db(colab, { tabla: "reactivos", op: "select", columnas: "*" });
  assert.ok(!/correcta/.test(sql[0].s), "select * no incluye correcta");
});

test("el colaborador sólo ve su propia empresa; el suspendido no ve ninguna", async () => {
  reiniciar();
  await db(colab, { tabla: "empresas", op: "select", columnas: "*" });
  assert.ok(sql[0].p.includes(E1));
  assert.ok(!/staff_empresas/.test(sql[0].s));
  reiniciar();
  await db({ ...colab, estado: "Suspendido" }, { tabla: "empresas", op: "select", columnas: "*" });
  assert.ok(!sql[0].p.includes(E1));
  assert.match(sql[0].s, /1=0/);
});

test("el consultor ve sólo empresas asignadas; el superadmin todas", async () => {
  reiniciar();
  await db(consultor, { tabla: "empresas", op: "select", columnas: "*" });
  assert.match(sql[0].s, /staff_empresas/);
  reiniciar();
  await db(admin, { tabla: "empresas", op: "select", columnas: "*" });
  assert.ok(!/staff_empresas/.test(sql[0].s));
});

test("el colaborador ve sólo sus respuestas; el editor no ve resultados de nadie", async () => {
  reiniciar();
  await db(colab, { tabla: "respuestas", op: "select", columnas: "*" });
  assert.ok(sql[0].p.includes(colab.id));
  reiniciar();
  await db(editor, { tabla: "respuestas", op: "select", columnas: "*" });
  assert.ok(!/staff_empresas/.test(sql[0].s), "el editor no es analista de ninguna empresa");
  reiniciar();
  await db(consultor, { tabla: "respuestas", op: "select", columnas: "*" });
  assert.match(sql[0].s, /staff_empresas/, "el consultor sí, de sus empresas");
});

test("bitácora: sólo el staff la lee", async () => {
  reiniciar();
  await db(colab, { tabla: "bitacora", op: "select", columnas: "*" });
  assert.match(sql[0].s, /1=0/);
});

test("recursos: el colaborador sólo ve los publicados de su empresa", async () => {
  reiniciar();
  await db(colab, { tabla: "recursos", op: "select", columnas: "*" });
  assert.match(sql[0].s, /publicado = 1/);
  reiniciar();
  await db(editor, { tabla: "recursos", op: "select", columnas: "*" });
  assert.ok(!/publicado = 1/.test(sql[0].s));
});

// ---------- Escritura ----------
test("el colaborador no puede escribir contenido, empresas, respuestas ni avance", async () => {
  reiniciar();
  const casos = [
    { tabla: "cuestionarios", op: "insert", valores: { nombre: "x", tipo: "clima" } },
    { tabla: "programas", op: "update", valores: { estado: "Publicado" }, filtros: [["id", "eq", OTRO]] },
    { tabla: "empresas", op: "insert", valores: { nombre: "x", codigo: "X" } },
    { tabla: "empresas", op: "delete", filtros: [["id", "eq", E1]] },
    { tabla: "respuestas", op: "insert", valores: { perfil_id: colab.id, cuestionario_id: OTRO, valores: {} } },
    { tabla: "avance", op: "insert", valores: { perfil_id: colab.id, modulo_id: OTRO } },
    { tabla: "bitacora", op: "insert", valores: { accion: "x" } },
    { tabla: "perfiles", op: "insert", valores: { nombre: "x" } },
    { tabla: "perfiles", op: "update", valores: { rol: "superadmin" }, filtros: [["id", "eq", colab.id]] },
  ];
  for (const c of casos) assert.equal((await db(colab, c)).codigo, 403, `${c.op} ${c.tabla}`);
  assert.equal(sql.length, 0);
});

test("el consultor no puede hacerse superadmin ni mover personas; el editor no administra empresas", async () => {
  reiniciar();
  assert.equal((await db(consultor, { tabla: "perfiles", op: "update", valores: { rol: "superadmin" }, filtros: [["id", "eq", OTRO]] })).codigo, 403);
  assert.equal((await db(consultor, { tabla: "perfiles", op: "update", valores: { empresa_id: OTRO }, filtros: [["id", "eq", OTRO]] })).codigo, 403);
  assert.equal((await db(consultor, { tabla: "empresas", op: "insert", valores: { nombre: "x", codigo: "X" } })).codigo, 403);
  assert.equal((await db(editor, { tabla: "empresas", op: "update", valores: { nombre: "x" }, filtros: [["id", "eq", E1]] })).codigo, 403);
  assert.equal(sql.length, 0);
});

test("el consultor sí suspende a colaboradores de sus empresas (sólo filas con rol colaborador)", async () => {
  reiniciar();
  const r = await db(consultor, { tabla: "perfiles", op: "update", valores: { estado: "Suspendido" }, filtros: [["id", "eq", OTRO]] });
  assert.equal(r.codigo, 200);
  assert.match(sql[0].s, /rol = 'colaborador'/);
  assert.match(sql[0].s, /staff_empresas/);
});

test("el editor puede crear contenido; la inserción devuelve el id generado", async () => {
  reiniciar([{ id: "x" }]);
  const r = await db(editor, { tabla: "programas", op: "insert", valores: { nombre: "P" }, retorno: "id", modo: "single" });
  assert.equal(r.codigo, 200);
  assert.match(sql[0].s, /^INSERT INTO `programas`/);
  assert.ok(sql[0].p.some((v) => /^[0-9a-f-]{36}$/.test(v)));
});

test("areas/eventos: sólo el analista de la empresa destino puede insertar", async () => {
  reiniciar();
  assert.equal((await db(colab, { tabla: "areas", op: "insert", valores: { empresa_id: E1, nombre: "x" } })).codigo, 403);
  assert.equal((await db(editor, { tabla: "eventos", op: "insert", valores: { empresa_id: E1, nombre: "x" } })).codigo, 403);
  assert.equal((await db(admin, { tabla: "areas", op: "insert", valores: { empresa_id: E1, nombre: "x" } })).codigo, 200);
  assert.equal((await db(consultor, { tabla: "areas", op: "insert", valores: { empresa_id: E1, nombre: "y" } })).codigo, 200);
});

test("borradores: sólo propios (aunque se envíe otro perfil_id)", async () => {
  reiniciar();
  const ajeno = await db(colab, { tabla: "borradores", op: "upsert", valores: { perfil_id: OTRO, cuestionario_id: OTRO, idx: 0, valores: {} } });
  assert.equal(ajeno.codigo, 403);
  const propio = await db(colab, { tabla: "borradores", op: "upsert", valores: { perfil_id: colab.id, cuestionario_id: OTRO, idx: 1, valores: { a: 1 }, updated_at: new Date().toISOString() } });
  assert.equal(propio.codigo, 200);
  assert.ok(sql.some((x) => /ON DUPLICATE KEY UPDATE/.test(x.s)));
  reiniciar();
  await db(colab, { tabla: "borradores", op: "delete", filtros: [["cuestionario_id", "eq", OTRO]] });
  assert.ok(sql[0].p.includes(colab.id), "el borrado se limita a sus filas");
});

// ---------- Entradas maliciosas ----------
test("se rechazan tablas, columnas, operadores y filtros no válidos", async () => {
  reiniciar();
  assert.equal((await db(admin, { tabla: "usuarios", op: "select", columnas: "*" })).codigo, 400, "la tabla de contraseñas no es accesible");
  assert.equal((await db(admin, { tabla: "tokens", op: "select", columnas: "*" })).codigo, 400);
  assert.equal((await db(admin, { tabla: "perfiles", op: "select", columnas: "id; DROP TABLE perfiles" })).codigo, 400);
  assert.equal((await db(admin, { tabla: "perfiles", op: "select", columnas: "hash" })).codigo, 400);
  assert.equal((await db(admin, { tabla: "perfiles", op: "select", columnas: "*", filtros: [["id", "xx", 1]] })).codigo, 400);
  assert.equal((await db(admin, { tabla: "perfiles", op: "select", columnas: "*", filtros: [["id) OR (1=1", "eq", 1]] })).codigo, 400);
  assert.equal((await db(admin, { tabla: "perfiles", op: "select", columnas: "*", orden: [["id; --", true]] })).codigo, 400);
  assert.equal((await db(admin, { tabla: "perfiles", op: "update", valores: { estado: "Activo" } })).codigo, 400, "sin filtro no se actualiza");
  assert.equal((await db(admin, { tabla: "perfiles", op: "delete", filtros: [["id", "eq", OTRO]] })).codigo, 403, "perfiles no se borra por esta vía");
  assert.equal((await db(admin, { tabla: "constructor", op: "select", columnas: "*" })).codigo, 400);
  assert.equal(sql.length, 0);
});

test("los valores viajan como parámetros, nunca dentro del SQL", async () => {
  reiniciar();
  const malo = "x' OR '1'='1";
  await db(admin, { tabla: "empresas", op: "select", columnas: "*", filtros: [["nombre", "eq", malo]] });
  assert.ok(!sql[0].s.includes(malo));
  assert.ok(sql[0].p.includes(malo));
});

test("literalUuid sólo acepta UUID", () => {
  assert.equal(literalUuid(E1), `'${E1}'`);
  for (const x of ["'; DROP TABLE x; --", "abc", null, undefined, 5, {}]) assert.equal(literalUuid(x), "NULL");
});

test("reglas base: analista / staff por rol", () => {
  assert.equal(analistaDe(admin, "c"), T);
  assert.equal(analistaDe(colab, "c"), F);
  assert.equal(analistaDe(editor, "c"), F, "el editor no ve resultados");
  assert.match(analistaDe(consultor, "c").sql, /staff_empresas/);
  assert.match(staffDe(editor, "c").sql, /staff_empresas/);
  assert.equal(staffDe(colab, "c"), F);
});

test("columnas escribibles de perfiles según rol", () => {
  assert.ok(TABLAS.perfiles.escribibles(admin).includes("rol"));
  assert.ok(!TABLAS.perfiles.escribibles(consultor).includes("rol"));
  assert.ok(!TABLAS.perfiles.escribibles(consultor).includes("empresa_id"));
  assert.ok(!TABLAS.perfiles.escribibles(admin).includes("correo"));
});

// ---------- Funciones de negocio ----------
function simular(clima = false, yaRespondio = false) {
  conexion.query = async (s, p) => {
    sql.push({ s, p });
    if (/FROM cuestionarios WHERE id/.test(s)) return [[{ tipo: clima ? "clima" : "modulo" }], []];
    if (/FROM reactivos WHERE cuestionario_id/.test(s)) return [[{ id: "r1", tipo: "likert" }, { id: "r2", tipo: "abierta" }], []];
    if (/SELECT 1 FROM respuestas WHERE perfil_id/.test(s)) return [yaRespondio ? [{ 1: 1 }] : [], []];
    if (/SELECT id FROM respuestas/.test(s)) return [[{ id: "resp-1" }], []];
    return [[], []];
  };
}
const QID = "00000000-0000-4000-a000-000000000c01";
const msg = (r) => r.cuerpo.error.message;

test("enviar_respuestas valida escala, reactivos ajenos, obligatorias y duplicados del clima", async () => {
  reiniciar(); simular(true);
  assert.match(msg(await rpc(colab, "enviar_respuestas", { p_cuestionario: QID, p_valores: { r1: 9 } })), /fuera de escala/);
  assert.match(msg(await rpc(colab, "enviar_respuestas", { p_cuestionario: QID, p_valores: { r1: "4" } })), /fuera de escala/);
  assert.match(msg(await rpc(colab, "enviar_respuestas", { p_cuestionario: QID, p_valores: { r1: 3, zzz: 1 } })), /no válidas/);
  assert.match(msg(await rpc(colab, "enviar_respuestas", { p_cuestionario: QID, p_valores: { r2: "texto" } })), /Faltan respuestas/);
  assert.match(msg(await rpc(colab, "enviar_respuestas", { p_cuestionario: QID, p_valores: [1, 2] })), /no válidas/);
  assert.match(msg(await rpc(colab, "enviar_respuestas", { p_cuestionario: "no-es-uuid", p_valores: {} })), /no válido/);
  assert.match(msg(await rpc({ ...colab, estado: "Suspendido" }, "enviar_respuestas", { p_cuestionario: QID, p_valores: { r1: 3 } })), /restringido/);
  simular(true, true);
  assert.match(msg(await rpc(colab, "enviar_respuestas", { p_cuestionario: QID, p_valores: { r1: 3 } })), /ya fue respondido/);
  assert.ok(!sql.some((x) => /INSERT INTO respuestas/.test(x.s)), "nunca se guardó una respuesta inválida");
});

test("enviar_respuestas guarda con la empresa y el área del perfil, y limpia el borrador", async () => {
  reiniciar(); simular(true);
  const u = { ...colab, area_id: "aaaaaaaa-0000-4000-a000-00000000000a" };
  const r = await rpc(u, "enviar_respuestas", { p_cuestionario: QID, p_valores: { r1: 4, r2: "ok" } });
  assert.equal(r.codigo, 200);
  assert.equal(r.cuerpo.data, "resp-1");
  const ins = sql.find((x) => /INSERT INTO respuestas/.test(x.s));
  assert.ok(ins.p.includes(u.id) && ins.p.includes(E1) && ins.p.includes(u.area_id));
  assert.ok(sql.some((x) => /DELETE FROM borradores/.test(x.s)));
});

test("resultados y comentarios: sólo superadmin o consultor asignado", async () => {
  reiniciar();
  for (const u of [colab, editor]) {
    assert.equal((await rpc(u, "resultados_empresa", { p_empresa: E1 })).codigo, 403);
    assert.equal((await rpc(u, "comentarios_empresa", { p_empresa: E1 })).codigo, 403);
  }
  assert.equal((await rpc(admin, "resultados_empresa", { p_empresa: E1 })).codigo, 200);
  assert.equal((await rpc(consultor, "resultados_empresa", { p_empresa: E1 })).codigo, 200, "la consulta de asignación (simulada) responde que sí");
  assert.equal((await rpc(admin, "resultados_empresa", { p_empresa: "x' OR 1=1" })).codigo, 400);
});

test("funciones desconocidas o heredadas de Object no se ejecutan", async () => {
  for (const fn of ["toString", "constructor", "__proto__", "nada"]) assert.equal((await rpc(admin, fn, {})).codigo, 404);
});
