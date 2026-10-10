// PULSE · servidor: API + app web (dist/) en un solo proceso.
//   Desarrollo:  npm run dev:api   y en otra terminal   npm run dev   (app en :5173 con proxy a la API en :3000)
//   Local/producción:  npm run build  y luego  npm start   (todo en http://localhost:3000)
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, validarConfig } from "./config.mjs";
import { pool } from "./db.mjs";
import { rutasAuth, requiereSesion } from "./auth.mjs";
import { manejarDb } from "./datos.mjs";
import { manejarRpc, esPublica } from "./rpc.mjs";
import { manejarInvitar } from "./invitar.mjs";
import { rutasArchivos } from "./archivos.mjs";

validarConfig();
const app = express();
app.disable("x-powered-by");
if (config.confiarProxy) app.set("trust proxy", 1);

// Cabeceras de seguridad (las mismas que tenía vercel.json)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (config.produccion) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

const json = express.json({ limit: "2mb" });
app.use("/api", (req, res, next) => (req.method === "PUT" ? next() : json(req, res, next)));
app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

app.get("/api/salud", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

rutasAuth(app);
rutasArchivos(app);
app.post("/api/db", requiereSesion, manejarDb);
app.post("/api/rpc/:fn", (req, res, next) => (esPublica(req.params.fn) ? next() : requiereSesion(req, res, next)), manejarRpc);
app.post("/api/invitar", requiereSesion, manejarInvitar);
app.use("/api", (_req, res) => res.status(404).json({ data: null, error: { message: "Ruta no encontrada." } }));

// App web compilada (npm run build)
if (fs.existsSync(path.join(config.dist, "index.html"))) {
  app.use(express.static(config.dist, {
    index: false,
    setHeaders: (res, f) => { if (/(sw\.js|manifest\.webmanifest)$/.test(f)) res.setHeader("Cache-Control", "no-cache"); },
  }));
  app.get("*", (_req, res) => res.sendFile(path.join(config.dist, "index.html")));
} else {
  console.warn("AVISO: no existe dist/. Ejecuta «npm run build» para servir la app desde este servidor.");
}

app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(err.status ?? 500).json({ data: null, error: { message: err.status === 400 ? "Petición no válida." : "Error interno del servidor." } });
});

app.listen(config.puerto, () => console.log(`PULSE escuchando en http://localhost:${config.puerto}`));
