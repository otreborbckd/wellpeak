import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useSesion } from "../lib/sesion";
import { construirRuta, indice100, useColab, type Paso } from "../lib/ruta";
import { SOPORTE, TEXTO_BIENVENIDA } from "../lib/textos";
import { DIMENSIONES, TIPOS_CUESTIONARIO, type Reactivo, type Recurso, type Valores } from "../lib/tipos";
import { AppHead, ArchivoLink, Cargando, esInstalada, Icono, LOGO_WELLPEAK, OrgBadge, Pantalla } from "../ui/comun";

export function useIrAPaso() {
  const nav = useNavigate();
  const { perfil } = useSesion();
  const { datos } = useColab();
  return (p: Paso | null) => {
    if (!p || !datos) return nav("/");
    if (p.tipo === "modulo") return nav(`/modulo/${p.moduloId}`);
    const q = datos.cuestionarios.get(p.cuestionarioId!);
    if (q?.tipo === "clima" && !perfil?.aviso_aceptado_at) return nav(`/aviso/${p.cuestionarioId}`);
    nav(`/cuestionario/${p.cuestionarioId}${p.eventoId ? `?evento=${p.eventoId}` : ""}`);
  };
}

const nombreCorto = (n?: string | null, a?: string | null) => `${n ?? ""} ${(a ?? "").split(" ")[0]}`.trim();

export function Inicio() {
  const { perfil } = useSesion();
  const { datos, error } = useColab();
  const ir = useIrAPaso();
  const ruta = useMemo(() => (datos ? construirRuta(datos) : null), [datos]);
  if (error) return <div className="center">No pudimos cargar tu información. {error}</div>;
  if (!datos || !ruta || !perfil) return <Cargando />;
  const { empresa } = datos;
  const s = ruta.siguiente;
  const primera = ruta.pasos.every((p) => !p.hecho);
  const meta = (p: Paso) => {
    if (p.tipo === "modulo") { const m = datos.modulos.find((x) => x.id === p.moduloId); return `Video · guía PDF · evaluación${m?.duracion_min ? ` · ${m.duracion_min} min` : ""}`; }
    return p.fase;
  };
  const modulo = s?.tipo === "modulo" ? datos.modulos.find((m) => m.id === s.moduloId) : null;
  return (
    <Pantalla tabs head={<AppHead empresa={empresa} nombre={`${perfil.nombre ?? ""} ${perfil.apellido ?? ""}`} />}>
      <div className="a-stack">
        <div><div className="a-eyebrow">Bienvenida</div><h1 className="a-h1">{nombreCorto(perfil.nombre, perfil.apellido)}</h1></div>
        <div className="hero">
          <div className="org"><OrgBadge empresa={empresa} size={48} /></div>
          <div className="a-eyebrow" style={{ color: "var(--a-ink2)" }}>{empresa.nombre}</div>
          <div className="pl">PULSE</div>
          <div className="by"><img src={LOGO_WELLPEAK} alt="WellPeak" style={{ width: 34, height: 34 }} /><span>by WellPeak</span></div>
        </div>
        {!esInstalada() && (
          <Link to="/instalar" className="banner-inst" style={{ textDecoration: "none" }}>{Icono.celular}<span><b>Agrega PULSE a tu pantalla de inicio</b> para entrar como una app.</span></Link>
        )}
        {modulo && datos.programa ? (
          <div className="a-card a-stack" style={{ textAlign: "center" }}>
            <div className="a-eyebrow">{datos.programa.nombre}</div>
            <div style={{ font: "600 30px/1.1 var(--fd)" }}>Módulo {modulo.orden}</div>
            <div style={{ font: "600 20px/1.3 var(--fd)", color: "var(--a-gold)" }}>“{modulo.titulo}”</div>
            <button className="a-btn" onClick={() => ir(s)}>Continuar</button>
          </div>
        ) : s ? (
          <div className="a-card a-stack">
            <div className="step"><span className="ic">{Icono.pregunta}</span><span><b>{s.titulo}</b><span>{meta(s)}</span></span></div>
            <button className="a-btn" onClick={() => ir(s)}>{primera ? "Comenzar" : "Continuar"}</button>
          </div>
        ) : ruta.programaPendiente ? (
          <div className="a-card a-stack"><div className="a-eyebrow">Diagnóstico completado</div><b style={{ fontSize: 17 }}>Gracias por tu participación</b>
            <p className="a-sub">El equipo WellPeak está analizando los resultados de tu área para diseñar tu programa. Te avisaremos cuando esté listo.</p></div>
        ) : (
          <div className="a-card a-stack"><div className="a-eyebrow">Ruta completada</div><b style={{ fontSize: 17 }}>¡Concluiste tu programa!</b>
            <Link className="a-btn sec" to="/reporte">Ver mi reporte</Link></div>
        )}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span className="a-sub" style={{ fontSize: 13 }}>Tu avance</span><b className="num">{ruta.avance}%</b></div>
          <div className="a-prog"><i style={{ width: `${ruta.avance}%` }} /></div>
        </div>
        <p className="a-sub">{TEXTO_BIENVENIDA}</p>
      </div>
    </Pantalla>
  );
}

