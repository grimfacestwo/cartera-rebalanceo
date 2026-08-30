-- Esquema real de la base de datos. Las tablas se crean en runtime con
-- CREATE TABLE IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- desde el propio código de las rutas (ver app/api/state/route.ts,
-- lib/db.ts y lib/rate-limit.ts). Este archivo es solo documentación:
-- si diverge del código, el código manda.

-- Fila única (id = 1) con todo el estado de Finanzas.
--
-- OJO con las columnas camelCase (fixedExpenses, catRules, planTargets,
-- rowOrder): Postgres pliega los identificadores sin comillas a
-- minúsculas, así que se guardan como fixedexpenses/catrules/plantargets/
-- roworder. Un SELECT sin alias entre comillas (p.ej. `SELECT planTargets`)
-- devuelve la fila con la clave en minúsculas, no en camelCase — si el
-- código JS lee `row.planTargets` sin más, siempre sale undefined y ese
-- campo se resetea a su valor por defecto en cada carga. Hay que aliasar
-- explícitamente en el SELECT (`planTargets AS "planTargets"`), como hace
-- app/api/state/route.ts.
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
  rowOrder jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Control de concurrencia optimista (ver app/api/state/route.ts): cada PUT
  -- manda el `version` que cargó y solo se aplica si sigue coincidiendo con
  -- el de la fila, si no se rechaza con 409 en vez de pisar en silencio lo
  -- que haya guardado otra pestaña/página de por medio. Un entero, no
  -- updated_at, porque el timestamptz pierde precisión al pasar por JSON.
  version integer NOT NULL DEFAULT 1
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
