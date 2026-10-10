#!/usr/bin/env node
// PULSE · crea (o promueve) una cuenta del equipo de WellPeak y genera su contraseña inicial.
//   npm run admin -- --correo jorge@wellpeak.com --nombre Jorge --apellido "Vizcaíno" [--rol superadmin|consultor|editor]
// Si el correo ya existe, sólo cambia su rol y NO toca su contraseña (usa --reiniciar-clave para generar una nueva).
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db.mjs";

const a = Object.fromEntries(process.argv.slice(2).map((x, i, all) => (x.startsWith("--") ? [x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : [])).filter((x) => x.length));
const correo = String(a.correo ?? "").trim().toLowerCase();
const rol = a.rol ?? "superadmin";
if (!/^\S+@\S+\.\S+$/.test(correo) || !["superadmin", "consultor", "editor"].includes(rol)) {
  console.error('Uso: npm run admin -- --correo <correo> --nombre <nombre> --apellido <apellido> [--rol superadmin|consultor|editor] [--reiniciar-clave]');
  process.exit(1);
}
const nueva = () => crypto.randomBytes(12).toString("base64url");
const texto = (v) => (v === true || v === undefined ? null : String(v));
try {
  const [[u]] = await pool.query("SELECT id FROM usuarios WHERE correo = ?", [correo]);
  let clave = null;
  if (!u) {
    clave = nueva();
    const id = crypto.randomUUID();
    await pool.query("INSERT INTO usuarios (id, correo, hash, confirmado) VALUES (?, ?, ?, 1)", [id, correo, await bcrypt.hash(clave, 12)]);
    await pool.query("INSERT INTO perfiles (id, correo, nombre, apellido, rol, estado) VALUES (?, ?, ?, ?, ?, 'Activo')",
      [id, correo, texto(a.nombre), texto(a.apellido), rol]);
  } else {
    await pool.query("UPDATE perfiles SET rol = ?, empresa_id = NULL, area_id = NULL WHERE id = ?", [rol, u.id]);
    if (a["reiniciar-clave"]) { clave = nueva(); await pool.query("UPDATE usuarios SET hash = ? WHERE id = ?", [await bcrypt.hash(clave, 12), u.id]); }
  }
  console.log(`✓ ${correo} ahora es ${rol}.`);
  if (clave) console.log(`  Contraseña inicial: ${clave}\n  Entra en /entrar y cámbiala desde Mi perfil.`);
} catch (e) { console.error("Error:", e.sqlMessage ?? e.message); process.exitCode = 1; }
finally { await pool.end(); }
