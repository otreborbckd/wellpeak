// PULSE · archivos (reemplaza Supabase Storage). Se guardan en disco bajo STORAGE_DIR:
//   almacen/contenido/  videos, PDFs y recursos (privado: se sirve con enlaces firmados de 1 hora)
//   almacen/marcas/     logotipos de empresas (público)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config } from "./config.mjs";
import { requiereSesion } from "./auth.mjs";
import { esStaff } from "./permisos.mjs";

const RUTA_OK = /^[\w .\-áéíóúñÁÉÍÓÚÑ()]+(\/[\w .\-áéíóúñÁÉÍÓÚÑ()]+)*$/;   // sin «..», sin rutas absolutas
const TIPOS_LOGO = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };

function resolver(bucket, ruta) {
  if (typeof ruta !== "string" || ruta.length > 400 || !RUTA_OK.test(ruta) || ruta.split("/").includes("..")) return null;
  const base = path.join(config.almacen, bucket);
  const completa = path.resolve(base, ruta);
  return completa.startsWith(base + path.sep) ? completa : null;
}
const firma = (ruta, exp, dl) => crypto.createHmac("sha256", config.jwtSecreto).update(`${ruta}|${exp}|${dl}`).digest("hex");
const nombreSeguro = (n) => String(n ?? "").replace(/[^\w .\-áéíóúñÁÉÍÓÚÑ()]/g, "_").slice(0, 150);

function enviar(res, completa, dl) {
  if (!fs.existsSync(completa) || !fs.statSync(completa).isFile()) return res.status(404).json({ error: { message: "Archivo no encontrado." } });
  // El navegador nunca debe ejecutar un archivo subido como página
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'");
  if (dl) res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(dl)}`);
  res.sendFile(completa, { acceptRanges: true });   // soporta Range: el video avanza y retrocede en el celular
}

export function rutasArchivos(app) {
  fs.mkdirSync(path.join(config.almacen, "contenido"), { recursive: true });
  fs.mkdirSync(path.join(config.almacen, "marcas"), { recursive: true });

  // Enlace firmado para un archivo privado (cualquier usuario con sesión, igual que antes)
  app.get("/api/archivos/firmar", requiereSesion, (req, res) => {
    const ruta = String(req.query.path ?? "");
    if (!resolver("contenido", ruta)) return res.status(400).json({ data: null, error: { message: "Ruta no válida." } });
    const dl = req.query.descargar ? nombreSeguro(req.query.descargar) : "";
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const qs = new URLSearchParams({ exp: String(exp), sig: firma(ruta, exp, dl) });
    if (dl) qs.set("dl", dl);
    res.json({ data: { url: `/api/archivos/contenido/${ruta.split("/").map(encodeURIComponent).join("/")}?${qs}` }, error: null });
  });

  app.get("/api/archivos/contenido/*", (req, res) => {
    const ruta = decodeURIComponent(req.params[0]);
    const completa = resolver("contenido", ruta);
    const exp = Number(req.query.exp), dl = String(req.query.dl ?? "");
    const esperada = firma(ruta, exp, dl), recibida = String(req.query.sig ?? "");
    const valida = completa && exp > Date.now() / 1000 && esperada.length === recibida.length
      && crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(recibida));
    if (!valida) return res.status(403).json({ error: { message: "El enlace venció. Recarga la página." } });
    res.setHeader("Cache-Control", "private, max-age=600");
    enviar(res, completa, dl);
  });

  app.get("/api/archivos/marcas/*", (req, res) => {
    const completa = resolver("marcas", decodeURIComponent(req.params[0]));
    if (!completa) return res.status(400).end();
    res.setHeader("Cache-Control", "public, max-age=3600");
    enviar(res, completa, "");
  });

  // Subida de logotipos (sólo staff). El archivo viaja como cuerpo crudo de la petición.
  app.put("/api/archivos/marcas/*", requiereSesion, express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
    if (!esStaff(req.u)) return res.status(403).json({ data: null, error: { message: "No tienes permiso para esta operación." } });
    const ruta = decodeURIComponent(req.params[0]);
    const completa = resolver("marcas", ruta);
    const ext = ruta.split(".").pop().toLowerCase();
    if (!completa || !TIPOS_LOGO[ext]) return res.status(400).json({ data: null, error: { message: "Usa una imagen PNG, JPG, WEBP o SVG." } });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ data: null, error: { message: "Archivo vacío." } });
    fs.mkdirSync(path.dirname(completa), { recursive: true });
    fs.writeFileSync(completa, req.body);
    res.json({ data: { path: ruta, url: `/api/archivos/marcas/${ruta}` }, error: null });
  });
}
