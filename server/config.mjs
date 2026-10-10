// PULSE · configuración del servidor (variables de entorno; ver .env.example)
import path from "node:path";

const env = process.env;
const entero = (v, def) => (Number.isFinite(Number(v)) && v !== undefined && v !== "" ? Number(v) : def);

export const config = {
  produccion: env.NODE_ENV === "production",
  puerto: entero(env.PORT, 3000),
  appUrl: (env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  confiarProxy: env.TRUST_PROXY === "true",

  db: {
    host: env.DB_HOST || "127.0.0.1",
    port: entero(env.DB_PORT, 3306),
    user: env.DB_USER || "root",
    password: env.DB_PASSWORD ?? "",
    database: env.DB_NAME || "pulse",
  },

  jwtSecreto: env.JWT_SECRET || "",
  jwtDias: entero(env.JWT_DIAS, 7),

  // true = el colaborador debe confirmar su correo antes de entrar (requiere SMTP)
  confirmarCorreo: env.CONFIRMAR_CORREO === "true",

  smtp: {
    host: env.SMTP_HOST || "",
    port: entero(env.SMTP_PORT, 587),
    secure: env.SMTP_SECURE === "true",
    user: env.SMTP_USER || "",
    password: env.SMTP_PASSWORD || "",
    de: env.SMTP_FROM || "PULSE · WellPeak <no-responder@localhost>",
  },

  almacen: path.resolve(env.STORAGE_DIR || "./almacen"),
  dist: path.resolve(env.DIST_DIR || "./dist"),
};

/** Falla temprano si falta algo indispensable. */
export function validarConfig() {
  const faltan = [];
  if (config.jwtSecreto.length < 32) faltan.push("JWT_SECRET (mínimo 32 caracteres; genera uno con: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\")");
  if (config.confirmarCorreo && !config.smtp.host) faltan.push("SMTP_HOST (CONFIRMAR_CORREO=true necesita enviar correos)");
  if (faltan.length) {
    console.error("Configuración incompleta en .env:\n - " + faltan.join("\n - "));
    process.exit(1);
  }
  if (!config.smtp.host) {
    console.warn("AVISO: sin SMTP_HOST no se envían correos; los enlaces de invitación y recuperación se imprimen en esta consola.");
  }
}
