// PULSE · conexión a MySQL (pool) y utilidades
import mysql from "mysql2/promise";
import { config } from "./config.mjs";

export const pool = mysql.createPool({
  ...config.db,
  charset: "utf8mb4",
  timezone: "Z",                 // todas las fechas se guardan y leen en UTC
  dateStrings: ["DATE"],         // columnas DATE como 'AAAA-MM-DD'
  connectionLimit: 10,
  decimalNumbers: true,
});

export const qi = (id) => "`" + String(id).replace(/`/g, "") + "`"; // identificador entre comillas

/** Ejecuta varias operaciones en una transacción; revierte si alguna falla. */
export async function transaccion(fn) {
  const con = await pool.getConnection();
  try {
    await con.beginTransaction();
    const r = await fn(con);
    await con.commit();
    return r;
  } catch (e) {
    await con.rollback().catch(() => {});
    throw e;
  } finally {
    con.release();
  }
}

/** Error de negocio con mensaje seguro para mostrar al usuario. */
export class ErrorNegocio extends Error {
  constructor(mensaje, estado = 400) { super(mensaje); this.estado = estado; }
}

/** Traduce errores de MySQL a mensajes legibles; los inesperados no se detallan al cliente. */
export function mensajeDeError(e) {
  if (e instanceof ErrorNegocio) return { estado: e.estado, mensaje: e.message };
  if (e?.sqlState === "45000") return { estado: 400, mensaje: e.sqlMessage }; // reglas de los disparadores
  if (e?.code === "ER_DUP_ENTRY") return { estado: 409, mensaje: "Ya existe un registro con esos datos (valor duplicado)." };
  if (e?.code === "ER_NO_REFERENCED_ROW_2") return { estado: 400, mensaje: "El registro relacionado no existe." };
  if (e?.code === "ER_ROW_IS_REFERENCED_2") return { estado: 409, mensaje: "No se puede eliminar: tiene información relacionada." };
  console.error("[error]", e);
  return { estado: 500, mensaje: "Error interno del servidor." };
}
