import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, mensajeError, urlArchivo } from "../lib/api";
import { useSesion } from "../lib/sesion";
import { construirRuta, useColab } from "../lib/ruta";
import { AVISO_CONFIDENCIALIDAD, MENSAJE_ESCUCHAMOS_DEFAULT } from "../lib/textos";
import { TIPOS_CUESTIONARIO, type Cuestionario, type Reactivo, type Valores } from "../lib/tipos";
import { AppHead, ArchivoLink, Cargando, Icono, Pantalla } from "../ui/comun";
import { useIrAPaso } from "./Principal";

export function Aviso() {
  const { qid } = useParams();
  const { refrescar } = useSesion();
  const { datos } = useColab();
  const nav = useNavigate();
  async function aceptar() {
    await api.rpc("aceptar_aviso");
    await refrescar();
    nav(`/cuestionario/${qid}`, { replace: true });
  }
  return (
    <Pantalla head={<AppHead atras titulo="Antes de comenzar" empresa={datos?.empresa} />}>
      <div className="a-stack">
        <div><div className="a-eyebrow">Confidencialidad</div><h1 className="a-h1">Tu voz es anónima para tu empresa</h1></div>
        <div className="a-card" style={{ color: "var(--a-ink2)", fontSize: 15, lineHeight: 1.6 }}>{AVISO_CONFIDENCIALIDAD}</div>
        <div className="a-card a-stack" style={{ gap: 10, fontSize: 14 }}>
          <div className="step"><span className="ic">{Icono.candado}</span><span><b>Resultados agrupados</b><span>Áreas con menos de 5 respuestas no se reportan</span></span></div>
          <div className="step"><span className="ic">{Icono.evaluaciones}</span><span><b>Guardado automático</b><span>Puedes pausar y continuar después</span></span></div>
          <div className="step"><span className="ic">{Icono.ruta}</span><span><b>Con propósito</b><span>Tus respuestas definen tu ruta de aprendizaje</span></span></div>
        </div>
        <button className="a-btn" onClick={aceptar}>Entendido, comenzar</button>
      </div>
    </Pantalla>
  );
}

