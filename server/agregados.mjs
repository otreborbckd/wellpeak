// PULSE · cálculo de resultados del diagnóstico de clima (funciones puras, sin base de datos).
// Replica la lógica de las funciones resultados_empresa y comentarios_empresa del diseño original.

export const UMBRAL_CONFIDENCIALIDAD = 5;

const redondear = (x) => Math.round(x);                       // valores positivos: igual que round() de SQL
const promedio = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const indiceDe = (valores) => redondear(((promedio(valores) - 1) / 4) * 100);   // escala 1–5 → 0–100

export function calcularResultados({ diag, colaboradores, areas, respuestas, reactivos, umbral = UMBRAL_CONFIDENCIALIDAD }) {
  const diagSet = new Set(diag);
  const respondio = new Set(respuestas.filter((r) => diagSet.has(r.cuestionario_id)).map((r) => `${r.perfil_id}|${r.cuestionario_id}`));

  // «Completos»: contestaron TODOS los cuestionarios del diagnóstico
  const completos = diag.length
    ? colaboradores.filter((c) => diag.every((q) => respondio.has(`${c.id}|${q}`)))
    : [];
  const areaDe = new Map(completos.map((c) => [c.id, c.area_id]));

  const likert = reactivos.filter((r) => r.tipo === "likert" && r.dimension && diagSet.has(r.cuestionario_id));
  const porCuestionario = new Map();
  likert.forEach((r) => porCuestionario.set(r.cuestionario_id, [...(porCuestionario.get(r.cuestionario_id) ?? []), r]));

  const vals = []; // { area_id, dimension, v }
  for (const r of respuestas) {
    if (!areaDe.has(r.perfil_id) || !diagSet.has(r.cuestionario_id)) continue;
    for (const rx of porCuestionario.get(r.cuestionario_id) ?? []) {
      if (!(rx.id in (r.valores ?? {}))) continue;
      const v = Number(r.valores[rx.id]);
      if (Number.isFinite(v)) vals.push({ area_id: areaDe.get(r.perfil_id), dimension: rx.dimension, v });
    }
  }

  const porDimension = (filas) => {
    const m = new Map();
    filas.forEach((f) => m.set(f.dimension, [...(m.get(f.dimension) ?? []), f.v]));
    return new Map([...m].map(([dim, xs]) => [dim, indiceDe(xs)]));
  };
  const dimTotal = porDimension(vals);
  const hayTotal = completos.length >= umbral;

  const areasRes = [...areas].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((a) => {
    const nColab = colaboradores.filter((c) => c.area_id === a.id).length;
    const nComp = completos.filter((c) => c.area_id === a.id).length;
    const ok = nComp >= umbral;
    const dims = ok ? porDimension(vals.filter((x) => x.area_id === a.id)) : null;
    return {
      area_id: a.id, nombre: a.nombre, colaboradores: nColab, completos: nComp, confidencial: !ok,
      indice: ok && dims.size ? redondear(promedio([...dims.values()])) : null,
      dimensiones: ok && dims.size ? Object.fromEntries(dims) : null,
    };
  });

  return {
    umbral,
    colaboradores: colaboradores.length,
    completos: completos.length,
    confidencial: !hayTotal,
    indice: hayTotal && dimTotal.size ? redondear(promedio([...dimTotal.values()])) : null,
    dimensiones: hayTotal ? Object.fromEntries(dimTotal) : null,
    areas: areasRes,
  };
}

/**
 * Comentarios abiertos del diagnóstico, sin identificar a nadie.
 * Si respondieron menos personas que el umbral no se muestra nada; el nombre del área
 * se oculta cuando esa área tiene menos respuestas que el umbral.
 */
export function calcularComentarios({ diag, respuestas, reactivos, areas, umbral = UMBRAL_CONFIDENCIALIDAD, aleatorio = Math.random }) {
  const diagSet = new Set(diag);
  const delDiag = respuestas.filter((r) => diagSet.has(r.cuestionario_id));
  if (new Set(delDiag.map((r) => r.perfil_id)).size < umbral) return [];

  const nombreArea = new Map(areas.map((a) => [a.id, a.nombre]));
  const personas = new Map();
  delDiag.forEach((r) => {
    const k = `${r.area_id}|${r.cuestionario_id}`;
    if (!personas.has(k)) personas.set(k, new Set());
    personas.get(k).add(r.perfil_id);
  });

  const abiertas = new Map();
  reactivos.filter((x) => x.tipo === "abierta").forEach((x) => abiertas.set(x.cuestionario_id, [...(abiertas.get(x.cuestionario_id) ?? []), x]));

  const salida = [];
  for (const r of delDiag) {
    for (const rx of abiertas.get(r.cuestionario_id) ?? []) {
      const texto = r.valores?.[rx.id];
      if (typeof texto !== "string" || texto.trim() === "") continue;
      const n = personas.get(`${r.area_id}|${r.cuestionario_id}`)?.size ?? 0;
      salida.push({ pregunta: rx.texto, texto, area: n >= umbral ? (nombreArea.get(r.area_id) ?? null) : null });
    }
  }
  for (let i = salida.length - 1; i > 0; i--) {   // orden aleatorio para que el orden no delate a nadie
    const j = Math.floor(aleatorio() * (i + 1));
    [salida[i], salida[j]] = [salida[j], salida[i]];
  }
  return salida;
}
