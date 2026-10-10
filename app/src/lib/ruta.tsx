// Contexto del colaborador y su ruta: el orden de pasos que recorre el botón «Comenzar».
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { useSesion } from "./sesion";
import type { Area, Cuestionario, Empresa, Evento, Modulo, Programa } from "./tipos";

export interface Paso {
  clave: string;
  tipo: "cuestionario" | "modulo";
  cuestionarioId?: string;
  moduloId?: string;
  eventoId?: string;
  fase: string;
  titulo: string;
  hecho: boolean;
  estado: "hecho" | "siguiente" | "bloqueado";
}

export interface DatosColab {
  empresa: Empresa;
  area: Area | null;
  diagnostico: Cuestionario[];
  programa: Programa | null;
  modulos: Modulo[];
  eventos: Evento[];
  cuestionarios: Map<string, Cuestionario>;
  respondidos: Set<string>;
  completados: Set<string>;
}

export function construirRuta(d: DatosColab) {
  const pasos: Paso[] = [];
  d.diagnostico.forEach((q, i) => pasos.push({
    clave: "q:" + q.id, tipo: "cuestionario", cuestionarioId: q.id, fase: "Diagnóstico de clima",
    titulo: `Parte ${i + 1} · ${q.nombre.split(": ").pop()}`, hecho: false, estado: "bloqueado" }));
  const liberado = !!(d.programa && d.empresa.programa_liberado);
  if (liberado && d.programa) {
    const base = d.programa.base_cuestionario_id;
    if (base) pasos.push({ clave: "q:" + base, tipo: "cuestionario", cuestionarioId: base, fase: "Punto de partida",
      titulo: "Tu punto de partida", hecho: false, estado: "bloqueado" });
    d.modulos.forEach((m) => {
      pasos.push({ clave: "m:" + m.id, tipo: "modulo", moduloId: m.id, fase: "Programa · " + d.programa!.nombre,
        titulo: `Módulo ${m.orden} · ${m.titulo}`, hecho: false, estado: "bloqueado" });
      d.eventos.filter((e) => e.despues_de_modulo === m.id && e.cuestionario_id).forEach((e) => pasos.push({
        clave: "e:" + e.id, tipo: "cuestionario", cuestionarioId: e.cuestionario_id!, eventoId: e.id,
        fase: "Evento presencial", titulo: e.nombre, hecho: false, estado: "bloqueado" }));
    });
  }
  pasos.forEach((p) => { p.hecho = p.tipo === "modulo" ? d.completados.has(p.moduloId!) : d.respondidos.has(p.cuestionarioId!); });
  const i = pasos.findIndex((p) => !p.hecho);
  pasos.forEach((p, k) => { p.estado = p.hecho ? "hecho" : k === i ? "siguiente" : "bloqueado"; });
  return {
    pasos,
    siguiente: i >= 0 ? pasos[i] : null,
    avance: pasos.length ? Math.round((pasos.filter((p) => p.hecho).length / pasos.length) * 100) : 0,
    programaPendiente: !liberado,
    diagnosticoCompleto: d.diagnostico.length > 0 && d.diagnostico.every((q) => d.respondidos.has(q.id)),
  };
}

async function cargar(perfilId: string, empresaId: string, areaId: string | null): Promise<DatosColab> {
  const [emp, area, diag, resp, av, ev] = await Promise.all([
    api.from("empresas").select("*").eq("id", empresaId).single(),
    areaId ? api.from("areas").select("*").eq("id", areaId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    api.from("empresa_diagnostico").select("orden, cuestionarios(*)").eq("empresa_id", empresaId).order("orden"),
    api.from("respuestas").select("cuestionario_id").eq("perfil_id", perfilId),
    api.from("avance").select("modulo_id").eq("perfil_id", perfilId),
    api.from("eventos").select("*").eq("empresa_id", empresaId).order("fecha"),
  ]);
  if (emp.error) throw emp.error;
  const empresa = emp.data as Empresa;
  let programa: Programa | null = null, modulos: Modulo[] = [];
  if (empresa.programa_id) {
    const [p, m] = await Promise.all([
      api.from("programas").select("*").eq("id", empresa.programa_id).maybeSingle(),
      api.from("modulos").select("*").eq("programa_id", empresa.programa_id).order("orden"),
    ]);
    programa = (p.data as Programa) ?? null;
    modulos = (m.data as Modulo[]) ?? [];
  }
  const diagnostico = ((diag.data ?? []) as unknown as { cuestionarios: Cuestionario }[]).map((x) => x.cuestionarios).filter(Boolean);
  const ids = new Set<string>([...diagnostico.map((q) => q.id), ...modulos.map((m) => m.evaluacion_id!).filter(Boolean)]);
  if (programa?.base_cuestionario_id) ids.add(programa.base_cuestionario_id);
  ((ev.data ?? []) as Evento[]).forEach((e) => e.cuestionario_id && ids.add(e.cuestionario_id));
  const qs = ids.size ? await api.from("cuestionarios").select("*").in("id", [...ids]) : { data: [] };
  return {
    empresa, area: (area.data as Area) ?? null, diagnostico, programa, modulos,
    eventos: (ev.data as Evento[]) ?? [],
    cuestionarios: new Map(((qs.data ?? []) as Cuestionario[]).map((q) => [q.id, q])),
    respondidos: new Set(((resp.data ?? []) as { cuestionario_id: string }[]).map((r) => r.cuestionario_id)),
    completados: new Set(((av.data ?? []) as { modulo_id: string }[]).map((a) => a.modulo_id)),
  };
}

interface Ctx { datos: DatosColab | null; error: string | null; recargar: () => Promise<void> }
const C = createContext<Ctx | null>(null);

export function ColabProvider({ children }: { children: ReactNode }) {
  const { perfil } = useSesion();
  const [datos, setDatos] = useState<DatosColab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recargar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    try { setDatos(await cargar(perfil.id, perfil.empresa_id, perfil.area_id)); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [perfil?.id, perfil?.empresa_id, perfil?.area_id]);
  useEffect(() => { recargar(); }, [recargar]);
  return <C.Provider value={{ datos, error, recargar }}>{children}</C.Provider>;
}

export function useColab() {
  const v = useContext(C);
  if (!v) throw new Error("useColab fuera de ColabProvider");
  return v;
}

/** Índice 0–100 desde el promedio en escala 1–5. */
export const indice100 = (prom: number) => Math.round(((prom - 1) / 4) * 100);
