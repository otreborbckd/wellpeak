// PULSE · POST /api/db — consultas a las tablas con las reglas de permisos.mjs ya aplicadas.
// Acepta un subconjunto de operaciones (select, insert, update, upsert, delete) con filtros simples.
import crypto from "node:crypto";
import { pool, transaccion, qi, ErrorNegocio, mensajeDeError } from "./db.mjs";
import { TABLAS, T, literalUuid } from "./permisos.mjs";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "LIKE" };
const MAX_FILAS = 10000;
const MAX_LISTA = 1000;

const denegado = () => new ErrorNegocio("No tienes permiso para esta operación.", 403);

function tablaDe(nombre) {
  const t = Object.prototype.hasOwnProperty.call(TABLAS, nombre) ? TABLAS[nombre] : null;
  if (!t) throw new ErrorNegocio("Tabla no válida.", 400);
  return t;
}
const legibles = (t) => t.leerCols ?? t.cols;

function dividirColumnas(texto) {
  const partes = []; let nivel = 0, act = "";
  for (const ch of String(texto)) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) { partes.push(act.trim()); act = ""; } else act += ch;
  }
  if (act.trim()) partes.push(act.trim());
  return partes;
}

/** Lee "a, b, rel(*)" → { cols, embebidos } validando contra la lista blanca. */
function analizarColumnas(t, texto) {
  const cols = [], embebidos = [];
  for (const p of dividirColumnas(texto || "*")) {
    if (p === "*") { cols.push(...legibles(t)); continue; }
    const m = p.match(/^([A-Za-z_]\w*)\((.*)\)$/);
    if (m) {
      const rel = t.relaciones?.[m[1]];
      if (!rel) throw new ErrorNegocio(`Relación no válida: ${m[1]}`);
      embebidos.push({ nombre: m[1], ...rel, columnas: m[2] });
      continue;
    }
    if (!IDENT.test(p) || !t.cols.includes(p)) throw new ErrorNegocio(`Columna no válida: ${p}`);
    if (!legibles(t).includes(p)) throw denegado();     // p. ej. reactivos.correcta
    cols.push(p);
  }
  return { cols: [...new Set(cols)], embebidos };
}

function construirFiltros(t, filtros = []) {
  const sql = [], params = [];
  for (const f of filtros) {
    if (!Array.isArray(f) || f.length !== 3) throw new ErrorNegocio("Filtro no válido.");
    const [col, op, val] = f;
    if (!IDENT.test(col) || !legibles(t).includes(col)) throw new ErrorNegocio(`Columna no válida en filtro: ${col}`);
    if (op === "in") {
      if (!Array.isArray(val) || val.length > MAX_LISTA) throw new ErrorNegocio("Lista no válida.");
      if (!val.length) { sql.push("1=0"); continue; }
      sql.push(`${qi(col)} IN (${val.map(() => "?").join(",")})`); params.push(...val);
    } else if (op === "is") {
      if (val !== null) throw new ErrorNegocio("Sólo se admite is.null.");
      sql.push(`${qi(col)} IS NULL`);
    } else if (OPS[op]) {
      if (val === null) throw new ErrorNegocio("Usa is.null para comparar con vacío.");
      sql.push(`${qi(col)} ${OPS[op]} ?`); params.push(val);
    } else throw new ErrorNegocio(`Operador no válido: ${op}`);
  }
  return { sql: sql.length ? sql.join(" AND ") : "1=1", params };
}

function normalizarSalida(t, fila) {
  for (const c of t.bool ?? []) if (c in fila && fila[c] != null) fila[c] = !!fila[c];
  return fila;
}

