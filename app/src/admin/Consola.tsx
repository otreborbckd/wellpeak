import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useSesion } from "../lib/sesion";
import type { Rol } from "../lib/tipos";
import { LOGO_WELLPEAK } from "../ui/comun";

export const ROLES: Record<Rol, string> = {
  superadmin: "Superadmin WellPeak", consultor: "Consultor(a) DO", editor: "Editor(a) de contenido", colaborador: "Colaborador(a)",
};

const MENU: { grupo: string; items: { to: string; l: string; roles: Rol[] }[] }[] = [
  { grupo: "General", items: [{ to: "/admin", l: "Tablero", roles: ["superadmin", "consultor", "editor"] }] },
  { grupo: "Operación", items: [
    { to: "/admin/empresas", l: "Clientes · Empresas · Áreas", roles: ["superadmin", "consultor"] },
    { to: "/admin/colaboradores", l: "Usuarios de la app", roles: ["superadmin", "consultor"] },
  ] },
  { grupo: "Contenido", items: [{ to: "/admin/contenido", l: "Programas y cuestionarios", roles: ["superadmin", "consultor", "editor"] }] },
  { grupo: "Evaluación", items: [{ to: "/admin/resultados", l: "Resultados", roles: ["superadmin", "consultor"] }] },
  { grupo: "Proyecto", items: [{ to: "/admin/equipo", l: "Usuarios del proyecto", roles: ["superadmin"] }] },
];

export function ConsolaLayout() {
  const { perfil, salir } = useSesion();
  const nav = useNavigate();
  useEffect(() => { document.body.classList.remove("colab"); }, []);
  if (!perfil) return null;
  return (
    <div className="admin">
      <nav className="side" aria-label="Módulos de la consola">
        <div className="brand-s"><img src={LOGO_WELLPEAK} alt="WellPeak" /><span>PULSE</span></div>
        {MENU.map((g) => {
          const items = g.items.filter((i) => i.roles.includes(perfil.rol));
          if (!items.length) return null;
          return <div key={g.grupo}><div className="grp">{g.grupo}</div>
            {items.map((i) => <NavLink key={i.to} to={i.to} end={i.to === "/admin"} className="nav" style={{ textDecoration: "none" }}>{i.l}</NavLink>)}</div>;
        })}
        <div className="foot">{perfil.nombre} {perfil.apellido}<br />{ROLES[perfil.rol]}<br />
          <button onClick={async () => { await salir(); nav("/entrar"); }}>Cerrar sesión</button></div>
      </nav>
      <main className="main"><Outlet /></main>
    </div>
  );
}

export function Encabezado({ titulo, desc, children }: { titulo: string; desc?: string; children?: ReactNode }) {
  const { perfil } = useSesion();
  return (
    <div className="phead">
      <div><div className="eyebrow">Consola WellPeak · {perfil ? ROLES[perfil.rol] : ""}</div><h1 style={{ marginTop: 6 }}>{titulo}</h1>{desc && <p>{desc}</p>}</div>
      <div className="row">{children}</div>
    </div>
  );
}

export function Aviso({ children, tipo = "ok" }: { children: ReactNode; tipo?: "ok" | "error" }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => { setVisible(true); const t = setTimeout(() => setVisible(false), 4000); return () => clearTimeout(t); }, [children]);
  if (!visible || !children) return null;
  return <div className={tipo === "error" ? "err" : "note"} role="status" style={{ marginBottom: 14 }}>{children}</div>;
}

export function descargarCSV(nombre: string, filas: (string | number | null)[][]) {
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(["﻿" + filas.map((f) => f.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
