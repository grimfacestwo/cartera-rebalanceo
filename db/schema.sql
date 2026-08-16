CREATE TABLE IF NOT EXISTS portfolio_state (
  id integer PRIMARY KEY CHECK (id = 1),
  assets jsonb NOT NULL,
  values jsonb NOT NULL,
  contribution text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);