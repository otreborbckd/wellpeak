// PULSE · cliente de la API propia (reemplaza a Supabase).
// Mantiene la forma de uso del cliente anterior —api.from(...).select().eq(), api.rpc(), api.auth.*—
// para que las pantallas no cambien; todo viaja al servidor (server/), que aplica los permisos.

const TOKEN = "pulse.token";
const USUARIO = "pulse.usuario";
const ENLACE = "pulse.enlace";

export interface Sesion { access_token: string; user: { id: string; email: string } }
type Resultado<T = any> = { data: T; error: { message: string } | null };
type Evento = "SIGNED_IN" | "SIGNED_OUT" | "PASSWORD_RECOVERY";

// ---------- Sesión ----------
const escuchas = new Set<(e: Evento, s: Sesion | null) => void>();
const avisar = (e: Evento, s: Sesion | null) => escuchas.forEach((f) => f(e, s));

function leerSesion(): Sesion | null {
  try {
    const t = localStorage.getItem(TOKEN), u = localStorage.getItem(USUARIO);
    return t && u ? { access_token: t, user: JSON.parse(u) } : null;
  } catch { return null; }
}
function guardarSesion(token: string, user: { id: string; email: string }): Sesion {
  localStorage.setItem(TOKEN, token); localStorage.setItem(USUARIO, JSON.stringify(user));
  return { access_token: token, user };
}
function borrarSesion() { localStorage.removeItem(TOKEN); localStorage.removeItem(USUARIO); }

// Los enlaces de invitación y recuperación llegan como /nueva-contrasena#type=...&token=...
// El token se guarda para que la página pueda definir la contraseña aunque se recargue.
try {
  const m = /token=([a-f0-9]{64})/.exec(window.location.hash);
  if (m) sessionStorage.setItem(ENLACE, m[1]);
} catch { /* sin almacenamiento disponible */ }
const tokenEnlace = () => { try { return sessionStorage.getItem(ENLACE); } catch { return null; } };

// ---------- HTTP ----------
async function http<T = any>(metodo: string, ruta: string, cuerpo?: unknown, extra?: RequestInit): Promise<Resultado<T>> {
  const token = localStorage.getItem(TOKEN);
  try {
    const r = await fetch(ruta, {
      method: metodo,
      headers: { ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      ...extra,
    });
    const renovado = r.headers.get("X-Token-Renovado");
    if (renovado && token) localStorage.setItem(TOKEN, renovado);
    const j = await r.json().catch(() => ({ data: null, error: { message: "Respuesta no válida del servidor." } }));
    if (r.status === 401 && token && !ruta.startsWith("/api/auth/login")) { borrarSesion(); avisar("SIGNED_OUT", null); }
    return { data: j.data ?? null, error: j.error ?? (r.ok ? null : { message: `Error ${r.status}` }) };
  } catch {
    return { data: null as T, error: { message: "Failed to fetch" } };
  }
}

// ---------- Consultas (api.from) ----------
class Consulta implements PromiseLike<Resultado> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private columnas = "*";
  private retorno: string | null = null;
  private valores: unknown;
  private filtros: [string, string, unknown][] = [];
  private orden: [string, boolean][] = [];
  private tope?: number;
  private modo: "single" | "maybe" | null = null;
  constructor(private tabla: string) {}

  select(cols = "*") { if (this.op === "select") this.columnas = cols; else this.retorno = cols; return this; }
  insert(v: unknown) { this.op = "insert"; this.valores = v; return this; }
  update(v: unknown) { this.op = "update"; this.valores = v; return this; }
  upsert(v: unknown) { this.op = "upsert"; this.valores = v; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filtros.push([c, v === null ? "is" : "eq", v]); return this; }
  neq(c: string, v: unknown) { this.filtros.push([c, "neq", v]); return this; }
  in(c: string, v: unknown[]) { this.filtros.push([c, "in", v]); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orden.push([c, o?.ascending !== false]); return this; }
  limit(n: number) { this.tope = n; return this; }
  single() { this.modo = "single"; return this; }
  maybeSingle() { this.modo = "maybe"; return this; }

  then<A = Resultado, B = never>(ok?: ((r: Resultado) => A | PromiseLike<A>) | null, err?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return http("POST", "/api/db", {
      tabla: this.tabla, op: this.op, columnas: this.columnas, retorno: this.retorno, valores: this.valores,
      filtros: this.filtros, orden: this.orden, limite: this.tope, modo: this.modo,
    }).then(ok, err);
  }
}