async function seleccionar(u, nombre, { columnas, filtros, orden, limite }, con = pool) {
  const t = tablaDe(nombre);
  const { cols, embebidos } = analizarColumnas(t, columnas);
  const extra = embebidos.map((e) => e.local).filter((c) => !cols.includes(c));
  const todas = [...cols, ...extra];
  const poliza = t.leer(u);
  const fil = construirFiltros(t, filtros);

  let sql = `SELECT ${todas.map(qi).join(", ")} FROM ${qi(nombre)} WHERE (${fil.sql}) AND ${poliza.sql}`;
  const params = [...fil.params, ...poliza.params];

  const ord = [];
  for (const [col, asc] of orden ?? []) {
    if (!IDENT.test(col) || !legibles(t).includes(col)) throw new ErrorNegocio(`Columna no válida para ordenar: ${col}`);
    // Mismo criterio que PostgreSQL: los vacíos van al final en ascendente y al principio en descendente
    ord.push(asc === false ? `${qi(col)} IS NULL DESC, ${qi(col)} DESC` : `${qi(col)} IS NULL, ${qi(col)} ASC`);
  }
  if (ord.length) sql += ` ORDER BY ${ord.join(", ")}`;
  sql += ` LIMIT ${Math.min(Math.max(parseInt(limite, 10) || MAX_FILAS, 1), MAX_FILAS)}`;

  const [filas] = await con.query(sql, params);
  filas.forEach((f) => normalizarSalida(t, f));

  for (const e of embebidos) {
    const ids = [...new Set(filas.map((f) => f[e.local]).filter((v) => v != null))];
    const mapa = new Map();
    if (ids.length) {
      const destino = tablaDe(e.tabla);
      const { cols: cd } = analizarColumnas(destino, e.columnas);
      const pol = destino.leer(u);
      const [rel] = await con.query(
        `SELECT ${[...new Set([...cd, "id"])].map(qi).join(", ")} FROM ${qi(e.tabla)} WHERE id IN (${ids.map(() => "?").join(",")}) AND ${pol.sql}`,
        [...ids, ...pol.params]);
      rel.forEach((r) => mapa.set(r.id, normalizarSalida(destino, r)));
    }
    filas.forEach((f) => { f[e.nombre] = mapa.get(f[e.local]) ?? null; });
  }
  if (extra.length) filas.forEach((f) => extra.forEach((c) => delete f[c]));
  return filas;
}

/** Convierte los valores del cliente a lo que MySQL espera y descarta columnas no permitidas. */
function prepararValores(u, t, valores) {
  if (!valores || typeof valores !== "object" || Array.isArray(valores)) throw new ErrorNegocio("Datos no válidos.");
  const permitidas = t.escribibles(u);
  const salida = {};
  for (const [c, v] of Object.entries(valores)) {
    if (!IDENT.test(c) || !t.cols.includes(c)) throw new ErrorNegocio(`Columna no válida: ${c}`);
    if (!permitidas.includes(c)) throw denegado();
    if (v === undefined) continue;
    if (t.json?.includes(c)) salida[c] = v === null ? null : JSON.stringify(v);
    else if (t.fechas?.includes(c) && typeof v === "string") {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new ErrorNegocio(`Fecha no válida en ${c}`);
      salida[c] = d;
    } else salida[c] = v;
  }
  return salida;
}

/** Equivale al WITH CHECK de RLS: valida el valor nuevo de las columnas que dependen de permisos. */
async function verificarValores(u, t, valores, esInsercion) {
  for (const [col, regla] of Object.entries(t.porFila ?? {})) {
    if (!esInsercion && !(col in valores)) continue;
    const f = regla(u, literalUuid(valores[col]));
    if (f.sql === T.sql) continue;
    const [r] = await pool.query(`SELECT 1 AS ok FROM DUAL WHERE ${f.sql}`, f.params);
    if (!r.length) throw denegado();
  }
}