export function Ruta() {
  const { perfil } = useSesion();
  const { datos } = useColab();
  const ir = useIrAPaso();
  const nav = useNavigate();
  if (!datos || !perfil) return <Cargando />;
  const r = construirRuta(datos);
  const abrir = (p: Paso) => {
    if (p.estado === "bloqueado") return;
    if (p.hecho && p.tipo === "cuestionario") return nav(`/resultado/${p.cuestionarioId}`);
    ir(p);
  };
  return (
    <Pantalla tabs head={<AppHead empresa={datos.empresa} nombre={`${perfil.nombre ?? ""} ${perfil.apellido ?? ""}`} />}>
      <div className="a-stack">
        <div><div className="a-eyebrow">Mi ruta</div><h1 className="a-h1">{r.avance}% completado</h1><div className="a-prog" style={{ marginTop: 10 }}><i style={{ width: `${r.avance}%` }} /></div></div>
        <div className="route">
          {r.pasos.map((p, i) => (
            <button key={p.clave} className={`rt ${p.estado === "hecho" ? "done" : p.estado === "siguiente" ? "now" : "lock"}`} onClick={() => abrir(p)} aria-disabled={p.estado === "bloqueado"}>
              <span className="dot">{p.hecho ? "✓" : i + 1}</span>
              <span><b>{p.titulo}</b><span>{p.fase}</span></span>
              <span>{p.estado === "siguiente" ? <span className="chip" aria-pressed="true">Siguiente</span> : p.estado === "bloqueado" ? Icono.candado : null}</span>
            </button>
          ))}
          {r.programaPendiente && <div className="rt lock"><span className="dot">…</span><span><b>Programa de desarrollo</b><span>Se asigna después del diagnóstico</span></span><span /></div>}
        </div>
      </div>
    </Pantalla>
  );
}

