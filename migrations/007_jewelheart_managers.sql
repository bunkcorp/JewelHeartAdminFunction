-- App-internal managers (poster generation, volunteer/assignment tools).
-- Distinct from jewelheart_admins (system-level / environmental).

CREATE TABLE IF NOT EXISTS jewelheart_managers (
  firebase_uid TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