async function insertar(u, nombre, { valores, retorno, modo, upsert }) {
  const t = tablaDe(nombre);
  const regla = t.insertar(u);
  if (!regla || regla.sql === "1=0") throw denegado();
  if (regla.sql !== T.sql) {
    const [r] = await pool.query(`SELECT 1 AS ok FROM DUAL WHERE ${regla.sql}`, regla.params);
    if (!r.length) throw denegado();
  }
  const lista = (Array.isArray(valores) ? valores : [valores]).map((v) => prepararValores(u, t, v));
  if (!lista.length) return null;
  if (lista.length > 200) throw new ErrorNegocio("Máximo 200 filas por operación.");
  if (upsert && !t.upsert) throw denegado();

  const ids = [];
  await transaccion(async (con) => {
    for (const fila of lista) {
      await verificarValores(u, t, fila, true);
      if (t.cols.includes("id") && fila.id === undefined) fila.id = crypto.randomUUID();
      if (fila.id !== undefined) ids.push(fila.id);
      const cols = Object.keys(fila);
      let sql = `INSERT INTO ${qi(nombre)} (${cols.map(qi).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      if (upsert) {
        const sets = cols.filter((c) => !t.upsert.includes(c)).map((c) => `${qi(c)} = VALUES(${qi(c)})`);
        sql += sets.length ? ` ON DUPLICATE KEY UPDATE ${sets.join(", ")}` : ` ON DUPLICATE KEY UPDATE ${qi(t.upsert[0])} = ${qi(t.upsert[0])}`;
      }
      await con.query(sql, cols.map((c) => fila[c]));
    }
  });

  if (!retorno || !ids.length) return null;
  const filas = await seleccionar(u, nombre, { columnas: retorno, filtros: [["id", "in", ids]] });
  return modo ? (filas[0] ?? null) : filas;
}

async function actualizar(u, nombre, { valores, filtros }) {
  const t = tablaDe(nombre);
  const regla = t.actualizar(u);
  if (!regla || regla.sql === "1=0") throw denegado();
  if (!filtros?.length) throw new ErrorNegocio("La actualización necesita al menos un filtro.");
  const v = prepararValores(u, t, valores);
  const cols = Object.keys(v);
  if (!cols.length) return null;
  await verificarValores(u, t, v, false);
  const fil = construirFiltros(t, filtros);
  await pool.query(
    `UPDATE ${qi(nombre)} SET ${cols.map((c) => `${qi(c)} = ?`).join(", ")} WHERE (${fil.sql}) AND ${regla.sql}`,
    [...cols.map((c) => v[c]), ...fil.params, ...regla.params]);
  return null;
}

async function borrar(u, nombre, { filtros }) {
  const t = tablaDe(nombre);
  const regla = t.borrar(u);
  if (!regla || regla.sql === "1=0") throw denegado();
  if (!filtros?.length) throw new ErrorNegocio("El borrado necesita al menos un filtro.");
  const fil = construirFiltros(t, filtros);
  await pool.query(`DELETE FROM ${qi(nombre)} WHERE (${fil.sql}) AND ${regla.sql}`, [...fil.params, ...regla.params]);
  return null;
}

/** Manejador de POST /api/db */
export async function manejarDb(req, res) {
  const b = req.body ?? {};
  try {
    let data = null;
    switch (b.op) {
      case "select": {
        const filas = await seleccionar(req.u, b.tabla, b);
        if (b.modo === "single") {
          if (filas.length !== 1) throw new ErrorNegocio("Se esperaba exactamente un resultado.", 406);
          data = filas[0];
        } else if (b.modo === "maybe") {
          if (filas.length > 1) throw new ErrorNegocio("Se esperaba un resultado como máximo.", 406);
          data = filas[0] ?? null;
        } else data = filas;
        break;
      }
      case "insert": data = await insertar(req.u, b.tabla, b); break;
      case "upsert": data = await insertar(req.u, b.tabla, { ...b, upsert: true }); break;
      case "update": data = await actualizar(req.u, b.tabla, b); break;
      case "delete": data = await borrar(req.u, b.tabla, b); break;
      default: throw new ErrorNegocio("Operación no válida.");
    }
    res.json({ data, error: null });
  } catch (e) {
    const { estado, mensaje } = mensajeDeError(e);
    res.status(estado).json({ data: null, error: { message: mensaje } });
  }
}
