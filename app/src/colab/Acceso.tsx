import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, mensajeError } from "../lib/api";
import { useSesion } from "../lib/sesion";
import { AVISO_PRIVACIDAD_URL } from "../lib/textos";
import { AppHead, Icono, LOGO_WELLPEAK, OrgBadge, Pantalla } from "../ui/comun";

const Marca = () => (
  <div style={{ textAlign: "center", display: "grid", gap: 10, justifyItems: "center", paddingTop: 8 }}>
    <img src={LOGO_WELLPEAK} alt="WellPeak" style={{ width: 120, height: 120, borderRadius: 24 }} />
    <div className="hero" style={{ border: 0, background: "none", padding: 0 }}><div className="pl" style={{ fontSize: 44, margin: 0 }}>PULSE</div></div>
    <p className="a-sub">Plataforma de desarrollo organizacional y bienestar</p>
  </div>
);

export function Entrar() {
  const [correo, setCorreo] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nav = useNavigate();
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErr(null); setEnviando(true);
    const { error } = await api.auth.signInWithPassword({ email: correo.trim().toLowerCase(), password: pass });
    setEnviando(false);
    if (error) { setErr(mensajeError(error)); return; }
    nav("/", { replace: true });
  }
  return (
    <Pantalla head={<div className="a-head" />}>
      <div className="a-stack">
        <Marca />
        <form className="a-stack" onSubmit={enviar} noValidate>
          {err && <div className="a-err" role="alert">{err}</div>}
          <label className="a-lbl">Correo<input className="a-in" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required /></label>
          <label className="a-lbl">Contraseña<input className="a-in" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required /></label>
          <button className="a-btn" type="submit" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
        </form>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
          <Link className="a-link" to="/recuperar">¿Olvidaste tu contraseña?</Link>
          <Link className="a-link" to="/registro">Crear cuenta</Link>
        </div>
        <Link className="a-btn sec" to="/instalar">{Icono.celular} Instalar PULSE en mi celular</Link>
      </div>
    </Pantalla>
  );
}

interface EmpresaCodigo { empresa_id: string; nombre: string; sigla: string | null; color: string; logo_url: string | null; areas: { id: string; nombre: string }[] }

export function Registro() {
  const [codigo, setCodigo] = useState("");
  const [emp, setEmp] = useState<EmpresaCodigo | null>(null);
  const [f, setF] = useState({ nombre: "", apellido: "", correo: "", area: "", pass: "", ok: false });
  const [err, setErr] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const nav = useNavigate();

  async function validar(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const { data, error } = await api.rpc("empresa_por_codigo", { p_codigo: codigo });
    const fila = (data as EmpresaCodigo[] | null)?.[0];
    if (error || !fila) { setErr("Ese código no corresponde a ninguna empresa. Revisa tu invitación."); return; }
    setEmp(fila); setF((x) => ({ ...x, area: fila.areas[0]?.id ?? "" }));
  }
  async function crear(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const correo = f.correo.trim().toLowerCase();
    if (!f.nombre.trim() || !f.apellido.trim()) return setErr("Escribe tu nombre y apellidos.");
    if (!/^\S+@\S+\.\S+$/.test(correo)) return setErr("Escribe un correo válido.");
    if (f.pass.length < 8) return setErr("La contraseña debe tener al menos 8 caracteres.");
    if (!f.ok) return setErr("Acepta el aviso de privacidad para continuar.");
    setEnviando(true);
    const { data, error } = await api.auth.signUp({
      email: correo, password: f.pass,
      options: { emailRedirectTo: window.location.origin + "/", data: { codigo, nombre: f.nombre.trim(), apellido: f.apellido.trim(), area_id: f.area } },
    });
    setEnviando(false);
    if (error) return setErr(mensajeError(error));
    if (data.session) nav("/", { replace: true }); else setListo(true);
  }
  return (
    <Pantalla head={<AppHead atras titulo="Crear cuenta" />}>
      <div className="a-stack">
        <div><div className="a-eyebrow">Paso {emp ? 2 : 1} de 2</div><h1 className="a-h1">{listo ? "Revisa tu correo" : emp ? "Tus datos" : "Código de tu empresa"}</h1>
          <p className="a-sub">{listo ? `Te enviamos un enlace a ${f.correo} para confirmar tu cuenta.` : emp ? `Te registrarás en ${emp.nombre}.` : "Lo encuentras en la invitación que te envió tu área de Recursos Humanos."}</p></div>
        {err && <div className="a-err" role="alert">{err}</div>}
        {listo ? <Link className="a-btn" to="/entrar">Ir a iniciar sesión</Link> : !emp ? (
          <form className="a-stack" onSubmit={validar}>
            <label className="a-lbl">Código de empresa<input className="a-in" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej. ALTA-2026" autoCapitalize="characters" required /></label>
            <button className="a-btn" type="submit">Validar código</button>
          </form>
        ) : (
          <form className="a-stack" onSubmit={crear} noValidate>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}><OrgBadge empresa={emp} /><b>{emp.nombre}</b></div>
            <label className="a-lbl">Nombre<input className="a-in" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoComplete="given-name" /></label>
            <label className="a-lbl">Apellidos<input className="a-in" value={f.apellido} onChange={(e) => setF({ ...f, apellido: e.target.value })} autoComplete="family-name" /></label>
            <label className="a-lbl">Correo<input className="a-in" type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} autoComplete="email" /></label>
            <label className="a-lbl">Área<select className="a-in" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>{emp.areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
            <label className="a-lbl">Contraseña (mínimo 8 caracteres)<input className="a-in" type="password" autoComplete="new-password" value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} /></label>
            <label className="lock-note" style={{ fontSize: 13 }}><input type="checkbox" checked={f.ok} onChange={(e) => setF({ ...f, ok: e.target.checked })} /> <span>Acepto el <Link className="a-link inline" to={AVISO_PRIVACIDAD_URL}>aviso de privacidad</Link> y entiendo que mis respuestas son confidenciales.</span></label>
            <button className="a-btn" type="submit" disabled={enviando}>{enviando ? "Creando…" : "Crear mi cuenta"}</button>
          </form>
        )}
      </div>
    </Pantalla>
  );
}

