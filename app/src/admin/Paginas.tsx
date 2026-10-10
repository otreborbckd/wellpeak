import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, mensajeError } from "../lib/api";
import { useSesion } from "../lib/sesion";
import { indice100 } from "../lib/ruta";
import { DIMENSIONES, TIPOS_CUESTIONARIO, type Area, type Cuestionario, type Empresa, type Evento, type Modulo, type Perfil, type Programa, type Reactivo, type Rol, type Valores } from "../lib/tipos";
import { OrgBadge } from "../ui/comun";
import { Aviso, Encabezado, ROLES, descargarCSV } from "./Consola";

function useEmpresas() {
  const [lista, setLista] = useState<Empresa[]>([]);
  const cargar = useCallback(async () => { const { data } = await api.from("empresas").select("*").order("nombre"); setLista((data as Empresa[]) ?? []); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  return { lista, cargar };
}

const pill = (t: string, k = "") => <span className={`pill ${k}`}>{t}</span>;
const registrar = (accion: string) => api.rpc("registrar", { p_accion: accion });

// ============ Tablero ============
interface Res { colaboradores: number; completos: number; indice: number | null; confidencial: boolean; umbral: number;
  dimensiones: Record<string, number> | null; areas: { area_id: string; nombre: string; colaboradores: number; completos: number; indice: number | null; confidencial: boolean; dimensiones: Record<string, number> | null }[] }

export function Tablero() {
  const { perfil } = useSesion();
  const { lista } = useEmpresas();
  const [res, setRes] = useState<Record<string, Res | null>>({});
  const [bit, setBit] = useState<{ accion: string; created_at: string }[]>([]);
  useEffect(() => {
    if (!perfil || perfil.rol === "editor") return;
    lista.forEach((e) => api.rpc("resultados_empresa", { p_empresa: e.id }).then(({ data }) => setRes((r) => ({ ...r, [e.id]: (data as Res) ?? null }))));
  }, [lista, perfil]);
  useEffect(() => { api.from("bitacora").select("accion,created_at").order("created_at", { ascending: false }).limit(8).then(({ data }) => setBit(data ?? [])); }, []);
  return <>
    <Encabezado titulo="Tablero" desc="Estado de PULSE en las empresas cliente." />
    <div className="tbl-wrap"><table><thead><tr><th>Empresa</th><th>Etapa</th><th className="r">Colaboradores</th><th>Participación en diagnóstico</th><th className="r">Índice de clima</th><th>Programa</th></tr></thead><tbody>
      {lista.map((e) => { const r = res[e.id]; const part = r && r.colaboradores ? Math.round((r.completos / r.colaboradores) * 100) : 0; return (
        <tr key={e.id}><td><div className="who"><OrgBadge empresa={e} size={30} /><div><b>{e.nombre}</b><span>{e.codigo}</span></div></div></td><td>{pill(e.estado, e.programa_liberado ? "good" : "warn")}</td>
          <td className="r num">{r?.colaboradores ?? "—"}</td>
          <td style={{ minWidth: 160 }}>{r ? <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><div className="bar" style={{ flex: 1 }}><i style={{ width: `${part}%` }} /></div><span className="num">{part}%</span></div> : "—"}</td>
          <td className="r num">{r?.indice ?? "—"}</td><td>{e.programa_liberado ? pill("Liberado", "good") : pill("No liberado")}</td></tr>); })}
      {!lista.length && <tr><td colSpan={6} className="muted">Aún no hay empresas.</td></tr>}
    </tbody></table></div>
    <div className="card" style={{ marginTop: 16 }}><h2>Actividad reciente</h2><ul className="log">{bit.map((b, i) => <li key={i}><time>{new Date(b.created_at).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time><span>{b.accion}</span></li>)}</ul></div>
  </>;
}

// ============ Empresas ============
export function Empresas() {
  const { perfil } = useSesion();
  const { lista, cargar } = useEmpresas();
  const [sel, setSel] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [msg, setMsg] = useState<{ t: string; k?: "error" } | null>(null);
  const e = lista.find((x) => x.id === sel) ?? lista[0];
  const [areas, setAreas] = useState<(Area & { n: number })[]>([]);
  const [climas, setClimas] = useState<Cuestionario[]>([]);
  const [eventoQs, setEventoQs] = useState<Cuestionario[]>([]);
  const [diag, setDiag] = useState<string[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);

  const cargarDetalle = useCallback(async () => {
    if (!e) return;
    const [a, p, q, d, pr, ev] = await Promise.all([
      api.from("areas").select("*").eq("empresa_id", e.id).order("nombre"),
      api.from("perfiles").select("area_id").eq("empresa_id", e.id).eq("rol", "colaborador"),
      api.from("cuestionarios").select("*").in("tipo", ["clima", "evento"]).order("nombre"),
      api.from("empresa_diagnostico").select("cuestionario_id").eq("empresa_id", e.id).order("orden"),
      api.from("programas").select("*").order("nombre"),
      api.from("eventos").select("*").eq("empresa_id", e.id).order("fecha"),
    ]);
    const cuenta = new Map<string, number>(); ((p.data ?? []) as { area_id: string }[]).forEach((x) => cuenta.set(x.area_id, (cuenta.get(x.area_id) ?? 0) + 1));
    setAreas(((a.data ?? []) as Area[]).map((x) => ({ ...x, n: cuenta.get(x.id) ?? 0 })));
    const qs = (q.data ?? []) as Cuestionario[];
    setClimas(qs.filter((x) => x.tipo === "clima")); setEventoQs(qs.filter((x) => x.tipo === "evento"));
    setDiag(((d.data ?? []) as { cuestionario_id: string }[]).map((x) => x.cuestionario_id));
    setProgramas((pr.data as Programa[]) ?? []); setEventos((ev.data as Evento[]) ?? []);
    if (e.programa_id) { const { data } = await api.from("modulos").select("*").eq("programa_id", e.programa_id).order("orden"); setModulos((data as Modulo[]) ?? []); } else setModulos([]);
  }, [e?.id, e?.programa_id]);
  useEffect(() => { cargarDetalle(); }, [cargarDetalle]);

  const aviso = (error: unknown, ok: string) => setMsg(error ? { t: mensajeError(error), k: "error" } : { t: ok });
  async function campo(f: keyof Empresa, v: unknown) {
    const { error } = await api.from("empresas").update({ [f]: v }).eq("id", e!.id);
    aviso(error, "Guardado"); await cargar();
  }
  async function crear(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); const fd = new FormData(ev.currentTarget);
    const { data, error } = await api.from("empresas").insert({
      nombre: String(fd.get("nombre")).trim(), sigla: String(fd.get("sigla")).trim().toUpperCase(),
      codigo: String(fd.get("codigo")).trim().toUpperCase(), contacto: String(fd.get("contacto")),
    }).select("id").single();
    if (error) return aviso(error, "");
    const nombres = String(fd.get("areas")).split(",").map((s) => s.trim()).filter(Boolean);
    if (nombres.length) await api.from("areas").insert(nombres.map((nombre) => ({ empresa_id: data.id, nombre })));
    const base = climas.map((q) => q.id).slice(0, 2);
    if (base.length) await api.from("empresa_diagnostico").insert(base.map((c, i) => ({ empresa_id: data.id, cuestionario_id: c, orden: i + 1 })));
    await registrar(`Creó la empresa ${fd.get("nombre")}`);
    setNueva(false); await cargar(); setSel(data.id); aviso(null, "Empresa creada");
  }
  async function subirLogo(f: File) {
    if (f.size > 1_000_000) return setMsg({ t: "Usa una imagen de menos de 1 MB", k: "error" });
    const ruta = `${e!.id}/logo-${Date.now()}.${f.name.split(".").pop()}`;
    const { error } = await api.storage.from("marcas").upload(ruta, f, { upsert: true, contentType: f.type });
    if (error) return aviso(error, "");
    await campo("logo_url", api.storage.from("marcas").getPublicUrl(ruta).data.publicUrl);
  }
  async function toggleDiag(qid: string, on: boolean) {
    const { error } = on ? await api.from("empresa_diagnostico").insert({ empresa_id: e!.id, cuestionario_id: qid, orden: diag.length + 1 })
      : await api.from("empresa_diagnostico").delete().eq("empresa_id", e!.id).eq("cuestionario_id", qid);
    aviso(error, "Diagnóstico actualizado"); cargarDetalle();
  }
  async function nuevoEvento(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); const fd = new FormData(ev.currentTarget);
    const { error } = await api.from("eventos").insert({ empresa_id: e!.id, nombre: fd.get("nombre"), fecha: fd.get("fecha") || null, lugar: fd.get("lugar"),
      cuestionario_id: fd.get("qid") || null, despues_de_modulo: fd.get("despues") || null });
    aviso(error, "Evento agregado"); ev.currentTarget.reset(); cargarDetalle();
  }

  return <>
    <Encabezado titulo="Clientes · Empresas · Áreas" desc="Empresas contratantes, sus áreas, el diagnóstico que aplican y el programa asignado.">
      {perfil?.rol === "superadmin" && <button className="btn pri" onClick={() => setNueva(!nueva)}>{nueva ? "Cancelar" : "Nueva empresa"}</button>}
    </Encabezado>
    {msg && <Aviso tipo={msg.k}>{msg.t}</Aviso>}
    {nueva && (
      <form className="card form" style={{ marginBottom: 16 }} onSubmit={crear}>
        <h2>Nueva empresa</h2>
        <div className="f2"><label className="f">Nombre<input className="in" name="nombre" required /></label><label className="f">Siglas<input className="in" name="sigla" maxLength={4} required /></label></div>
        <div className="f2"><label className="f">Código de registro<input className="in num" name="codigo" placeholder="EMPR-2026" required /></label><label className="f">Contacto<input className="in" name="contacto" placeholder="Nombre · puesto" /></label></div>
        <label className="f">Áreas <small>Separadas por coma</small><input className="in" name="areas" defaultValue="Dirección, Operaciones, Administración" /></label>
        <div><button className="btn pri" type="submit">Crear empresa</button></div>
      </form>
    )}
    {!e ? <p className="muted">Aún no hay empresas.</p> : (
      <div className="split">
        <div className="list-sel">{lista.map((x) => (
          <button key={x.id} aria-current={x.id === e.id} onClick={() => setSel(x.id)}><div className="row" style={{ flexWrap: "nowrap" }}><OrgBadge empresa={x} size={30} /><div><b>{x.nombre}</b><span>{x.estado}</span></div></div></button>
        ))}</div>
        <div className="form" key={e.id}>
          <div className="card form"><h2>Datos de la empresa</h2>
            <div className="row" style={{ gap: 16 }}><OrgBadge empresa={e} size={64} />
              <label className="btn" style={{ cursor: "pointer" }}>Subir logotipo<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={(x) => x.target.files?.[0] && subirLogo(x.target.files[0])} /></label>
              <label className="f" style={{ width: 150 }}>Color<input type="color" className="swatch" defaultValue={e.color} onBlur={(x) => campo("color", x.target.value)} /></label></div>
            <div className="f2">
              <label className="f">Nombre<input className="in" defaultValue={e.nombre} onBlur={(x) => x.target.value !== e.nombre && campo("nombre", x.target.value)} /></label>
              <label className="f">Etapa<select className="in" defaultValue={e.estado} onChange={(x) => campo("estado", x.target.value)}>{["Diagnóstico por iniciar", "Diagnóstico en aplicación", "Análisis de resultados", "Programa en curso", "Cerrado"].map((s) => <option key={s}>{s}</option>)}</select></label>
            </div>
            <div className="f2">
              <label className="f">Siglas<input className="in" maxLength={4} defaultValue={e.sigla ?? ""} onBlur={(x) => campo("sigla", x.target.value.toUpperCase())} /></label>
              <label className="f">Código de registro <small>Lo usan los colaboradores para crear su cuenta</small><input className="in num" defaultValue={e.codigo} onBlur={(x) => x.target.value !== e.codigo && campo("codigo", x.target.value.toUpperCase())} /></label>
            </div>
            <label className="f">Contacto en la empresa<input className="in" defaultValue={e.contacto ?? ""} onBlur={(x) => campo("contacto", x.target.value)} /></label>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Áreas</h2>
              <button className="btn sm" onClick={async () => { const { error } = await api.from("areas").insert({ empresa_id: e.id, nombre: `Nueva área ${areas.length + 1}` }); aviso(error, "Área agregada"); cargarDetalle(); }}>Agregar área</button></div>
            <div className="tbl-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Área</th><th>Responsable</th><th className="r">Colaboradores</th><th /></tr></thead><tbody>
              {areas.map((a) => <tr key={a.id}>
                <td><input className="in" defaultValue={a.nombre} aria-label="Nombre del área" onBlur={async (x) => { const { error } = await api.from("areas").update({ nombre: x.target.value }).eq("id", a.id); aviso(error, "Guardado"); }} /></td>
                <td><input className="in" defaultValue={a.responsable ?? ""} aria-label="Responsable" onBlur={async (x) => { const { error } = await api.from("areas").update({ responsable: x.target.value }).eq("id", a.id); aviso(error, "Guardado"); }} /></td>
                <td className="r num">{a.n}{a.n < 5 && <> {pill("n<5", "warn")}</>}</td>
                <td className="r">{a.n === 0 && <button className="btn sm danger" onClick={async () => { const { error } = await api.from("areas").delete().eq("id", a.id); aviso(error, "Área eliminada"); cargarDetalle(); }}>Eliminar</button>}</td>
              </tr>)}
            </tbody></table></div>
          </div>

          <div className="grid g2">
            <div className="card"><h2>Diagnóstico de clima</h2><p className="muted" style={{ margin: "-6px 0 10px", fontSize: 13 }}>De 1 a 4 cuestionarios, máximo 20 reactivos cada uno.</p>
              {climas.map((q) => <label key={q.id} className="row" style={{ gap: 8, margin: "6px 0", flexWrap: "nowrap" }}>
                <input type="checkbox" checked={diag.includes(q.id)} onChange={(x) => toggleDiag(q.id, x.target.checked)} /> <span>{q.nombre}</span></label>)}
            </div>
            <div className="card form"><h2>Programa de desarrollo</h2>
              <label className="f">Programa asignado<select className="in" value={e.programa_id ?? ""} onChange={(x) => campo("programa_id", x.target.value || null)}>
                <option value="">Sin programa</option>{programas.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.estado})</option>)}</select></label>
              <label className="row" style={{ gap: 10, flexWrap: "nowrap" }}><span className="toggle"><input type="checkbox" checked={e.programa_liberado} disabled={!e.programa_id}
                onChange={async (x) => { await campo("programa_liberado", x.target.checked); await registrar(`${x.target.checked ? "Liberó" : "Retiró"} el programa de ${e.nombre}`); }} /><span /></span>
                <span>Liberar programa a colaboradores<span className="muted" style={{ display: "block", fontSize: 12 }}>Aparecen el punto de partida y los módulos en su ruta</span></span></label>
              <label className="f">Mensaje «Lo que escuchamos» <small>Se muestra al terminar el diagnóstico</small>
                <textarea className="in" defaultValue={e.mensaje_escuchamos ?? ""} onBlur={(x) => campo("mensaje_escuchamos", x.target.value || null)} /></label>
            </div>
          </div>

          <div className="card"><h2>Eventos presenciales</h2>
            <ul className="log">{eventos.map((x) => <li key={x.id}><time>{x.fecha ?? "Sin fecha"}</time><span><b>{x.nombre}</b> · {x.lugar}</span></li>)}{!eventos.length && <li className="muted">Sin eventos</li>}</ul>
            <form className="f2" style={{ marginTop: 12, alignItems: "end" }} onSubmit={nuevoEvento}>
              <label className="f">Nombre<input className="in" name="nombre" required /></label>
              <label className="f">Fecha<input className="in" name="fecha" type="date" /></label>
              <label className="f">Lugar<input className="in" name="lugar" /></label>
              <label className="f">Evaluación<select className="in" name="qid"><option value="">Sin evaluación</option>{eventoQs.map((q) => <option key={q.id} value={q.id}>{q.nombre}</option>)}</select></label>
              <label className="f">Aparece después de<select className="in" name="despues"><option value="">—</option>{modulos.map((m) => <option key={m.id} value={m.id}>Módulo {m.orden} · {m.titulo}</option>)}</select></label>
              <div><button className="btn" type="submit">Agregar evento</button></div>
            </form>
          </div>
        </div>
      </div>
    )}
  </>;
}

