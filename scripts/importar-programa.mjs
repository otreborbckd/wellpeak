#!/usr/bin/env node
// PULSE · importa un programa completo desde la plantilla PULSE_carga_programa.xlsx
// y la carpeta de Drive descargada (Modulo_01/video.mp4, Modulo_01/material.pdf, ...).
//
// Uso:
//   npm run importar -- --excel ./PULSE_carga_programa.xlsx --carpeta "./PULSE – Programa" [--probar] [--reemplazar]
//   (usa la base de datos y la carpeta de archivos definidas en .env)
//
//   --probar      Revisa la plantilla y los archivos sin cargar nada.
//   --reemplazar  Si ya existe un programa con el mismo nombre y nadie ha respondido sus evaluaciones, lo reemplaza.
import ExcelJS from "exceljs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pool, transaccion } from "../server/db.mjs";
import { config } from "../server/config.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) =>
  a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : []).filter((x) => x.length));
if (!args.excel || !args.carpeta) {
  console.error('Uso: node scripts/importar-programa.mjs --excel <archivo.xlsx> --carpeta <carpeta> [--probar] [--reemplazar]');
  process.exit(1);
}
const PROBAR = !!args.probar;

const texto = (c) => {
  const v = c?.value;
  if (v == null) return "";
  if (typeof v === "object") return String(v.result ?? v.text ?? v.richText?.map((r) => r.text).join("") ?? "").trim();
  return String(v).trim();
};
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);

// ---------- 1. Leer la plantilla ----------
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(args.excel);
const hp = wb.getWorksheet("Programa"), hm = wb.getWorksheet("Modulos"), hq = wb.getWorksheet("Preguntas");
if (!hp || !hm || !hq) { console.error("La plantilla debe tener las hojas Programa, Modulos y Preguntas."); process.exit(1); }

const programa = {
  nombre: texto(hp.getCell("B2")),
  objetivo: texto(hp.getCell("B3")),
  conBase: /^s/i.test(texto(hp.getCell("B5"))),
};
if (!programa.nombre) { console.error("Falta el nombre del programa (Programa!B2)."); process.exit(1); }
const PREF = slug(programa.nombre);

const modulos = [];
hm.eachRow((row, n) => {
  if (n < 3) return;
  const num = Number(texto(row.getCell(1)));
  const titulo = texto(row.getCell(2));
  if (!num || !titulo) return;
  modulos.push({
    num, titulo,
    duracion_min: Number(texto(row.getCell(3))) || null,
    intro: texto(row.getCell(4)),
    pdf_nombre: texto(row.getCell(5)) || `Material · Módulo ${num}`,
    video: `Modulo_${String(num).padStart(2, "0")}/video.mp4`,
    pdf: `Modulo_${String(num).padStart(2, "0")}/material.pdf`,
  });
});

const preguntas = new Map(); // codigo -> reactivos[]
const errores = [];
hq.eachRow((row, n) => {
  if (n < 3) return;
  const codigo = texto(row.getCell(1)).toUpperCase();
  const pregunta = texto(row.getCell(4));
  if (!codigo || !pregunta) return;
  const tipo = texto(row.getCell(3)).toLowerCase();
  if (!["likert", "multiple", "abierta"].includes(tipo)) { errores.push(`Preguntas fila ${n}: tipo «${tipo}» no válido`); return; }
  const opciones = [5, 6, 7, 8, 9].map((c) => texto(row.getCell(c))).filter(Boolean);
  const letra = texto(row.getCell(10)).toUpperCase();
  const correcta = letra ? "ABCDE".indexOf(letra) : null;
  if (tipo === "multiple" && opciones.length < 2) errores.push(`Preguntas fila ${n}: opción múltiple necesita al menos 2 opciones`);
  if (correcta !== null && (correcta < 0 || correcta >= opciones.length)) errores.push(`Preguntas fila ${n}: respuesta correcta «${letra}» fuera de las opciones`);
  const lista = preguntas.get(codigo) ?? [];
  lista.push({ orden: Number(texto(row.getCell(2))) || lista.length + 1, tipo, texto: pregunta,
    opciones: tipo === "multiple" ? opciones : null, correcta: tipo === "multiple" ? correcta : null,
    dimension: texto(row.getCell(11)) || null });
  preguntas.set(codigo, lista);
});

for (const [codigo, lista] of preguntas) {
  if (lista.length > 20) errores.push(`${codigo}: ${lista.length} preguntas (máximo 20)`);
  lista.sort((a, b) => a.orden - b.orden).forEach((r, i) => (r.orden = i + 1));
}
for (const m of modulos) {
  const codigo = `M${String(m.num).padStart(2, "0")}`;
  if (!preguntas.get(codigo)?.length) errores.push(`Módulo ${m.num}: sin preguntas de evaluación (${codigo})`);
  for (const f of [m.video, m.pdf]) if (!fs.existsSync(path.join(args.carpeta, f))) errores.push(`Falta el archivo ${f}`);
}

