import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Sesion } from "./api";
import type { Perfil } from "./tipos";

interface Estado {
  cargando: boolean;
  session: Sesion | null;
  perfil: Perfil | null;
  recuperando: boolean; // llegó desde un enlace de recuperación o invitación
  refrescar: () => Promise<void>;
  salir: () => Promise<void>;
}

const Ctx = createContext<Estado | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionEstado] = useState<Sesion | null>(null);
  const actual = useRef<Sesion | null>(null);   // siempre la sesión vigente, aunque el closure sea viejo
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recuperando, setRecuperando] = useState(false);

  const setSession = (s: Sesion | null) => { actual.current = s; setSessionEstado(s); };

  const cargarPerfil = useCallback(async (s: Sesion | null) => {
    if (!s) { setPerfil(null); return; }
    const { data } = await api.from("perfiles").select("*").eq("id", s.user.id).maybeSingle();
    setPerfil((data as Perfil) ?? null);
  }, []);

  useEffect(() => {
    // Las invitaciones y recuperaciones llegan con #type=invite|recovery en la URL
    if (/type=(recovery|invite)/.test(window.location.hash)) setRecuperando(true);
    api.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await cargarPerfil(data.session);
      setCargando(false);
    });
    const { data: sub } = api.auth.onAuthStateChange((evento, s) => {
      if (evento === "PASSWORD_RECOVERY") setRecuperando(true);
      if (evento === "SIGNED_OUT") setRecuperando(false);
      setSession(s);
      setTimeout(() => { cargarPerfil(s); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [cargarPerfil]);

  const valor: Estado = {
    cargando, session, perfil, recuperando,
    // Termina el modo «crear contraseña» y vuelve a leer el perfil de la sesión vigente
    refrescar: async () => { setRecuperando(false); await cargarPerfil(actual.current); },
    salir: async () => { await api.auth.signOut(); setRecuperando(false); setPerfil(null); },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSesion fuera de SesionProvider");
  return v;
}

export const esStaff = (p: Perfil | null) => !!p && ["superadmin", "consultor", "editor"].includes(p.rol);
