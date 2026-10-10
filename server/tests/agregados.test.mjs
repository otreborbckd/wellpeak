// Pruebas del cálculo de resultados y de la regla de confidencialidad (no necesitan base de datos).
import test from "node:test";
import assert from "node:assert/strict";
import { calcularResultados, calcularComentarios } from "../agregados.mjs";

const DIAG = ["q1", "q2"];
const REACTIVOS = [
  { id: "r1", cuestionario_id: "q1", tipo: "likert", dimension: "Liderazgo", texto: "L1" },
  { id: "r2", cuestionario_id: "q1", tipo: "abierta", dimension: null, texto: "¿Qué cambiarías?" },
  { id: "r3", cuestionario_id: "q2", tipo: "likert", dimension: "Bienestar", texto: "B1" },
];
const AREAS = [{ id: "aV", nombre: "Ventas" }, { id: "aO", nombre: "Operaciones" }];

function grupo(area, n, valor) {
  const colaboradores = [], respuestas = [];
  for (let i = 1; i <= n; i++) {
    const id = `${area}${i}`;
    colaboradores.push({ id, area_id: area });
    respuestas.push({ perfil_id: id, cuestionario_id: "q1", area_id: area, valores: { r1: valor, r2: `Comentario ${id}` } });
    respuestas.push({ perfil_id: id, cuestionario_id: "q2", area_id: area, valores: { r3: valor } });
  }
  return { colaboradores, respuestas };
}
const unir = (...gs) => ({ colaboradores: gs.flatMap((g) => g.colaboradores), respuestas: gs.flatMap((g) => g.respuestas) });
const calc = (g, extra = {}) => calcularResultados({ diag: DIAG, areas: AREAS, reactivos: REACTIVOS, ...g, ...extra });

test("con 4 respuestas completas todo es confidencial", () => {
  const r = calc(grupo("aO", 4, 5));
  assert.equal(r.completos, 4);
  assert.equal(r.confidencial, true);
  assert.equal(r.indice, null);
  assert.equal(r.dimensiones, null);
});

test("con 5 respuestas se muestra el índice (escala 1–5 → 0–100)", () => {
  const r = calc(grupo("aO", 5, 5));
  assert.equal(r.confidencial, false);
  assert.equal(r.indice, 100);
  assert.deepEqual(r.dimensiones, { Liderazgo: 100, Bienestar: 100 });
  assert.equal(calc(grupo("aO", 5, 1)).indice, 0);
  assert.equal(calc(grupo("aO", 5, 3)).indice, 50);
});

test("un área con menos de 5 completos se oculta aunque la empresa sí se muestre", () => {
  const r = calc(unir(grupo("aO", 7, 4), grupo("aV", 2, 2)));
  assert.equal(r.completos, 9);
  assert.equal(r.confidencial, false);
  const ventas = r.areas.find((a) => a.nombre === "Ventas"), op = r.areas.find((a) => a.nombre === "Operaciones");
  assert.equal(ventas.confidencial, true);
  assert.equal(ventas.indice, null);
  assert.equal(ventas.dimensiones, null);
  assert.equal(ventas.completos, 2);
  assert.equal(op.confidencial, false);
  assert.equal(op.indice, 75);
});

test("quien no terminó todas las partes del diagnóstico no cuenta como completo", () => {
  const g = grupo("aO", 6, 5);
  const sinParte2 = g.respuestas.filter((r) => !(r.perfil_id === "aO1" && r.cuestionario_id === "q2"));
  const r = calc({ colaboradores: g.colaboradores, respuestas: sinParte2 });
  assert.equal(r.colaboradores, 6);
  assert.equal(r.completos, 5);
});

test("sin cuestionarios asignados no hay completos", () => {
  const r = calc(grupo("aO", 6, 5), { diag: [], reactivos: [] });
  assert.equal(r.completos, 0);
  assert.equal(r.confidencial, true);
});

test("comentarios: con menos de 5 personas no se entrega nada", () => {
  const g = grupo("aO", 4, 5);
  assert.deepEqual(calcularComentarios({ diag: DIAG, areas: AREAS, reactivos: REACTIVOS, respuestas: g.respuestas }), []);
});

test("comentarios: el nombre del área sólo aparece si el área llega al umbral", () => {
  const g = unir(grupo("aO", 6, 4), grupo("aV", 2, 4));
  const c = calcularComentarios({ diag: DIAG, areas: AREAS, reactivos: REACTIVOS, respuestas: g.respuestas });
  assert.equal(c.length, 8);
  assert.ok(c.every((x) => x.pregunta === "¿Qué cambiarías?"));
  assert.equal(c.filter((x) => x.area === "Operaciones").length, 6);
  assert.equal(c.filter((x) => x.area === "Ventas").length, 0);
  assert.equal(c.filter((x) => x.area === null).length, 2);
});

test("comentarios: ignora respuestas vacías", () => {
  const g = grupo("aO", 5, 4);
  g.respuestas.find((r) => r.perfil_id === "aO1" && r.cuestionario_id === "q1").valores.r2 = "   ";
  const c = calcularComentarios({ diag: DIAG, areas: AREAS, reactivos: REACTIVOS, respuestas: g.respuestas });
  assert.equal(c.length, 4);
});
