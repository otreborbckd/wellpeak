# PULSE · WellPeak — código (versión local: Node + MySQL)

App web responsiva instalable (PWA) para medición de clima organizacional, microlearning y bienestar.
La consola de WellPeak vive en la misma app, en `/admin`.

**Esta versión corre 100 % en tu computadora:** un solo servidor Node.js (Express) que atiende la app y la API, con tu **MySQL local**.
No usa Supabase ni Vercel.

**Stack:** React 18 + TypeScript + Vite · Node.js 20.6+ · Express · MySQL 8.0.16+ · archivos en disco.

## Qué cambió respecto a la versión Supabase

| Antes (Supabase) | Ahora |
| --- | --- |
| PostgreSQL + Row Level Security | MySQL; los permisos los aplica el servidor (`server/permisos.mjs`) en cada consulta |
| Supabase Auth | `server/auth.mjs`: contraseñas con bcrypt, sesión con JWT, enlaces de un solo uso para invitar/recuperar |
| Supabase Storage | Carpeta `almacen/` en disco; archivos privados con enlace firmado de 1 hora |
| Edge Function `invitar-colaboradores` | `POST /api/invitar` |
| Funciones SQL (`enviar_respuestas`, `resultados_empresa`…) | `server/rpc.mjs` y `server/agregados.mjs` |
| Vercel | `npm start` sirve todo en `http://localhost:3000` |

Las reglas de negocio son las mismas: umbral de 5 respuestas, colaborador sólo ve lo suyo, consultor ve sus empresas, editor no ve resultados, la respuesta correcta no se expone, diagnóstico de clima se contesta una sola vez, máximo 20 reactivos por cuestionario y 4 cuestionarios por diagnóstico.

## Puesta en marcha (≈ 15 minutos)

Requisitos: **Node.js 20.6 o superior** y **MySQL 8.0.16 o superior** corriendo en tu computadora (no sirve MySQL 5.7).

1. **Dependencias**
   ```bash
   npm install
   ```
2. **Configuración**
   ```bash
   cp .env.example .env          # en Windows: copy .env.example .env
   ```
   Edita `.env`: pon `DB_PASSWORD` (la de tu usuario MySQL) y un `JWT_SECRET` (el comando para generarlo está dentro del archivo).
3. **Base de datos** (crea la base `pulse`, las tablas, las reglas y los datos de demostración)
   ```bash
   npm run db:migrar
   ```
   Es seguro repetirlo. Usa `npm run db:migrar -- --sin-seed` si no quieres la empresa demo (código `ALTA-2026`).
4. **Primer administrador**
   ```bash
   npm run admin -- --correo tu@correo.com --nombre Jorge --apellido "Vizcaíno"
   ```
   Imprime una contraseña inicial: entra con ella en `/entrar` y cámbiala en *Mi perfil*.
   Los consultores y editores se crean igual con `--rol consultor` o `--rol editor`, y se asignan a empresas desde la consola (*Usuarios del proyecto*).
5. **Compilar y arrancar**
   ```bash
   npm run build
   npm start
   ```
   Abre http://localhost:3000 (consola en http://localhost:3000/admin).
6. **Programa de 18 módulos**
   ```bash
   npm run importar -- --excel ./PULSE_carga_programa.xlsx --carpeta "./PULSE – Programa" --probar
   npm run importar -- --excel ./PULSE_carga_programa.xlsx --carpeta "./PULSE – Programa"
   ```
   `--probar` revisa plantilla y archivos sin cargar nada. El importador copia videos y PDFs a `almacen/contenido/`. Después, en la consola: *Programas* › Publicado, y en *Empresas* › asignar programa y «Liberar».
   Videos: MP4 H.264, 720p.

### Correo
Sin `SMTP_HOST` en `.env`, las invitaciones y la recuperación de contraseña **imprimen el enlace en la consola del servidor** (cópialo y ábrelo). Para enviar correos reales, llena las variables `SMTP_*` (Gmail con contraseña de aplicación, Outlook, Resend, SendGrid…).

### Probar desde el celular (misma red Wi-Fi)
Pon en `.env` `APP_URL=http://<IP-de-tu-PC>:3000`, reinicia, y abre esa dirección en el celular. Para instalar el ícono como app, el navegador exige HTTPS salvo en `localhost`; para esa prueba usa un túnel (por ejemplo Cloudflare Tunnel o ngrok) y pon su URL en `APP_URL`.

## Desarrollo

```bash
npm run dev:api     # API en :3000 (se reinicia sola al guardar)
npm run dev         # app en http://localhost:5173 (proxy hacia la API)
npm test            # pruebas automáticas
```

## Estructura

```
app/                 Frontend (Vite). src/colab = app del colaborador · src/admin = consola · src/lib/api.ts = cliente de la API
server/              API: auth, permisos, datos, funciones de negocio, archivos, correo, migración
db/                  esquema.sql · disparadores.sql · seed.sql (diagnóstico de clima, punto de partida, empresa demo)
scripts/             importar-programa.mjs
almacen/             (se crea sola) contenido/ privado y marcas/ público
```

## Reglas de negocio y seguridad

- **Confidencialidad:** los resultados agregados (`resultados_empresa`, `comentarios_empresa`) ocultan grupos con menos de 5 respuestas (`umbral_confidencialidad()`).
- **Quién ve qué:** colaborador → sólo lo suyo. Consultor → empresas asignadas, incluidos resultados individuales. Editor → contenido, sin resultados. Superadmin → todo. Se aplica con RLS en la base de datos, no sólo en la interfaz.
- La respuesta correcta de las evaluaciones no es legible por colaboradores (permiso por columna); se muestra sólo después de responder (`resultado_evaluacion`).
- El diagnóstico de clima se responde una sola vez; las evaluaciones de módulo pueden repetirse.
- Registro por código: el disparador `alta_perfil` rechaza códigos o áreas no válidos.
- **Aviso de privacidad:** sustituir el texto de `app/src/colab/Acceso.tsx › AvisoPrivacidad` y `app/src/lib/textos.ts` por la versión aprobada por el abogado antes de invitar colaboradores reales.

## Lista de verificación antes del piloto

- [ ] `npm run build` sin errores y `npm test` en verde
- [ ] Respaldo programado de la base (`mysqldump -u root -p pulse > respaldo.sql`) y de la carpeta `almacen/`
- [ ] SMTP propio funcionando: invitación y recuperación llegan a Gmail y Outlook
- [ ] Instalación del ícono probada en iPhone (Safari) y Android (Chrome) — requiere HTTPS
- [ ] Video y PDF de los 18 módulos abren en iPhone y Android
- [ ] Aviso de privacidad aprobado publicado
- [ ] `JWT_SECRET` propio y `.env` fuera de Git