export function CuestionarioPantalla() {
  const { qid } = useParams();
  const [sp] = useSearchParams();
  const modulo = sp.get("modulo");
  const evento = sp.get("evento");
  const { perfil } = useSesion();
  const { datos, recargar } = useColab();
  const nav = useNavigate();
  const [q, setQ] = useState<Cuestionario | null>(null);
  const [rs, setRs] = useState<Reactivo[]>([]);
  const [idx, setIdx] = useState(0);
  const [val, setVal] = useState<Valores>({});
  const [err, setErr] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const guardarT = useRef<number>();

  useEffect(() => {
    if (!qid || !perfil) return;
    (async () => {
      const [c, r, b] = await Promise.all([
        api.from("cuestionarios").select("*").eq("id", qid).single(),
        api.from("reactivos").select("id,cuestionario_id,orden,tipo,texto,opciones,dimension").eq("cuestionario_id", qid).order("orden"),
        api.from("borradores").select("idx,valores").eq("perfil_id", perfil.id).eq("cuestionario_id", qid).maybeSingle(),
      ]);
      setQ(c.data as Cuestionario); setRs((r.data as Reactivo[]) ?? []);
      if (b.data) { setIdx(Math.min(b.data.idx, ((r.data ?? []).length || 1) - 1)); setVal(b.data.valores as Valores); }
    })();
  }, [qid, perfil]);

  // Guardado automático del borrador en cada respuesta
  function guardar(nIdx: number, nVal: Valores) {
    if (!perfil || !qid) return;
    window.clearTimeout(guardarT.current);
    guardarT.current = window.setTimeout(() => {
      api.from("borradores").upsert({ perfil_id: perfil.id, cuestionario_id: qid, idx: nIdx, valores: nVal, updated_at: new Date().toISOString() }).then(() => {});
    }, 400);
  }

  if (!q || !rs.length || !datos) return <Cargando />;
  const r = rs[idx];
  const v = val[r.id];
  const n = rs.length;
  const contestada = r.tipo === "abierta" || v != null;

  function responder(x: number | string) { const nv = { ...val, [r.id]: x }; setVal(nv); guardar(idx, nv); }
  async function siguiente() {
    setErr(null);
    if (idx < n - 1) { setIdx(idx + 1); guardar(idx + 1, val); return; }
    setEnviando(true);
    const limpio = Object.fromEntries(Object.entries(val).filter(([, x]) => x !== ""));
    const { error } = await api.rpc("enviar_respuestas", { p_cuestionario: q!.id, p_valores: limpio, p_modulo: modulo, p_evento: evento });
    setEnviando(false);
    if (error) return setErr(mensajeError(error));
    await recargar();
    nav(`/resultado/${q!.id}`, { replace: true });
  }

  return (
    <Pantalla head={<AppHead atras titulo={q.nombre} empresa={datos.empresa} />}>
      <div>
        <div className="a-eyebrow" style={{ marginTop: 6 }}>{TIPOS_CUESTIONARIO[q.tipo]}</div>
        <div className="q-top"><span>Pregunta <b className="num">{idx + 1}</b> de <b className="num">{n}</b></span><span className="num">{Math.round((idx / n) * 100)}%</span></div>
        <div className="a-prog"><i style={{ width: `${Math.round((idx / n) * 100)}%` }} /></div>
        <p className="q-text">{r.texto}</p>
        {r.tipo === "likert" && <>
          <div className="likert" role="group" aria-label="Escala del 1 al 5">
            {[1, 2, 3, 4, 5].map((k) => <button key={k} aria-pressed={v === k} onClick={() => responder(k)}>{k}</button>)}
          </div>
          <div className="lk-lbl"><span>En desacuerdo</span><span>Muy de acuerdo</span></div>
        </>}
        {r.tipo === "multiple" && (
          <div className="a-stack" style={{ gap: 10 }}>
            {(r.opciones ?? []).map((o, k) => <button key={k} className="opt" aria-pressed={v === k} onClick={() => responder(k)}><i />{o}</button>)}
          </div>
        )}
        {r.tipo === "abierta" && (
          <textarea className="a-in" rows={5} style={{ minHeight: 140 }} placeholder="Escribe con libertad; tu respuesta es confidencial."
            value={(v as string) ?? ""} onChange={(e) => responder(e.target.value)} />
        )}
        {err && <div className="a-err" role="alert" style={{ marginTop: 16 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
          {idx > 0 && <button className="a-btn sec" style={{ width: "40%" }} onClick={() => { setIdx(idx - 1); guardar(idx - 1, val); }}>Anterior</button>}
          <button className="a-btn" disabled={!contestada || enviando} onClick={siguiente}>{enviando ? "Enviando…" : idx === n - 1 ? "Enviar respuestas" : "Continuar"}</button>
        </div>
        <p className="lock-note" style={{ marginTop: 14 }}>{Icono.candado}<span>{q.tipo === "clima" ? "Confidencial. " : ""}Tus respuestas se guardan en cada pregunta.</span></p>
      </div>
    </Pantalla>
  );
}

interface Retro { reactivo_id: string; orden: number; tipo: string; texto: string; opciones: string[] | null; correcta: number | null; mi_respuesta: number | string | null }

export function Resultado() {
  const { qid } = useParams();
  const { datos } = useColab();
  const ir = useIrAPaso();
  const nav = useNavigate();
  const [retro, setRetro] = useState<Retro[] | null>(null);
  const q = qid ? datos?.cuestionarios.get(qid) : null;
  useEffect(() => {
    if (q?.tipo === "modulo") api.rpc("resultado_evaluacion", { p_cuestionario: q.id }).then(({ data }) => setRetro((data as Retro[]) ?? []));
  }, [q?.id, q?.tipo]);
  const ruta = useMemo(() => (datos ? construirRuta(datos) : null), [datos]);
  if (!datos || !q || !ruta) return <Cargando />;
  let cuerpo;
  if (q.tipo === "modulo") {
    const mc = (retro ?? []).filter((x) => x.tipo === "multiple" && x.correcta != null);
    const ok = mc.filter((x) => x.mi_respuesta === x.correcta).length;
    cuerpo = <>
      <div className="a-card a-stack" style={{ textAlign: "center" }}><div className="a-eyebrow">Módulo completado</div>
        <div style={{ font: "500 44px var(--fm)", color: "var(--a-gold)" }}>{ok}/{mc.length}</div><p className="a-sub">respuestas correctas</p></div>
      <div className="a-stack" style={{ gap: 10 }}>{mc.map((x) => (
        <div key={x.reactivo_id} className="a-card" style={{ padding: 12, fontSize: 14 }}><b>{x.mi_respuesta === x.correcta ? "✓ " : "✗ "}{x.texto}</b>
          <div className="a-sub" style={{ fontSize: 13, marginTop: 4 }}>Respuesta correcta: {x.opciones?.[x.correcta!]}</div></div>
      ))}</div>
    </>;
  } else if (q.tipo === "clima") {
    cuerpo = <>
      <div className="a-card a-stack" style={{ textAlign: "center" }}><div className="a-eyebrow">¡Gracias!</div>
        <b style={{ fontSize: 18 }}>{ruta.diagnosticoCompleto ? "Completaste tu diagnóstico de clima" : "Guardamos esta parte del diagnóstico"}</b>
        <p className="a-sub">{ruta.diagnosticoCompleto ? "Tus respuestas se suman a las de tu área de forma confidencial." : "Te falta poco: continúa con la siguiente parte."}</p></div>
      {ruta.diagnosticoCompleto && datos.empresa.programa_liberado && (
        <div className="a-card a-stack"><div className="a-eyebrow">Lo que escuchamos</div><p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{datos.empresa.mensaje_escuchamos || MENSAJE_ESCUCHAMOS_DEFAULT}</p></div>
      )}
      {ruta.diagnosticoCompleto && <button className="a-btn sec" onClick={() => nav("/reporte")}>Ver mi reporte personal</button>}
    </>;
  } else if (q.tipo === "base") {
    cuerpo = <div className="a-card a-stack" style={{ textAlign: "center" }}><div className="a-eyebrow">Punto de partida registrado</div><b style={{ fontSize: 18 }}>¡Listo para iniciar tu programa!</b><p className="a-sub">Al concluir repetiremos estas preguntas para medir tu avance.</p></div>;
  } else {
    cuerpo = <div className="a-card a-stack" style={{ textAlign: "center" }}><div className="a-eyebrow">Evento presencial</div><b style={{ fontSize: 18 }}>Gracias por evaluar la experiencia</b><p className="a-sub">Tu opinión mejora los próximos talleres.</p></div>;
  }
  return (
    <Pantalla head={<AppHead atras titulo="Resultado" empresa={datos.empresa} />}>
      <div className="a-stack" style={{ paddingTop: 6 }}>
        {cuerpo}
        {ruta.siguiente ? <button className="a-btn" onClick={() => ir(ruta.siguiente)}>Continuar · {ruta.siguiente.titulo}</button>
          : <button className="a-btn" onClick={() => nav("/")}>Ir al inicio</button>}
      </div>
    </Pantalla>
  );
}

export function ModuloPantalla() {
  const { id } = useParams();
  const { datos, recargar } = useColab();
  const nav = useNavigate();
  const [video, setVideo] = useState<string | null>(null);
  const m = datos?.modulos.find((x) => x.id === id);
  useEffect(() => { if (m?.video_path) urlArchivo(m.video_path).then(setVideo); }, [m?.video_path]);
  if (!datos || !m || !datos.programa) return <Cargando />;
  const paso = construirRuta(datos).pasos.find((p) => p.moduloId === m.id);
  const hecho = !!paso?.hecho, bloqueado = paso?.estado === "bloqueado";
  const evaluacion = m.evaluacion_id ? datos.cuestionarios.get(m.evaluacion_id) : null;
  async function sinEvaluacion() { await api.rpc("completar_modulo", { p_modulo: m!.id }); await recargar(); nav("/"); }
  return (
    <Pantalla head={<AppHead atras titulo={datos.programa.nombre} empresa={datos.empresa} />}>
      <div className="a-stack">
        <div style={{ textAlign: "center", paddingTop: 4 }}>
          <div className="a-eyebrow">{datos.programa.nombre}{m.duracion_min ? ` · ${m.duracion_min} min` : ""}</div>
          <div style={{ font: "600 30px/1.1 var(--fd)", marginTop: 8 }}>Módulo {m.orden}</div>
          <div style={{ font: "600 20px/1.3 var(--fd)", color: "var(--a-gold)", marginTop: 4 }}>“{m.titulo}”</div>
          {hecho && <div style={{ marginTop: 8 }}><span className="chip" aria-pressed="true">✓ Completado</span></div>}
        </div>
        {bloqueado && <div className="a-err">Completa los pasos anteriores de tu ruta para abrir este módulo.</div>}
        {!bloqueado && <>
          {m.intro && <div className="a-card"><div className="a-eyebrow" style={{ marginBottom: 8 }}>Introducción</div><p style={{ margin: 0, lineHeight: 1.6, color: "var(--a-ink2)", whiteSpace: "pre-line" }}>{m.intro}</p></div>}
          {m.video_path && <div className="a-stack" style={{ gap: 8 }}><b>Video</b>{video ? <video className="vid" src={video} controls playsInline preload="metadata" /> : <div className="vid" />}</div>}
          {m.pdf_path && (
            <div className="res">
              <span className="ic pdf">PDF</span>
              <span style={{ flex: 1, minWidth: 0 }}><b>{m.pdf_nombre ?? "Material del módulo"}</b><span>Descargable</span></span>
              <ArchivoLink className="chip" path={m.pdf_path}>Ver</ArchivoLink>
              <ArchivoLink className="chip" path={m.pdf_path} descargar={`${m.pdf_nombre ?? "material"}.pdf`} label="Descargar PDF">{Icono.descargar}</ArchivoLink>
            </div>
          )}
          {evaluacion ? (
            <button className="a-btn" onClick={() => nav(hecho ? `/resultado/${evaluacion.id}` : `/cuestionario/${evaluacion.id}?modulo=${m.id}`)}>
              {hecho ? "Ver resultado de la evaluación" : "Evaluación del módulo"}
            </button>
          ) : !hecho && <button className="a-btn" onClick={sinEvaluacion}>Marcar como visto</button>}
        </>}
      </div>
    </Pantalla>
  );
}
