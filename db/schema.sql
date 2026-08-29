-- Esquema real de la base de datos. Las tablas se crean en runtime con
-- CREATE TABLE IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- desde el propio código de las rutas (ver app/api/state/route.ts,
-- lib/db.ts y lib/rate-limit.ts). Este archivo es solo documentación:
-- si diverge del código, el código manda.

-- Fila única (id = 1) con todo el estado de Finanzas.
CREATE TABLE IF NOT EXISTS portfolio_state (
  id integer PRIMARY KEY CHECK (id = 1),
  assets jsonb NOT NULL,
  values jsonb NOT NULL,
  contribution text NOT NULL DEFAULT '',
  banks jsonb NOT NULL DEFAULT '{}'::jsonb,
  expenses jsonb NOT NULL DEFAULT '[]'::jsonb,
  months jsonb NOT NULL DEFAULT '{}'::jsonb,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixedExpenses jsonb NOT NULL DEFAULT '[]'::jsonb,
  catRules jsonb NOT NULL DEFAULT '[]'::jsonb,
  planTargets jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabla clave-valor genérica para el resto de secciones, indexada por
-- slug (app/api/section/[slug]/route.ts). Slugs en uso: "coches",
-- "coches-docs", "lectura", "planificacion", "ui-prefs".
CREATE TABLE IF NOT EXISTS section_state (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Rate limiting del login (lib/rate-limit.ts), no es dato de negocio.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip text PRIMARY KEY,
  attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
