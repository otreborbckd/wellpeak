import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { esStaff, useSesion } from "./lib/sesion";
import { ColabProvider } from "./lib/ruta";
import { Cargando } from "./ui/comun";
import { AvisoPrivacidad, Entrar, Instalar, NuevaContrasena, Recuperar, Registro } from "./colab/Acceso";
import { Evaluaciones, Inicio, Perfil, Recursos, Reporte, Ruta } from "./colab/Principal";
import { Aviso, CuestionarioPantalla, ModuloPantalla, Resultado } from "./colab/Actividad";
import { ConsolaLayout } from "./admin/Consola";
import { Colaboradores, Contenido, Empresas, Equipo, Resultados, Tablero } from "./admin/Paginas";
import type { Rol } from "./lib/tipos";

function Mensaje({ titulo, texto }: { titulo: string; texto: string }) {
  const { salir } = useSesion();
  return (
    <div className="app"><div className="scroll"><div className="a-stack" style={{ paddingTop: 60 }}>
      <h1 className="a-h1">{titulo}</h1><p className="a-sub">{texto}</p>
      <button className="a-btn sec" onClick={salir}>Cerrar sesión</button>
    </div></div></div>
  );
}

/** Rutas del colaborador: requieren sesión, perfil activo y empresa asignada. */
function ConSesion({ children }: { children: ReactNode }) {
  const { cargando, session, perfil } = useSesion();
  const loc = useLocation();
  if (cargando) return <Cargando />;
  if (!session) return <Navigate to="/entrar" replace state={{ desde: loc.pathname }} />;
  if (!perfil) return <Cargando texto="Preparando tu cuenta…" />;
  if (perfil.estado === "Suspendido") return <Mensaje titulo="Acceso restringido" texto="Tu cuenta está suspendida. Contacta a Recursos Humanos o a soporte de WellPeak." />;
  if (esStaff(perfil)) return <Navigate to="/admin" replace />;
  if (!perfil.empresa_id) return <Mensaje titulo="Cuenta sin empresa" texto="Tu cuenta aún no está vinculada a una empresa. Regístrate con el código de tu empresa o pide a Recursos Humanos una invitación." />;
  return <ColabProvider>{children}</ColabProvider>;
}

function Staff({ children, roles }: { children: ReactNode; roles?: Rol[] }) {
  const { cargando, session, perfil } = useSesion();
  if (cargando || (session && !perfil)) return <Cargando />;
  if (!session) return <Navigate to="/entrar" replace />;
  if (!esStaff(perfil)) return <Navigate to="/" replace />;
  if (roles && !roles.includes(perfil!.rol)) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

export default function App() {
  const { recuperando, session } = useSesion();
  const loc = useLocation();
  useEffect(() => { document.body.classList.toggle("colab", !loc.pathname.startsWith("/admin")); }, [loc.pathname]);
  if (recuperando && session && loc.pathname !== "/nueva-contrasena") return <Navigate to="/nueva-contrasena" replace />;
  const colab = (el: ReactNode) => <ConSesion>{el}</ConSesion>;
  return (
    <Routes>
      <Route path="/entrar" element={session ? <Navigate to="/" replace /> : <Entrar />} />
      <Route path="/registro" element={<Registro />} />
      <Route path="/recuperar" element={<Recuperar />} />
      <Route path="/nueva-contrasena" element={<NuevaContrasena />} />
      <Route path="/instalar" element={<Instalar />} />
      <Route path="/aviso-de-privacidad" element={<AvisoPrivacidad />} />

      <Route path="/" element={colab(<Inicio />)} />
      <Route path="/ruta" element={colab(<Ruta />)} />
      <Route path="/evaluaciones" element={colab(<Evaluaciones />)} />
      <Route path="/recursos" element={colab(<Recursos />)} />
      <Route path="/perfil" element={colab(<Perfil />)} />
      <Route path="/reporte" element={colab(<Reporte />)} />
      <Route path="/aviso/:qid" element={colab(<Aviso />)} />
      <Route path="/cuestionario/:qid" element={colab(<CuestionarioPantalla />)} />
      <Route path="/resultado/:qid" element={colab(<Resultado />)} />
      <Route path="/modulo/:id" element={colab(<ModuloPantalla />)} />

      <Route path="/admin" element={<Staff><ConsolaLayout /></Staff>}>
        <Route index element={<Tablero />} />
        <Route path="empresas" element={<Staff roles={["superadmin", "consultor"]}><Empresas /></Staff>} />
        <Route path="colaboradores" element={<Staff roles={["superadmin", "consultor"]}><Colaboradores /></Staff>} />
        <Route path="contenido" element={<Contenido />} />
        <Route path="resultados" element={<Staff roles={["superadmin", "consultor"]}><Resultados /></Staff>} />
        <Route path="equipo" element={<Staff roles={["superadmin"]}><Equipo /></Staff>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