// ---------- Cuentas (api.auth) ----------
const auth = {
  async getSession(): Promise<{ data: { session: Sesion | null } }> {
    const s = leerSesion();
    if (!s) return { data: { session: null } };
    // Confirma con el servidor que la sesión sigue vigente (si no hay red, se conserva la local)
    const r = await http("GET", "/api/auth/yo");
    if (r.error && r.error.message !== "Failed to fetch") { borrarSesion(); return { data: { session: null } }; }
    return { data: { session: s } };
  },
  onAuthStateChange(cb: (e: Evento, s: Sesion | null) => void) {
    escuchas.add(cb);
    return { data: { subscription: { unsubscribe: () => { escuchas.delete(cb); } } } };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }): Promise<Resultado> {
    const r = await http("POST", "/api/auth/login", { email, password });
    if (r.error || !r.data) return { data: null, error: r.error ?? { message: "Invalid login credentials" } };
    try { sessionStorage.removeItem(ENLACE); } catch { /* nada */ }   // un enlace viejo no debe forzar «crear contraseña»
    const s = guardarSesion(r.data.token, r.data.user); avisar("SIGNED_IN", s);
    return { data: { session: s }, error: null };
  },
  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown>; emailRedirectTo?: string } }): Promise<Resultado> {
    const r = await http("POST", "/api/auth/signup", { email, password, data: options?.data });
    if (r.error || !r.data) return { data: null, error: r.error };
    const sesion = r.data.session ? guardarSesion(r.data.session.token, r.data.session.user) : null;
    if (sesion) avisar("SIGNED_IN", sesion);
    return { data: { session: sesion }, error: null };
  },
  async signOut() { borrarSesion(); try { sessionStorage.removeItem(ENLACE); } catch { /* nada */ } avisar("SIGNED_OUT", null); return { error: null }; },
  async resetPasswordForEmail(email: string, _opciones?: unknown): Promise<Resultado> {
    return http("POST", "/api/auth/recuperar", { email });
  },
  /** Con enlace de invitación/recuperación define la contraseña y abre sesión; con sesión activa la cambia. */
  async updateUser({ password }: { password: string }): Promise<Resultado> {
    const enlace = tokenEnlace();
    if (enlace) {
      const r = await http("POST", "/api/auth/restablecer", { token: enlace, password });
      if (r.error || !r.data) return { data: null, error: r.error };
      try { sessionStorage.removeItem(ENLACE); } catch { /* nada */ }
      const s = guardarSesion(r.data.token, r.data.user); avisar("SIGNED_IN", s);
      return { data: { user: s.user }, error: null };
    }
    return http("POST", "/api/auth/clave", { password });
  },
  /** ¿Llegó la persona con un enlace de invitación o recuperación pendiente de usar? */
  hayEnlacePendiente: () => !!tokenEnlace(),
};

// ---------- Archivos (api.storage) ----------
const storage = {
  from(bucket: "marcas" | "contenido") {
    return {
      async upload(ruta: string, archivo: File, _o?: unknown): Promise<Resultado> {
        if (bucket !== "marcas") return { data: null, error: { message: "Sólo se pueden subir logotipos desde la consola." } };
        return http("PUT", `/api/archivos/marcas/${ruta.split("/").map(encodeURIComponent).join("/")}`, undefined,
          { body: archivo, headers: { "Content-Type": archivo.type || "application/octet-stream", Authorization: `Bearer ${localStorage.getItem(TOKEN) ?? ""}` } });
      },
      getPublicUrl(ruta: string) { return { data: { publicUrl: `/api/archivos/marcas/${ruta.split("/").map(encodeURIComponent).join("/")}` } }; },
    };
  },
};

export const api = {
  from: (tabla: string) => new Consulta(tabla),
  rpc: (fn: string, args: Record<string, unknown> = {}): Promise<Resultado> =>
    http("POST", `/api/rpc/${encodeURIComponent(fn)}`, { args }),
  functions: { invoke: (nombre: string, o: { body: unknown }): Promise<Resultado> =>
    nombre === "invitar-colaboradores" ? http("POST", "/api/invitar", o.body) : Promise.resolve({ data: null, error: { message: "Función no disponible." } }) },
  auth,
  storage,
};

/** URL firmada (1 hora) de un archivo privado de contenido (video, PDF, recursos). */
export async function urlArchivo(path: string, descargar?: string): Promise<string | null> {
  const q = new URLSearchParams({ path });
  if (descargar) q.set("descargar", descargar);
  const r = await http<{ url: string }>("GET", `/api/archivos/firmar?${q}`);
  return r.error || !r.data ? null : r.data.url;
}

/** Mensaje legible a partir de un error de la API. */
export function mensajeError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos. Revisa tus datos o usa «¿Olvidaste tu contraseña?».";
  if (/Email not confirmed/i.test(m)) return "Confirma tu correo: te enviamos un enlace al registrarte.";
  if (/already registered|already been registered/i.test(m)) return "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.";
  if (/Password should be/i.test(m)) return "La contraseña debe tener al menos 8 caracteres.";
  if (/rate limit|Demasiados intentos/i.test(m)) return "Demasiados intentos. Espera un minuto y vuelve a intentarlo.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  return m;
}