// ============ Colaboradores ============
function parseCSV(texto: string) {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const filas = lineas.map((l) => l.split(/[,;]/).map((s) => s.trim().replace(/^"|"$/g, "")));
  if (filas[0] && /nombre/i.test(filas[0][0])) filas.shift();
  return filas.map(([nombre, apellido, correo, area, puesto]) => ({ nombre, apellido, correo, area, puesto }));
}

export function Colaboradores() {
  const { lista } = useEmpresas();
  const [eid, setEid] = useState<string>("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [gente, setGente] = useState<Perfil[]>([]);
  const [diagOk, setDiagOk] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ t: string; k?: "error" } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const e = lista.find((x) => x.id === eid) ?? lista[0];

  const cargar = useCallback(async () => {
    if (!e) return;
    const [a, p, d, r] = await Promise.all([
      api.from("areas").select("*").eq("empresa_id", e.id).order("nombre"),
      api.from("perfiles").select("*").eq("empresa_id", e.id).eq("rol", "colaborador").order("apellido"),
      api.from("empresa_diagnostico").select("cuestionario_id").eq("empresa_id", e.id),
      api.from("respuestas").select("perfil_id,cuestionario_id").eq("empresa_id", e.id),
    ]);
    setAreas((a.data as Area[]) ?? []); setGente((p.data as Perfil[]) ?? []);
    const dq = ((d.data ?? []) as { cuestionario_id: string }[]).map((x) => x.cuestionario_id);
    const porPerfil = new Map<string, Set<string>>();
    ((r.data ?? []) as { perfil_id: string; cuestionario_id: string }[]).forEach((x) => { if (!porPerfil.has(x.perfil_id)) porPerfil.set(x.perfil_id, new Set()); porPerfil.get(x.perfil_id)!.add(x.cuestionario_id); });
    setDiagOk(new Set([...porPerfil].filter(([, s]) => dq.length && dq.every((c) => s.has(c))).map(([id]) => id)));
  }, [e?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function invitar(filas: { nombre?: string; apellido?: string; correo?: string; area?: string; area_id?: string; puesto?: string }[]) {
    setTrabajando(true);
    const { data, error } = await api.functions.invoke("invitar-colaboradores", {
      body: { empresa_id: e!.id, colaboradores: filas, redirect_to: window.location.origin + "/nueva-contrasena" },
    });
    setTrabajando(false);
    if (error) return setMsg({ t: mensajeError(error), k: "error" });
    const r = data as { creados: number; errores: { correo: string; motivo: string }[] };
    setMsg({ t: `${r.creados} invitaciones enviadas.${r.errores.length ? ` ${r.errores.length} con errores: ` + r.errores.slice(0, 5).map((x) => `${x.correo} (${x.motivo})`).join("; ") : ""}`, k: r.errores.length ? "error" : undefined });
    cargar();
  }
  async function estado(p: Perfil, nuevo: Perfil["estado"]) {
    const { error } = await api.from("perfiles").update({ estado: nuevo }).eq("id", p.id);
    if (error) setMsg({ t: mensajeError(error), k: "error" }); else await registrar(`${nuevo === "Suspendido" ? "Suspendió" : "Reactivó"} a ${p.nombre} ${p.apellido}`);
    cargar();
  }
  const areaNom = useMemo(() => new Map(areas.map((a) => [a.id, a.nombre])), [areas]);
  const filtrada = gente.filter((p) => !q || `${p.nombre} ${p.apellido} ${p.correo}`.toLowerCase().includes(q.toLowerCase()));
  const part = gente.length ? Math.round((diagOk.size / gente.length) * 100) : 0;

  return <>
    <Encabezado titulo="Usuarios de la app" desc="Colaboradores con acceso a PULSE, segmentados por empresa y área.">
      <label className="btn" style={{ cursor: "pointer" }}>{trabajando ? "Enviando…" : "Importar CSV"}<input type="file" accept=".csv,text/csv" hidden disabled={trabajando}
        onChange={async (x) => { const f = x.target.files?.[0]; if (f) invitar(parseCSV(await f.text())); x.target.value = ""; }} /></label>
      <button className="btn" onClick={() => descargarCSV(`colaboradores-${e?.codigo}.csv`, [["Nombre", "Apellidos", "Correo", "Área", "Estado", "Diagnóstico"], ...gente.map((p) => [p.nombre, p.apellido, p.correo, areaNom.get(p.area_id ?? "") ?? "", p.estado, diagOk.has(p.id) ? "Completo" : "Pendiente"])])}>Exportar CSV</button>
    </Encabezado>
    {msg && <Aviso tipo={msg.k}>{msg.t}</Aviso>}
    <div className="row" style={{ marginBottom: 12 }}>
      <select className="in" style={{ width: "auto" }} value={e?.id ?? ""} onChange={(x) => setEid(x.target.value)}>{lista.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      <input className="in" style={{ width: "auto", flex: 1, minWidth: 180 }} type="search" placeholder="Buscar por nombre o correo" value={q} onChange={(x) => setQ(x.target.value)} />
      <span className="muted num">{gente.length} colaboradores · diagnóstico {part}%</span>
    </div>
    {e && (
      <form className="card f2" style={{ marginBottom: 14, alignItems: "end" }} onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget);
        invitar([{ nombre: String(fd.get("nombre")), apellido: String(fd.get("apellido")), correo: String(fd.get("correo")), area_id: String(fd.get("area")), puesto: String(fd.get("puesto") || "") }]); ev.currentTarget.reset(); }}>
        <label className="f">Nombre<input className="in" name="nombre" required /></label>
        <label className="f">Apellidos<input className="in" name="apellido" /></label>
        <label className="f">Correo<input className="in" name="correo" type="email" required /></label>
        <label className="f">Área<select className="in" name="area">{areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
        <label className="f">Puesto<input className="in" name="puesto" /></label>
        <div><button className="btn pri" type="submit" disabled={trabajando}>Invitar colaborador</button></div>
      </form>
    )}
    <div className="tbl-wrap"><table><thead><tr><th>Colaborador</th><th>Área</th><th>Estado</th><th>Diagnóstico</th><th /></tr></thead><tbody>
      {filtrada.map((p) => <tr key={p.id}>
        <td><div className="who"><div><b>{p.nombre} {p.apellido}</b><span>{p.correo}</span></div></div></td>
        <td>{areaNom.get(p.area_id ?? "") ?? "—"}</td>
        <td>{pill(p.estado, p.estado === "Activo" ? "good" : p.estado === "Invitado" ? "warn" : "crit")}</td>
        <td>{diagOk.has(p.id) ? pill("Completo", "good") : pill("Pendiente")}</td>
        <td className="r">{p.estado === "Suspendido" ? <button className="btn sm" onClick={() => estado(p, "Activo")}>Reactivar</button> : <button className="btn sm danger" onClick={() => estado(p, "Suspendido")}>Suspender</button>}</td>
      </tr>)}
      {!filtrada.length && <tr><td colSpan={5} className="muted">Sin colaboradores.</td></tr>}
    </tbody></table></div>
    <p className="note" style={{ marginTop: 14 }}>Formato CSV: <span className="num">nombre,apellido,correo,area,puesto</span>. El área debe existir en la empresa. Cada persona recibe un correo para crear su contraseña.</p>
  </>;
}

// ============ Resultados ============
function Barras({ datos }: { datos: { label: string; v: number | null }[] }) {
  const H = datos.length * 36 + 34, x0 = 190, x1 = 590, sx = (v: number) => x0 + ((x1 - x0) * v) / 100;
  return (
    <div style={{ overflowX: "auto" }}><svg className="chart" viewBox={`0 0 640 ${H}`} width="100%" style={{ minWidth: 480, maxWidth: 760, display: "block" }} role="img" aria-label="Índice por dimensión">
      {[0, 25, 50, 100].map((t) => <g key={t}><line className="grid-l" x1={sx(t)} x2={sx(t)} y1={6} y2={H - 24} /><text x={sx(t)} y={H - 8} textAnchor="middle">{t}</text></g>)}
      {datos.map((d, i) => { const y = 10 + i * 36; return (
        <g key={d.label}><title>{`${d.label}: ${d.v ?? "sin datos"}`}</title><text x={x0 - 12} y={y + 16} textAnchor="end">{d.label}</text>
          {d.v != null && <><rect x={x0} y={y + 4} width={Math.max(2, sx(d.v) - x0)} height={18} rx={4} fill="var(--goldfill)" /><text className="val" x={sx(d.v) + 8} y={y + 17}>{d.v}</text></>}</g>); })}
      <line x1={sx(70)} x2={sx(70)} y1={4} y2={H - 24} stroke="var(--ink2)" strokeDasharray="4 4" /><text x={sx(70)} y={H - 8} textAnchor="middle" style={{ fontWeight: 700 }}>meta 70</text>
    </svg></div>
  );
}
function color(v: number) { const t = Math.max(-1, Math.min(1, (v - 60) / 30)); const pct = Math.round(Math.abs(t) * 100);
  return { background: `color-mix(in srgb, var(${t < 0 ? "--div-lo" : "--div-hi"}) ${pct}%, var(--div-mid))`, color: Math.abs(t) > 0.55 ? "#fff" : "var(--ink)" }; }

export function Resultados() {
  const { lista } = useEmpresas();
  const [eid, setEid] = useState(""); const [aid, setAid] = useState("");
  const [r, setR] = useState<Res | null>(null); const [err, setErr] = useState<string | null>(null);
  const [coment, setComent] = useState<{ pregunta: string; texto: string; area: string | null }[]>([]);
  const [indiv, setIndiv] = useState<{ nombre: string; area: string; ix: number | null }[]>([]);
  const e = lista.find((x) => x.id === eid) ?? lista[0];
  useEffect(() => {
    if (!e) return;
    setErr(null);
    api.rpc("resultados_empresa", { p_empresa: e.id, p_area: aid || null }).then(({ data, error }) => { if (error) setErr(error.message); setR((data as Res) ?? null); });
    api.rpc("comentarios_empresa", { p_empresa: e.id }).then(({ data }) => setComent(data ?? []));
    (async () => {
      const [{ data: d }, { data: rs }, { data: ps }, { data: as }] = await Promise.all([
        api.from("empresa_diagnostico").select("cuestionario_id").eq("empresa_id", e.id),
        api.from("respuestas").select("perfil_id,cuestionario_id,valores").eq("empresa_id", e.id),
        api.from("perfiles").select("id,nombre,apellido,area_id").eq("empresa_id", e.id),
        api.from("areas").select("id,nombre").eq("empresa_id", e.id),
      ]);
      const dq = ((d ?? []) as { cuestionario_id: string }[]).map((x) => x.cuestionario_id);
      if (!dq.length) return setIndiv([]);
      const { data: rx } = await api.from("reactivos").select("id,tipo,dimension").in("cuestionario_id", dq);
      const lik = ((rx ?? []) as Pick<Reactivo, "id" | "tipo" | "dimension">[]).filter((x) => x.tipo === "likert");
      const an = new Map(((as ?? []) as { id: string; nombre: string }[]).map((a) => [a.id, a.nombre]));
      const porP = new Map<string, number[]>(); const cuenta = new Map<string, number>();
      ((rs ?? []) as { perfil_id: string; cuestionario_id: string; valores: Valores }[]).filter((x) => dq.includes(x.cuestionario_id)).forEach((x) => {
        cuenta.set(x.perfil_id, (cuenta.get(x.perfil_id) ?? 0) + 1);
        lik.forEach((l) => { const v = x.valores[l.id]; if (typeof v === "number") porP.set(x.perfil_id, [...(porP.get(x.perfil_id) ?? []), v]); });
      });
      setIndiv(((ps ?? []) as Perfil[]).filter((p) => cuenta.get(p.id) === dq.length && (!aid || p.area_id === aid)).map((p) => {
        const vs = porP.get(p.id) ?? []; return { nombre: `${p.nombre} ${p.apellido}`, area: an.get(p.area_id ?? "") ?? "", ix: vs.length ? indice100(vs.reduce((a, b) => a + b, 0) / vs.length) : null };
      }).sort((a, b) => a.nombre.localeCompare(b.nombre)));
    })();
  }, [e?.id, aid]);

  const dims = r?.dimensiones ?? {};
  const orden = DIMENSIONES.filter((d) => dims[d] != null).sort((a, b) => dims[b] - dims[a]);
  return <>
    <Encabezado titulo="Resultados" desc="Diagnóstico de clima por empresa, área y persona. Acceso exclusivo del personal WellPeak designado.">
      <button className="btn" disabled={!r} onClick={() => r && e && descargarCSV(`resultados-${e.codigo}.csv`, [["Área", "Respuestas", "Colaboradores", ...DIMENSIONES, "Índice"],
        ...r.areas.map((a) => [a.nombre, a.completos, a.colaboradores, ...DIMENSIONES.map((d) => (a.confidencial ? "Confidencial" : a.dimensiones?.[d] ?? "")), a.confidencial ? "Confidencial" : a.indice])])}>Exportar CSV</button>
      <button className="btn pri" onClick={() => window.print()}>Imprimir informe</button>
    </Encabezado>
    <div className="row" style={{ marginBottom: 16 }}>
      <select className="in" style={{ width: "auto" }} value={e?.id ?? ""} onChange={(x) => { setEid(x.target.value); setAid(""); }}>{lista.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      <select className="in" style={{ width: "auto" }} value={aid} onChange={(x) => setAid(x.target.value)}><option value="">Todas las áreas</option>{r?.areas.map((a) => <option key={a.area_id} value={a.area_id}>{a.nombre}</option>)}</select>
    </div>
    {err && <div className="err">{err}</div>}
    {r && (r.confidencial ? (
      <div className="card"><h2>Resultados protegidos</h2><p className="ink2" style={{ margin: 0 }}>Esta selección tiene {r.completos} respuesta(s). Por confidencialidad los resultados se muestran a partir de {r.umbral}.</p></div>
    ) : <>
      <div className="grid g4">
        <div className="card kpi"><div className="eyebrow">Participación</div><div className="v">{r.colaboradores ? Math.round((r.completos / r.colaboradores) * 100) : 0}%</div><div className="s">{r.completos} de {r.colaboradores} completaron el diagnóstico</div></div>
        <div className="card kpi"><div className="eyebrow">Índice de clima</div><div className="v">{r.indice}<span className="muted" style={{ fontSize: 16 }}> /100</span></div><div className="s">{r.indice! >= 70 ? pill("Favorable", "good") : r.indice! >= 55 ? pill("Atención", "warn") : pill("Crítico", "crit")}</div></div>
        <div className="card kpi"><div className="eyebrow">Fortaleza</div><div className="v" style={{ font: "600 20px/1.2 var(--fd)", marginTop: 10 }}>{orden[0]}</div><div className="s num">{dims[orden[0]]}</div></div>
        <div className="card kpi"><div className="eyebrow">Prioridad a atender</div><div className="v" style={{ font: "600 20px/1.2 var(--fd)", marginTop: 10 }}>{orden[orden.length - 1]}</div><div className="s num">{dims[orden[orden.length - 1]]}</div></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}><h2>Índice por dimensión <span className="muted" style={{ font: "500 13px var(--fb)" }}>escala 0 a 100</span></h2><Barras datos={DIMENSIONES.map((d) => ({ label: d, v: dims[d] ?? null }))} /></div>
      {!aid && <div className="card" style={{ marginTop: 16 }}><h2>Mapa de calor por área</h2>
        <div style={{ overflowX: "auto" }}><table className="heat"><thead><tr><th style={{ textAlign: "left" }}>Área</th><th>Resp.</th>{DIMENSIONES.map((d) => <th key={d} title={d}>{d.split(" ")[0]}</th>)}<th>Índice</th></tr></thead><tbody>
          {r.areas.map((a) => <tr key={a.area_id}><td className="lbl">{a.nombre}</td><td className="num">{a.completos}/{a.colaboradores}</td>
            {a.confidencial ? <td className="conf" colSpan={DIMENSIONES.length + 1}>Confidencial · {a.completos} respuesta(s)</td> : <>
              {DIMENSIONES.map((d) => { const v = a.dimensiones?.[d]; return v == null ? <td key={d}>—</td> : <td key={d} style={color(v)} title={`${a.nombre} · ${d}: ${v}`}>{v}</td>; })}
              <td style={{ ...color(a.indice!), fontWeight: 700 }}>{a.indice}</td></>}</tr>)}
        </tbody></table></div></div>}
    </>)}
    <div className="grid g2" style={{ marginTop: 16 }}>
      <div className="card"><h2>Comentarios abiertos <span className="muted" style={{ font: "500 13px var(--fb)" }}>{coment.length}</span></h2>
        {coment.slice(0, 30).map((c, i) => <blockquote key={i} className="quote">{c.texto}<small>{c.pregunta} · {c.area ?? "Área no mostrada (n<5)"}</small></blockquote>)}
        {!coment.length && <p className="muted">Sin comentarios o protegidos por confidencialidad.</p>}</div>
      <div className="card" style={{ padding: 0 }}><div style={{ padding: "16px 18px 6px" }}><h2 style={{ margin: 0 }}>Resultados individuales</h2><p className="muted" style={{ fontSize: 12 }}>Uso exclusivo de WellPeak. No compartir con la empresa.</p></div>
        <div className="tbl-wrap" style={{ border: 0 }}><table><thead><tr><th>Colaborador</th><th>Área</th><th className="r">Índice</th></tr></thead><tbody>
          {indiv.map((x, i) => <tr key={i}><td>{x.nombre}</td><td>{x.area}</td><td className="r num">{x.ix ?? "—"}</td></tr>)}
          {!indiv.length && <tr><td colSpan={3} className="muted">Sin respuestas completas.</td></tr>}
        </tbody></table></div></div>
    </div>
  </>;
}

// ============ Contenido ============
export function Contenido() {
  const [progs, setProgs] = useState<(Programa & { modulos: Modulo[] })[]>([]);
  const [qs, setQs] = useState<(Cuestionario & { n: number })[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const [p, m, q, r] = await Promise.all([
      api.from("programas").select("*").order("nombre"), api.from("modulos").select("*").order("orden"),
      api.from("cuestionarios").select("*").order("nombre"), api.from("reactivos").select("cuestionario_id"),
    ]);
    const mods = (m.data as Modulo[]) ?? [];
    setProgs(((p.data as Programa[]) ?? []).map((x) => ({ ...x, modulos: mods.filter((y) => y.programa_id === x.id) })));
    const cuenta = new Map<string, number>(); ((r.data ?? []) as { cuestionario_id: string }[]).forEach((x) => cuenta.set(x.cuestionario_id, (cuenta.get(x.cuestionario_id) ?? 0) + 1));
    setQs(((q.data as Cuestionario[]) ?? []).map((x) => ({ ...x, n: cuenta.get(x.id) ?? 0 })));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const qn = new Map(qs.map((q) => [q.id, q]));
  return <>
    <Encabezado titulo="Programas y cuestionarios" desc="Los cursos de WellPeak se cargan completos con el importador (plantilla de Excel + carpeta de videos y PDFs). Aquí se revisan y publican." />
    {msg && <Aviso>{msg}</Aviso>}
    {progs.map((p) => (
      <div key={p.id} className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><h2 style={{ margin: 0 }}>{p.nombre}</h2><span className="muted" style={{ fontSize: 13 }}>{p.modulos.length} módulos · {p.objetivo}</span></div>
          <div className="row">
            <select className="in" style={{ width: "auto" }} value={p.estado} onChange={async (x) => { await api.from("programas").update({ estado: x.target.value }).eq("id", p.id); await registrar(`Cambió «${p.nombre}» a ${x.target.value}`); setMsg("Estado actualizado"); cargar(); }}>
              {["Borrador", "Publicado", "Archivado"].map((s) => <option key={s}>{s}</option>)}</select>
            <button className="btn sm" onClick={() => setAbierto(abierto === p.id ? null : p.id)}>{abierto === p.id ? "Ocultar módulos" : "Ver módulos"}</button>
          </div>
        </div>
        {abierto === p.id && <div className="tbl-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>#</th><th>Módulo</th><th>Video</th><th>PDF</th><th>Evaluación</th></tr></thead><tbody>
          {p.modulos.map((m) => <tr key={m.id}><td className="num">{m.orden}</td><td><b>{m.titulo}</b><div className="muted" style={{ fontSize: 12 }}>{m.duracion_min ? `${m.duracion_min} min` : ""}</div></td>
            <td>{m.video_path ? pill("Sí", "good") : pill("Falta", "crit")}</td><td>{m.pdf_path ? pill("Sí", "good") : pill("Falta", "crit")}</td>
            <td>{m.evaluacion_id ? `${qn.get(m.evaluacion_id)?.n ?? 0} preguntas` : pill("Sin evaluación", "warn")}</td></tr>)}
        </tbody></table></div>}
      </div>
    ))}
    {!progs.length && <p className="note">Aún no hay programas. Cárgalos con <span className="num">npm run importar</span> (ver README).</p>}
    <div className="card"><h2>Cuestionarios</h2><div className="tbl-wrap"><table><thead><tr><th>Cuestionario</th><th>Tipo</th><th className="r">Reactivos</th></tr></thead><tbody>
      {qs.map((q) => <tr key={q.id}><td>{q.nombre}</td><td>{TIPOS_CUESTIONARIO[q.tipo]}</td><td className="r num">{q.n}</td></tr>)}
    </tbody></table></div></div>
  </>;
}

// ============ Usuarios del proyecto ============
export function Equipo() {
  const { lista } = useEmpresas();
  const [staff, setStaff] = useState<(Perfil & { empresas: string[] })[]>([]);
  const [msg, setMsg] = useState<{ t: string; k?: "error" } | null>(null);
  const cargar = useCallback(async () => {
    const [p, s] = await Promise.all([api.from("perfiles").select("*").neq("rol", "colaborador").order("nombre"), api.from("staff_empresas").select("*")]);
    const asig = (s.data ?? []) as { perfil_id: string; empresa_id: string }[];
    setStaff(((p.data as Perfil[]) ?? []).map((x) => ({ ...x, empresas: asig.filter((a) => a.perfil_id === x.id).map((a) => a.empresa_id) })));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  async function asignar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); const fd = new FormData(ev.currentTarget);
    const correo = String(fd.get("correo")).trim().toLowerCase(); const rol = String(fd.get("rol")) as Rol;
    const { data: p } = await api.from("perfiles").select("id").eq("correo", correo).maybeSingle();
    if (!p) return setMsg({ t: "Ese correo aún no tiene cuenta. Pide al programador crearla con «npm run admin» (ver README) y vuelve a asignarla aquí.", k: "error" });
    const { error } = await api.from("perfiles").update({ rol, empresa_id: null, area_id: null }).eq("id", p.id);
    if (error) return setMsg({ t: mensajeError(error), k: "error" });
    await api.from("staff_empresas").delete().eq("perfil_id", p.id);
    const emps = fd.getAll("emp").map(String);
    if (emps.length) await api.from("staff_empresas").insert(emps.map((empresa_id) => ({ perfil_id: p.id, empresa_id })));
    await registrar(`Asignó el rol ${ROLES[rol]} a ${correo}`);
    setMsg({ t: "Rol asignado" }); ev.currentTarget.reset(); cargar();
  }
  const en = new Map(lista.map((e) => [e.id, e.nombre]));
  return <>
    <Encabezado titulo="Usuarios del proyecto" desc="Personal de WellPeak con acceso a la consola. Cada rol ve sólo lo que necesita." />
    {msg && <Aviso tipo={msg.k}>{msg.t}</Aviso>}
    <div className="tbl-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Empresas</th></tr></thead><tbody>
      {staff.map((u) => <tr key={u.id}><td><div className="who"><div><b>{u.nombre} {u.apellido}</b><span>{u.correo}</span></div></div></td><td>{pill(ROLES[u.rol], "gold plain")}</td>
        <td>{u.rol === "superadmin" ? "Todas" : u.empresas.map((id) => en.get(id)).join(", ") || <span className="muted">Ninguna</span>}</td></tr>)}
    </tbody></table></div>
    <form className="card form" style={{ marginTop: 16 }} onSubmit={asignar}>
      <h2>Asignar rol</h2>
      <div className="f2"><label className="f">Correo de la cuenta<input className="in" name="correo" type="email" required /></label>
        <label className="f">Rol<select className="in" name="rol">{(["consultor", "editor", "superadmin"] as Rol[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select></label></div>
      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}><legend className="eyebrow" style={{ padding: "0 6px" }}>Empresas asignadas</legend>
        {lista.map((e) => <label key={e.id} className="row" style={{ gap: 8, margin: "4px 0" }}><input type="checkbox" name="emp" value={e.id} /> {e.nombre}</label>)}</fieldset>
      <div><button className="btn pri" type="submit">Guardar</button></div>
    </form>
  </>;
}
