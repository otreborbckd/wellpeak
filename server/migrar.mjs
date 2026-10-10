#!/usr/bin/env node
// PULSE · crea la base de datos (si no existe), las tablas, las reglas y los datos iniciales.
// Es seguro volver a ejecutarlo: no borra datos.
//   npm run db:migrar                esquema + reglas + datos iniciales (diagnóstico de clima, empresa demo)
//   npm run db:migrar -- --sin-seed  sólo esquema y reglas
import fs from "node:fs";
import mysql from "mysql2/promise";
import { config } from "./config.mjs";

const leer = (f) => fs.readFileSync(new URL(`../db/${f}`, import.meta.url), "utf8");
const sinSeed = process.argv.includes("--sin-seed");

const { database, ...conexion } = config.db;
if (!/^[A-Za-z0-9_]+$/.test(database)) { console.error("DB_NAME sólo puede tener letras, números y guion bajo."); process.exit(1); }

const con = await mysql.createConnection({ ...conexion, multipleStatements: true, charset: "utf8mb4" });
try {
  const [[v]] = await con.query("SELECT VERSION() AS v");
  console.log(`Conectado a MySQL ${v.v}`);
  await con.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await con.query(`USE \`${database}\``);

  await con.query(leer("esquema.sql"));
  console.log("✓ Tablas");

  // Cada sentencia de disparadores.sql termina con «//» al final de línea
  for (const sentencia of leer("disparadores.sql").split(/\/\/[ \t]*$/m)) {
    const limpia = sentencia.replace(/^\s*--.*$/gm, "").trim();   // quita comentarios
    if (limpia) await con.query(limpia);
  }
  console.log("✓ Reglas (máximo 20 reactivos por cuestionario, 4 cuestionarios por diagnóstico)");

  if (!sinSeed) { await con.query(leer("seed.sql")); console.log("✓ Datos iniciales (código de empresa demo: ALTA-2026)"); }
} catch (e) {
  console.error("Error:", e.sqlMessage ?? e.message);
  process.exitCode = 1;
} finally {
  await con.end();
}
