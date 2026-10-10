export type Rol = "superadmin" | "consultor" | "editor" | "colaborador";
export type TipoCuestionario = "clima" | "base" | "modulo" | "evento";
export type TipoReactivo = "likert" | "multiple" | "abierta";

export interface Perfil {
  id: string;
  rol: Rol;
  nombre: string | null;
  apellido: string | null;
  correo: string | null;
  empresa_id: string | null;
  area_id: string | null;
  puesto: string | null;
  estado: "Activo" | "Invitado" | "Suspendido";
  aviso_aceptado_at: string | null;
}

export interface Empresa {
  id: string;
  nombre: string;
  sigla: string | null;
  color: string;
  logo_url: string | null;
  codigo: string;
  contacto: string | null;
  estado: string;
  programa_id: string | null;
  programa_liberado: boolean;
  mensaje_escuchamos: string | null;
}

export interface Area { id: string; empresa_id: string; nombre: string; responsable: string | null }

export interface Cuestionario {
  id: string;
  codigo: string | null;
  nombre: string;
  tipo: TipoCuestionario;
  instrucciones: string | null;
}

export interface Reactivo {
  id: string;
  cuestionario_id: string;
  orden: number;
  tipo: TipoReactivo;
  texto: string;
  opciones: string[] | null;
  dimension: string | null;
}

export interface Programa {
  id: string;
  nombre: string;
  objetivo: string | null;
  base_cuestionario_id: string | null;
  estado: "Borrador" | "Publicado" | "Archivado";
}

export interface Modulo {
  id: string;
  programa_id: string;
  orden: number;
  titulo: string;
  duracion_min: number | null;
  intro: string | null;
  video_path: string | null;
  pdf_path: string | null;
  pdf_nombre: string | null;
  evaluacion_id: string | null;
}

export interface Evento {
  id: string;
  empresa_id: string;
  nombre: string;
  fecha: string | null;
  lugar: string | null;
  cuestionario_id: string | null;
  despues_de_modulo: string | null;
}

export interface Recurso {
  id: string;
  nombre: string;
  tipo: "pdf" | "video" | "enlace" | "texto" | "imagen" | "plantilla";
  path: string | null;
  url: string | null;
  empresa_id: string | null;
  area_id: string | null;
  publicado: boolean;
}

export type Valores = Record<string, number | string>;

export interface Respuesta {
  id: string;
  perfil_id: string;
  cuestionario_id: string;
  valores: Valores;
  empresa_id: string | null;
  area_id: string | null;
  created_at: string;
}

export const DIMENSIONES = [
  "Liderazgo",
  "Comunicación",
  "Reconocimiento",
  "Trabajo en equipo",
  "Carga de trabajo",
  "Bienestar",
  "Orgullo y pertenencia",
] as const;

export const TIPOS_CUESTIONARIO: Record<TipoCuestionario, string> = {
  clima: "Diagnóstico de clima",
  base: "Punto de partida",
  modulo: "Evaluación de módulo",
  evento: "Evento presencial",
};
