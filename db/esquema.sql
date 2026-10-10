-- PULSE · WellPeak — esquema MySQL 8.0.16 o superior (utf8mb4)
-- Se aplica con:  npm run db:migrar
-- (también funciona con:  mysql -u root -p pulse < db/esquema.sql)

SET NAMES utf8mb4;

-- ---------- Cuentas de acceso ----------
-- La contraseña (hash bcrypt) vive aquí, separada de los datos del perfil.
CREATE TABLE IF NOT EXISTS usuarios (
  id         CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  correo     VARCHAR(255) NOT NULL UNIQUE,
  hash       VARCHAR(100) NOT NULL,
  confirmado TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Enlaces de un solo uso: confirmar correo, recuperar contraseña, invitación
CREATE TABLE IF NOT EXISTS tokens (
  id         CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  usuario_id CHAR(36)    NOT NULL,
  tipo       ENUM('confirmar','recuperar','invitar') NOT NULL,
  hash       CHAR(64)    NOT NULL UNIQUE,          -- sha256 del token enviado por correo
  expira     DATETIME(3) NOT NULL,
  usado      TINYINT(1)  NOT NULL DEFAULT 0,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Contenido ----------
CREATE TABLE IF NOT EXISTS cuestionarios (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  codigo        VARCHAR(60)  UNIQUE,                -- p. ej. CLIMA1, BASE, M01 (lo usa el importador)
  nombre        VARCHAR(255) NOT NULL,
  tipo          ENUM('clima','base','modulo','evento') NOT NULL,
  instrucciones TEXT,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reactivos (
  id              CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  cuestionario_id CHAR(36)    NOT NULL,
  orden           INT         NOT NULL,
  tipo            ENUM('likert','multiple','abierta') NOT NULL,
  texto           TEXT        NOT NULL,
  opciones        JSON,                               -- ["Opción A", "Opción B", ...] para 'multiple'
  correcta        INT,                                -- índice 0..n-1; sólo evaluaciones de módulo
  dimension       VARCHAR(100),                       -- dimensión de clima para 'likert'
  UNIQUE KEY (cuestionario_id, orden),
  FOREIGN KEY (cuestionario_id) REFERENCES cuestionarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS programas (
  id                    CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  nombre                VARCHAR(255) NOT NULL,
  objetivo              TEXT,
  base_cuestionario_id  CHAR(36),
  estado                ENUM('Borrador','Publicado','Archivado') NOT NULL DEFAULT 'Borrador',
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (base_cuestionario_id) REFERENCES cuestionarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS modulos (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  programa_id     CHAR(36)     NOT NULL,
  orden           INT          NOT NULL,
  titulo          VARCHAR(255) NOT NULL,
  duracion_min    INT,
  intro           TEXT,
  video_path      VARCHAR(500),   -- ruta dentro de almacen/contenido
  pdf_path        VARCHAR(500),
  pdf_nombre      VARCHAR(255),
  evaluacion_id   CHAR(36),
  UNIQUE KEY (programa_id, orden),
  FOREIGN KEY (programa_id)   REFERENCES programas(id)      ON DELETE CASCADE,
  FOREIGN KEY (evaluacion_id) REFERENCES cuestionarios(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Clientes ----------
CREATE TABLE IF NOT EXISTS empresas (
  id                 CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  nombre             VARCHAR(255) NOT NULL,
  sigla              VARCHAR(20),
  color              VARCHAR(20)  NOT NULL DEFAULT '#1F6F78',
  logo_url           VARCHAR(500),
  codigo             VARCHAR(60)  NOT NULL UNIQUE,    -- código de registro para colaboradores
  contacto           VARCHAR(255),
  estado             VARCHAR(100) NOT NULL DEFAULT 'Diagnóstico por iniciar',
  programa_id        CHAR(36),
  programa_liberado  TINYINT(1)   NOT NULL DEFAULT 0,
  mensaje_escuchamos TEXT,                             -- «Lo que escuchamos», al cerrar el diagnóstico
  created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (programa_id) REFERENCES programas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS areas (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  empresa_id   CHAR(36)     NOT NULL,
  nombre       VARCHAR(255) NOT NULL,
  responsable  VARCHAR(255),
  UNIQUE KEY (empresa_id, nombre),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS empresa_diagnostico (
  empresa_id      CHAR(36) NOT NULL,
  cuestionario_id CHAR(36) NOT NULL,
  orden           INT      NOT NULL DEFAULT 1,
  PRIMARY KEY (empresa_id, cuestionario_id),
  FOREIGN KEY (empresa_id)      REFERENCES empresas(id)       ON DELETE CASCADE,
  FOREIGN KEY (cuestionario_id) REFERENCES cuestionarios(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS eventos (
  id                 CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  empresa_id         CHAR(36)     NOT NULL,
  nombre             VARCHAR(255) NOT NULL,
  fecha              DATE,
  lugar              VARCHAR(255),
  cuestionario_id    CHAR(36),
  despues_de_modulo  CHAR(36),
  FOREIGN KEY (empresa_id)        REFERENCES empresas(id)       ON DELETE CASCADE,
  FOREIGN KEY (cuestionario_id)   REFERENCES cuestionarios(id)  ON DELETE SET NULL,
  FOREIGN KEY (despues_de_modulo) REFERENCES modulos(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Personas ----------
CREATE TABLE IF NOT EXISTS perfiles (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  rol               ENUM('superadmin','consultor','editor','colaborador') NOT NULL DEFAULT 'colaborador',
  nombre            VARCHAR(255),
  apellido          VARCHAR(255),
  correo            VARCHAR(255),
  empresa_id        CHAR(36),
  area_id           CHAR(36),
  puesto            VARCHAR(255),
  estado            ENUM('Activo','Invitado','Suspendido') NOT NULL DEFAULT 'Activo',
  aviso_aceptado_at DATETIME(3),
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY (empresa_id, area_id),
  FOREIGN KEY (id)         REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
  FOREIGN KEY (area_id)    REFERENCES areas(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Empresas asignadas a consultores / editores
CREATE TABLE IF NOT EXISTS staff_empresas (
  perfil_id  CHAR(36) NOT NULL,
  empresa_id CHAR(36) NOT NULL,
  PRIMARY KEY (perfil_id, empresa_id),
  FOREIGN KEY (perfil_id)  REFERENCES perfiles(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Recursos ----------
CREATE TABLE IF NOT EXISTS recursos (
  id          CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  nombre      VARCHAR(255) NOT NULL,
  tipo        ENUM('pdf','video','enlace','texto','imagen','plantilla') NOT NULL,
  path        VARCHAR(500),             -- archivo en almacen/contenido
  url         VARCHAR(1000),            -- para enlaces
  empresa_id  CHAR(36),                 -- NULL = todas
  area_id     CHAR(36),                 -- NULL = toda la empresa
  publicado   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (area_id)    REFERENCES areas(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Actividad ----------
CREATE TABLE IF NOT EXISTS respuestas (
  id              CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  perfil_id       CHAR(36)    NOT NULL,
  cuestionario_id CHAR(36)    NOT NULL,
  valores         JSON        NOT NULL,           -- { "<reactivo_id>": 4 | 1 | "texto" }
  empresa_id      CHAR(36),                       -- copia al enviar
  area_id         CHAR(36),
  evento_id       CHAR(36),
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY (perfil_id, cuestionario_id),
  KEY (empresa_id, cuestionario_id),
  FOREIGN KEY (perfil_id)       REFERENCES perfiles(id)      ON DELETE CASCADE,
  FOREIGN KEY (cuestionario_id) REFERENCES cuestionarios(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id)      REFERENCES empresas(id)      ON DELETE SET NULL,
  FOREIGN KEY (area_id)         REFERENCES areas(id)         ON DELETE SET NULL,
  FOREIGN KEY (evento_id)       REFERENCES eventos(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS borradores (
  perfil_id       CHAR(36)    NOT NULL,
  cuestionario_id CHAR(36)    NOT NULL,
  idx             INT         NOT NULL DEFAULT 0,
  valores         JSON        NOT NULL,
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (perfil_id, cuestionario_id),
  FOREIGN KEY (perfil_id)       REFERENCES perfiles(id)      ON DELETE CASCADE,
  FOREIGN KEY (cuestionario_id) REFERENCES cuestionarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS avance (
  perfil_id     CHAR(36)    NOT NULL,
  modulo_id     CHAR(36)    NOT NULL,
  estado        VARCHAR(30) NOT NULL DEFAULT 'completado',
  completado_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (perfil_id, modulo_id),
  FOREIGN KEY (perfil_id) REFERENCES perfiles(id) ON DELETE CASCADE,
  FOREIGN KEY (modulo_id) REFERENCES modulos(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bitacora (
  id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  perfil_id  CHAR(36),
  accion     VARCHAR(500) NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (perfil_id) REFERENCES perfiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
