import { useEffect, useState, type ReactNode } from "react";
import { urlArchivo } from "../lib/api";
import { NavLink, useNavigate } from "react-router-dom";
import type { Empresa } from "../lib/tipos";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Icono = {
  inicio: <svg viewBox="0 0 24 24" {...P}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>,
  ruta: <svg viewBox="0 0 24 24" {...P}><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></svg>,
  evaluaciones: <svg viewBox="0 0 24 24" {...P}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>,
  recursos: <svg viewBox="0 0 24 24" {...P}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  atras: <svg viewBox="0 0 24 24" width="18" height="18" {...P} strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>,
  candado: <svg viewBox="0 0 24 24" width="14" height="14" {...P} strokeWidth={2}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  pregunta: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" /></svg>,
  descargar: <svg viewBox="0 0 24 24" width="18" height="18" {...P} strokeWidth={2}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>,
  celular: <svg viewBox="0 0 24 24" width="18" height="18" {...P}><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>,
};

export const LOGO_WELLPEAK = "/icons/icon-512.png";

export function OrgBadge({ empresa, size = 44 }: { empresa: Pick<Empresa, "nombre" | "sigla" | "color" | "logo_url"> | null; size?: number }) {
  if (!empresa) return null;
  return (
    <span className="badge-org" style={{ width: size, height: size, background: empresa.color, fontSize: Math.round(size / 3.2) }}>
      {empresa.logo_url ? <img src={empresa.logo_url} alt={empresa.nombre} /> : empresa.sigla}
    </span>
  );
}

export const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function AppHead({ empresa, titulo, atras, nombre }: { empresa?: Empresa | null; titulo?: string; atras?: boolean; nombre?: string }) {
  const nav = useNavigate();
  if (atras) {
    return (
      <div className="a-head">
        <button className="back" onClick={() => nav(-1)} aria-label="Regresar">{Icono.atras}</button>
        <div style={{ minWidth: 0, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo}</div>
        <span className="sp" />
        <OrgBadge empresa={empresa ?? null} size={32} />
      </div>
    );
  }
  return (
    <div className="a-head">
      <span className="pw">PULSE</span>
      <img className="wp" src={LOGO_WELLPEAK} alt="WellPeak" />
      <span className="sp" />
      <OrgBadge empresa={empresa ?? null} size={34} />
      {nombre && <button className="a-av" onClick={() => nav("/perfil")} aria-label="Mi perfil">{iniciales(nombre)}</button>}
    </div>
  );
}

const TABS: [string, string, keyof typeof Icono][] = [
  ["/", "Inicio", "inicio"], ["/ruta", "Mi ruta", "ruta"], ["/evaluaciones", "Evaluaciones", "evaluaciones"], ["/recursos", "Otros recursos", "recursos"],
];

export function Pantalla({ head, children, tabs }: { head: ReactNode; children: ReactNode; tabs?: boolean }) {
  return (
    <div className="app">
      {head}
      <div className="scroll">{children}</div>
      {tabs && (
        <nav className="a-tabs" aria-label="Navegación">
          {TABS.map(([to, l, ic]) => (
            <NavLink key={to} to={to} end={to === "/"}>{Icono[ic]}{l}</NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

export const Cargando = ({ texto = "Cargando…" }: { texto?: string }) => <div className="center" role="status">{texto}</div>;

export function esInstalada() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** Enlace a un archivo privado: firma la URL al mostrarse (así el toque abre directo, también en iPhone). */
export function ArchivoLink({ path, descargar, className, children, label }: { path: string; descargar?: string; className?: string; children: ReactNode; label?: string }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => { let vivo = true; urlArchivo(path, descargar).then((u) => vivo && setHref(u)); return () => { vivo = false; }; }, [path, descargar]);
  return <a className={className} href={href ?? undefined} target="_blank" rel="noopener" aria-label={label} aria-disabled={!href} style={{ textDecoration: "none" }}>{children}</a>;
}