export function Evaluaciones() {
  const { perfil } = useSesion();
  const { datos } = useColab();
  const ir = useIrAPaso();
  const nav = useNavigate();
  if (!datos || !perfil) return <Cargando />;
  const r = construirRuta(datos);
  const grupos = new Map<string, { p: Paso; id: string; nombre: string }[]>();
  for (const p of r.pasos) {
    const qid = p.tipo === "modulo" ? datos.modulos.find((m) => m.id === p.moduloId)?.evaluacion_id : p.cuestionarioId;
    const q = qid ? datos.cuestionarios.get(qid) : null;
    if (!q) continue;
    const g = TIPOS_CUESTIONARIO[q.tipo];
    grupos.set(g, [...(grupos.get(g) ?? []), { p, id: q.id, nombre: q.nombre.replace(/^Evaluación · /, "") }]);
  }
  return (
    <Pantalla tabs head={<AppHead empresa={datos.empresa} nombre={`${perfil.nombre ?? ""} ${perfil.apellido ?? ""}`} />}>
      <div className="a-stack">
        <div><div className="a-eyebrow">Evaluaciones</div><h1 className="a-h1">Tus cuestionarios</h1></div>
        {r.diagnosticoCompleto && (
          <Link to="/reporte" className="res" style={{ textDecoration: "none" }}><span className="ic texto">◔</span><span><b>Mi reporte personal</b><span>Tus resultados por dimensión de clima</span></span></Link>
        )}
        {[...grupos].map(([g, items]) => (
          <div key={g} className="a-stack" style={{ gap: 8 }}>
            <b style={{ fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--a-mut)" }}>{g}</b>
            {items.map(({ p, id, nombre }) => (
              <button key={p.clave} className="res" onClick={() => (p.hecho ? nav(`/resultado/${id}`) : p.estado === "siguiente" ? ir(p) : undefined)} aria-disabled={p.estado === "bloqueado"}>
                <span className={`ic ${p.hecho ? "enlace" : p.estado === "siguiente" ? "texto" : "video"}`}>{p.hecho ? "✓" : p.estado === "siguiente" ? "●" : Icono.candado}</span>
                <span><b>{nombre}</b><span>{p.hecho ? "Respondido · ver resultado" : p.estado === "siguiente" ? "Disponible" : "Se habilita al avanzar en tu ruta"}</span></span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </Pantalla>
  );
}

export function Reporte() {
  const { perfil } = useSesion();
  const { datos } = useColab();
  const [dims, setDims] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!datos || !perfil) return;
    const ids = datos.diagnostico.map((q) => q.id);
    (async () => {
      const [{ data: rs }, { data: rx }] = await Promise.all([
        api.from("respuestas").select("cuestionario_id, valores").eq("perfil_id", perfil.id).in("cuestionario_id", ids),
        api.from("reactivos").select("id, tipo, dimension").in("cuestionario_id", ids),
      ]);
      const acc: Record<string, number[]> = {};
      const reactivos = (rx ?? []) as Pick<Reactivo, "id" | "tipo" | "dimension">[];
      for (const r of (rs ?? []) as { valores: Valores }[]) {
        for (const x of reactivos) {
          const v = r.valores[x.id];
          if (x.tipo === "likert" && x.dimension && typeof v === "number") (acc[x.dimension] ??= []).push(v);
        }
      }
      setDims(Object.fromEntries(Object.entries(acc).map(([d, vs]) => [d, indice100(vs.reduce((a, b) => a + b, 0) / vs.length)])));
    })();
  }, [datos, perfil]);
  if (!datos || !dims) return <Cargando />;
  const vals = Object.values(dims);
  const ix = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  return (
    <Pantalla head={<AppHead atras titulo="Mi reporte personal" empresa={datos.empresa} />}>
      <div className="a-stack">
        {ix == null ? <div className="a-card">Completa tu diagnóstico de clima para ver tu reporte.</div> : <>
          <div><div className="a-eyebrow">Reporte personal</div><h1 className="a-h1">Tu índice de clima: <span className="num" style={{ color: "var(--a-gold)" }}>{ix}</span><span className="a-sub" style={{ fontSize: 15 }}> / 100</span></h1>
            <p className="a-sub">Así percibes hoy tu entorno de trabajo, por dimensión.</p></div>
          <div className="a-card a-bars">
            {DIMENSIONES.filter((d) => dims[d] != null).map((d) => (
              <div key={d}><div className="l"><span>{d}</span><b>{dims[d]}</b></div><div className="a-prog"><i style={{ width: `${dims[d]}%` }} /></div></div>
            ))}
          </div>
          <p className="lock-note">{Icono.candado}<span>Sólo tú y el equipo WellPeak designado ven este reporte. Tu empresa no recibe resultados individuales.</span></p>
          <button className="a-btn sec no-print" onClick={() => window.print()}>{Icono.descargar} Guardar como PDF</button>
        </>}
      </div>
    </Pantalla>
  );
}

const TIPO_IC: Record<Recurso["tipo"], string> = { pdf: "PDF", video: "MP4", enlace: "URL", texto: "TXT", imagen: "IMG", plantilla: "XLS" };

export function Recursos() {
  const { perfil } = useSesion();
  const { datos } = useColab();
  const [lista, setLista] = useState<Recurso[] | null>(null);
  const [filtro, setFiltro] = useState<string>("todos");
  useEffect(() => { api.from("recursos").select("*").eq("publicado", true).order("nombre").then(({ data }) => setLista((data as Recurso[]) ?? [])); }, []);
  if (!datos || !perfil || !lista) return <Cargando />;
  // Además de los recursos, las guías PDF de los módulos ya desbloqueados
  const r = construirRuta(datos);
  const abiertos = new Set(r.pasos.filter((p) => p.tipo === "modulo" && p.estado !== "bloqueado").map((p) => p.moduloId));
  const guias = datos.modulos.filter((m) => abiertos.has(m.id) && m.pdf_path).map((m) => ({ id: "m" + m.id, nombre: m.pdf_nombre ?? `Guía · Módulo ${m.orden}`, tipo: "pdf" as const, path: m.pdf_path, url: null }));
  const todos = [...guias, ...lista.map((x) => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, path: x.path, url: x.url }))]
    .filter((x) => filtro === "todos" || x.tipo === filtro || (filtro === "otros" && !["pdf", "video", "enlace"].includes(x.tipo)));
  const F: [string, string][] = [["todos", "Todos"], ["pdf", "PDF"], ["video", "Videos"], ["enlace", "Enlaces"], ["otros", "Descargables"]];
  return (
    <Pantalla tabs head={<AppHead empresa={datos.empresa} nombre={`${perfil.nombre ?? ""} ${perfil.apellido ?? ""}`} />}>
      <div className="a-stack">
        <div><div className="a-eyebrow">Otros recursos</div><h1 className="a-h1">Material de apoyo</h1><p className="a-sub">PDFs, videos y enlaces para consultar o descargar en tu teléfono.</p></div>
        <div className="chips" role="group" aria-label="Filtrar">{F.map(([k, l]) => <button key={k} className="chip" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{l}</button>)}</div>
        <div className="a-stack" style={{ gap: 10 }}>
          {todos.length === 0 && <p className="a-sub">No hay recursos de este tipo todavía.</p>}
          {todos.map((x) => (
            <div key={x.id} className="res">
              <span className={`ic ${x.tipo}`}>{TIPO_IC[x.tipo]}</span>
              <span style={{ flex: 1, minWidth: 0 }}><b>{x.nombre}</b><span>{x.tipo === "enlace" ? "Abre en el navegador" : "Ver o descargar"}</span></span>
              {x.url ? <a className="chip" href={x.url} target="_blank" rel="noopener" style={{ textDecoration: "none" }}>Abrir</a> : x.path && <>
                <ArchivoLink className="chip" path={x.path}>Ver</ArchivoLink>
                <ArchivoLink className="chip" path={x.path} descargar={`${x.nombre}.${x.path.split(".").pop()}`} label={`Descargar ${x.nombre}`}>{Icono.descargar}</ArchivoLink>
              </>}
            </div>
          ))}
        </div>
      </div>
    </Pantalla>
  );
}

export function Perfil() {
  const { perfil, salir } = useSesion();
  const { datos } = useColab();
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const nav = useNavigate();
  if (!perfil || !datos) return <Cargando />;
  async function cambiar() {
    if (pass.length < 8) return setMsg("La contraseña debe tener al menos 8 caracteres.");
    const { error } = await api.auth.updateUser({ password: pass });
    setMsg(error ? error.message : "Contraseña actualizada."); setPass("");
  }
  return (
    <Pantalla head={<AppHead atras titulo="Mi perfil" empresa={datos.empresa} />}>
      <div className="a-stack">
        <div><b style={{ fontSize: 18 }}>{perfil.nombre} {perfil.apellido}</b><div className="a-sub" style={{ fontSize: 13 }}>{perfil.correo}</div></div>
        <div className="a-card" style={{ display: "flex", gap: 12, alignItems: "center" }}><OrgBadge empresa={datos.empresa} size={40} /><div><b>{datos.empresa.nombre}</b><div className="a-sub" style={{ fontSize: 13 }}>{datos.area?.nombre}{perfil.puesto ? ` · ${perfil.puesto}` : ""}</div></div></div>
        <div className="a-card a-stack" style={{ gap: 10 }}>
          <b>Cambiar contraseña</b>
          <input className="a-in" type="password" autoComplete="new-password" placeholder="Nueva contraseña" value={pass} onChange={(e) => setPass(e.target.value)} />
          {msg && <div className="a-ok">{msg}</div>}
          <button className="a-btn sec" onClick={cambiar}>Guardar contraseña</button>
        </div>
        <div className="a-card a-sub">{SOPORTE}</div>
        <button className="a-btn sec" onClick={async () => { await salir(); nav("/entrar", { replace: true }); }}>Cerrar sesión</button>
      </div>
    </Pantalla>
  );
}