export function Recuperar() {
  const [correo, setCorreo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const { error } = await api.auth.resetPasswordForEmail(correo.trim().toLowerCase(), { redirectTo: window.location.origin + "/nueva-contrasena" });
    if (error) return setErr(mensajeError(error));
    setEnviado(true);
  }
  return (
    <Pantalla head={<AppHead atras titulo="Recuperar contraseña" />}>
      <div className="a-stack">
        <div><div className="a-eyebrow">Recuperación</div><h1 className="a-h1">¿Olvidaste tu contraseña?</h1><p className="a-sub">Te enviaremos un enlace a tu correo registrado para crear una nueva.</p></div>
        {err && <div className="a-err" role="alert">{err}</div>}
        {enviado ? <div className="a-ok" role="status">Si {correo} tiene cuenta en PULSE, en unos minutos recibirás el enlace. Revisa también tu carpeta de spam.</div> : (
          <form className="a-stack" onSubmit={enviar}>
            <label className="a-lbl">Correo<input className="a-in" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required /></label>
            <button className="a-btn" type="submit">Enviar enlace</button>
          </form>
        )}
      </div>
    </Pantalla>
  );
}

/** Destino de los enlaces de recuperación y de invitación: define la contraseña. */
export function NuevaContrasena() {
  const { session, refrescar } = useSesion();
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  async function guardar(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (pass.length < 8) return setErr("La contraseña debe tener al menos 8 caracteres.");
    const { error } = await api.auth.updateUser({ password: pass });
    if (error) return setErr(mensajeError(error));
    await api.from("perfiles").select("id").limit(1); // asegura sesión vigente
    await refrescar();
    nav("/", { replace: true });
  }
  return (
    <Pantalla head={<div className="a-head" />}>
      <div className="a-stack">
        <Marca />
        <div><h1 className="a-h1">Crea tu contraseña</h1><p className="a-sub">Con ella entrarás a PULSE desde tu celular o tu computadora.</p></div>
        {!session && !api.auth.hayEnlacePendiente() && <div className="a-err">El enlace venció o ya se usó. Solicita uno nuevo en «¿Olvidaste tu contraseña?».</div>}
        {err && <div className="a-err" role="alert">{err}</div>}
        <form className="a-stack" onSubmit={guardar}>
          <label className="a-lbl">Nueva contraseña (mínimo 8 caracteres)<input className="a-in" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
          <button className="a-btn" type="submit"    disabled={!session && !api.auth.hayEnlacePendiente()}>Guardar y entrar</button>
        </form>
      </div>
    </Pantalla>
  );
}

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function Instalar() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const li = { margin: 0, paddingLeft: 20, color: "var(--a-ink2)", fontSize: 14, lineHeight: 1.7 };
  return (
    <Pantalla head={<AppHead atras titulo="Instala PULSE" />}>
      <div className="a-stack">
        <div><div className="a-eyebrow">En tu celular</div><h1 className="a-h1">Agrega el ícono de PULSE</h1>
          <p className="a-sub">PULSE vive en la web. Agrega su ícono a tu pantalla de inicio y se abrirá como una app, a pantalla completa. No necesitas App Store ni Google Play.</p></div>
        {evento && <button className="a-btn" onClick={async () => { await evento.prompt(); setEvento(null); }}>Instalar PULSE ahora</button>}
        <div className="a-card a-stack" style={{ gap: 10, order: ios ? -1 : 0 }}>
          <b>iPhone y iPad · desde Safari</b>
          <ol style={li}><li>Abre el enlace de tu invitación en <b>Safari</b></li><li>Toca <b>Compartir</b> (cuadro con flecha hacia arriba)</li><li>Elige <b>Agregar a inicio</b> y confirma</li></ol>
        </div>
        <div className="a-card a-stack" style={{ gap: 10 }}>
          <b>Android · desde Chrome</b>
          <ol style={li}><li>Abre el enlace en <b>Chrome</b></li><li>Toca el menú <b>⋮</b></li><li>Elige <b>Instalar app</b> o <b>Agregar a pantalla principal</b></li></ol>
        </div>
        <div className="a-card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <img src="/icons/apple-touch-icon.png" alt="Ícono de PULSE" style={{ width: 60, height: 60, borderRadius: 14 }} />
          <span><b>Así se verá el ícono</b><span className="a-sub" style={{ display: "block", fontSize: 13 }}>«PULSE» en tu pantalla de inicio. Al tocarlo entras directo con tu sesión.</span></span>
        </div>
      </div>
    </Pantalla>
  );
}

export function AvisoPrivacidad() {
  return (
    <Pantalla head={<AppHead atras titulo="Aviso de privacidad" />}>
      <div className="a-stack">
        <h1 className="a-h1">Aviso de privacidad</h1>
        {/* TODO(legal): sustituir por el texto aprobado por el abogado de WellPeak antes del lanzamiento. */}
        <div className="a-card a-sub">El aviso de privacidad de WellPeak se publicará aquí en su versión aprobada.</div>
      </div>
    </Pantalla>
  );
}
