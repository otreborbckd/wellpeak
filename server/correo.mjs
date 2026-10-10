// PULSE · envío de correos (invitación, recuperación, confirmación)
// Sin SMTP_HOST configurado no se envía nada: el enlace se imprime en la consola del servidor (modo desarrollo).
import nodemailer from "nodemailer";
import { config } from "./config.mjs";

let transporte = null;
const obtener = () => {
  if (!config.smtp.host) return null;
  transporte ??= nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
  });
  return transporte;
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const PLANTILLAS = {
  invitar:   { asunto: "Te invitamos a PULSE", titulo: "Bienvenido(a) a PULSE", texto: "Te invitaron a participar en PULSE de WellPeak. Crea tu contraseña para comenzar:", boton: "Crear mi contraseña" },
  recuperar: { asunto: "Recupera tu contraseña de PULSE", titulo: "Recupera tu contraseña", texto: "Recibimos una solicitud para cambiar tu contraseña. Si no fuiste tú, ignora este correo.", boton: "Crear nueva contraseña" },
  confirmar: { asunto: "Confirma tu correo en PULSE", titulo: "Confirma tu correo", texto: "Para activar tu cuenta de PULSE, confirma tu correo:", boton: "Confirmar mi correo" },
};

/** Devuelve true si se envió (o se imprimió en modo desarrollo). Lanza error si el SMTP falla. */
export async function enviarEnlace(tipo, correo, enlace, nombre = "") {
  const p = PLANTILLAS[tipo];
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#111">
    <h2 style="margin:0 0 12px">${p.titulo}</h2>
    <p>${nombre ? `Hola ${esc(nombre)}, ` : ""}${p.texto}</p>
    <p><a href="${esc(enlace)}" style="background:#B8863B;color:#000;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${p.boton}</a></p>
    <p style="font-size:12px;color:#666">Si el botón no funciona, copia este enlace en tu navegador:<br>${esc(enlace)}</p>
    <p style="font-size:12px;color:#666">PULSE · WellPeak</p></div>`;
  const t = obtener();
  if (!t) {
    console.log(`\n[correo · modo desarrollo] ${p.asunto} → ${correo}\n  ${enlace}\n`);
    return true;
  }
  await t.sendMail({ from: config.smtp.de, to: correo, subject: p.asunto, html, text: `${p.texto}\n${enlace}` });
  return true;
}