console.log(`Programa: ${programa.nombre}`);
console.log(`Módulos: ${modulos.length} · Cuestionarios: ${[...preguntas.keys()].join(", ") || "ninguno"}`);
if (errores.length) { console.error("\nRevisa antes de importar:\n - " + errores.join("\n - ")); process.exit(1); }
if (PROBAR) { console.log("\nPlantilla y archivos correctos. Ejecuta sin --probar para importar."); process.exit(0); }

// ---------- 2. Cargar a MySQL ----------
const [[existente]] = await pool.query("SELECT id FROM programas WHERE nombre = ?", [programa.nombre]);
if (existente) {
  if (!args.reemplazar) { console.error(`Ya existe «${programa.nombre}». Usa --reemplazar para sustituirlo.`); process.exit(1); }
  const [qs] = await pool.query("SELECT id FROM cuestionarios WHERE codigo LIKE ?", [`${PREF}-%`]);
  if (qs.length) {
    const [[r]] = await pool.query(`SELECT COUNT(*) AS n FROM respuestas WHERE cuestionario_id IN (${qs.map(() => "?").join(",")})`, qs.map((q) => q.id));
    if (r.n) { console.error("Hay respuestas de colaboradores en este programa; no se reemplaza."); process.exit(1); }
  }
  await pool.query("DELETE FROM programas WHERE id = ?", [existente.id]);
  await pool.query("DELETE FROM cuestionarios WHERE codigo LIKE ?", [`${PREF}-%`]);
}

async function crearCuestionario(con, codigo, nombre, tipo, lista) {
  const id = crypto.randomUUID();
  await con.query("INSERT INTO cuestionarios (id, codigo, nombre, tipo, instrucciones) VALUES (?, ?, ?, ?, NULL)", [id, codigo, nombre, tipo]);
  for (const r of lista) {
    await con.query("INSERT INTO reactivos (id, cuestionario_id, orden, tipo, texto, opciones, correcta, dimension) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)",
      [id, r.orden, r.tipo, r.texto, r.opciones ? JSON.stringify(r.opciones) : null, r.correcta, r.dimension]);
  }
  return id;
}

// Los archivos se copian al almacén de contenido (STORAGE_DIR/contenido); la base guarda sólo la ruta.
const carpetaStorage = `programas/${PREF.toLowerCase()}`;
function subir(local, destino) {
  const origen = path.join(args.carpeta, local);
  const mb = (fs.statSync(origen).size / 1048576).toFixed(1);
  process.stdout.write(`  copiando ${local} (${mb} MB)… `);
  const final = path.join(config.almacen, "contenido", destino);
  fs.mkdirSync(path.dirname(final), { recursive: true });
  fs.copyFileSync(origen, final);
  console.log("listo");
  return destino;
}

try {
  await transaccion(async (con) => {
    let baseId = null;
    if (preguntas.has("BASE")) baseId = await crearCuestionario(con, `${PREF}-BASE`, `Punto de partida · ${programa.nombre}`, "base", preguntas.get("BASE"));
    else if (programa.conBase) baseId = (await con.query("SELECT id FROM cuestionarios WHERE codigo = 'BASE'"))[0][0]?.id ?? null;

    for (const c of ["CLIMA1", "CLIMA2", "CLIMA3", "CLIMA4"]) {
      if (preguntas.has(c)) {
        await crearCuestionario(con, `${PREF}-${c}`, `Diagnóstico de clima · ${c.replace("CLIMA", "Parte ")}`, "clima", preguntas.get(c));
        console.log(`Diagnóstico ${PREF}-${c} creado: asígnalo a la empresa en la consola.`);
      }
    }

    const progId = crypto.randomUUID();
    await con.query("INSERT INTO programas (id, nombre, objetivo, base_cuestionario_id, estado) VALUES (?, ?, ?, ?, 'Borrador')",
      [progId, programa.nombre, programa.objetivo, baseId]);

    for (const m of modulos) {
      const n = String(m.num).padStart(2, "0");
      console.log(`Módulo ${n} · ${m.titulo}`);
      const evalId = await crearCuestionario(con, `${PREF}-M${n}`, `Evaluación · Módulo ${m.num}: ${m.titulo}`, "modulo", preguntas.get(`M${n}`));
      const video_path = subir(m.video, `${carpetaStorage}/modulo-${n}/video.mp4`);
      const pdf_path = subir(m.pdf, `${carpetaStorage}/modulo-${n}/material.pdf`);
      await con.query(
        "INSERT INTO modulos (id, programa_id, orden, titulo, duracion_min, intro, video_path, pdf_path, pdf_nombre, evaluacion_id) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [progId, m.num, m.titulo, m.duracion_min, m.intro, video_path, pdf_path, m.pdf_nombre, evalId]);
    }
  });
} catch (e) {
  console.error(`\nNo se cargó nada a la base de datos: ${e.sqlMessage ?? e.message}`);
  console.error(`(Si ya se copiaron archivos a ${path.join(config.almacen, "contenido", carpetaStorage)}, se sobrescriben al reintentar.)`);
  process.exit(1);
} finally {
  await pool.end();
}

console.log(`\nListo: «${programa.nombre}» con ${modulos.length} módulos, en estado Borrador.`);
console.log("Siguiente paso: en la consola, revísalo, márcalo como Publicado y asígnalo a la empresa.");
