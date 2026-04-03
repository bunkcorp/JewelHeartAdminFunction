-- JewelHeart initial schema (Postgres 14+).
-- Apply against the same database as KarmaDots private-server, or a dedicated DB.
-- IDs: gen_random_uuid() (built-in PostgreSQL 13+).

BEGIN;

-- gen_random_uuid(): built-in on PostgreSQL 13+; on older versions use pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- enums ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jewelheart_retreat_status') THEN
    CREATE TYPE jewelheart_retreat_status AS ENUM ('draft', 'published', 'archived');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jewelheart_time_band') THEN
    CREATE TYPE jewelheart_time_band AS ENUM (
      'early',
      'lunchtime',
      'dinnertime',
      'allday',
      'anytime'
    );
  END IF;
END$$;

-- ---- retreats ----
CREATE TABLE IF NOT EXISTS jewelheart_retreats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL,
  start_date date,
  end_date date,
  status jewelheart_retreat_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jewelheart_retreats_status_idx
  ON jewelheart_retreats (status);

-- ---- jobs ----
CREATE TABLE IF NOT EXISTS jewelheart_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retreat_id uuid NOT NULL REFERENCES jewelheart_retreats (id) ON DELETE CASCADE,
  title text NOT NULL,
  volunteers_needed integer NOT NULL CHECK (volunteers_needed >= 1),
  estimated_minutes integer NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jewelheart_jobs_retreat_idx ON jewelheart_jobs (retreat_id);

-- ---- subjobs (ordered plain text) ----
CREATE TABLE IF NOT EXISTS jewelheart_job_subjobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jewelheart_jobs (id) ON DELETE CASCADE,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  text text NOT NULL,
  UNIQUE (job_id, sort_order)
);

CREATE INDEX IF NOT EXISTS jewelheart_job_subjobs_job_idx ON jewelheart_job_subjobs (job_id);

-- ---- slots ----
CREATE TABLE IF NOT EXISTS jewelheart_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retreat_id uuid NOT NULL REFERENCES jewelheart_retreats (id) ON DELETE CASCADE,
  label text NOT NULL,
  slot_date date NOT NULL,
  day_of_week text,
  activity_context text,
  time_band jewelheart_time_band NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jewelheart_slots_retreat_date_idx
  ON jewelheart_slots (retreat_id, slot_date);

-- ---- tasks (job × slot, unique per retreat) ----
CREATE TABLE IF NOT EXISTS jewelheart_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retreat_id uuid NOT NULL REFERENCES jewelheart_retreats (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jewelheart_jobs (id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES jewelheart_slots (id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (retreat_id, job_id, slot_id)
);

CREATE INDEX IF NOT EXISTS jewelheart_tasks_retreat_idx ON jewelheart_tasks (retreat_id);
CREATE INDEX IF NOT EXISTS jewelheart_tasks_slot_idx ON jewelheart_tasks (slot_id);

-- ---- global volunteers ----
CREATE TABLE IF NOT EXISTS jewelheart_volunteers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  email text,
  phone text,
  other_duties text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jewelheart_volunteers_email_lower_uidx
  ON jewelheart_volunteers (lower(email))
  WHERE email IS NOT NULL AND length(trim(email)) > 0;

CREATE INDEX IF NOT EXISTS jewelheart_volunteers_display_name_idx
  ON jewelheart_volunteers (display_name);

-- ---- retreat roster (many-to-many) ----
CREATE TABLE IF NOT EXISTS jewelheart_retreat_volunteers (
  retreat_id uuid NOT NULL REFERENCES jewelheart_retreats (id) ON DELETE CASCADE,
  volunteer_id uuid NOT NULL REFERENCES jewelheart_volunteers (id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (retreat_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS jewelheart_retreat_volunteers_volunteer_idx
  ON jewelheart_retreat_volunteers (volunteer_id);

-- ---- assignments ----
CREATE TABLE IF NOT EXISTS jewelheart_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES jewelheart_tasks (id) ON DELETE CASCADE,
  volunteer_id uuid NOT NULL REFERENCES jewelheart_volunteers (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS jewelheart_assignments_task_idx ON jewelheart_assignments (task_id);
CREATE INDEX IF NOT EXISTS jewelheart_assignments_volunteer_idx ON jewelheart_assignments (volunteer_id);

-- ---- ACL: global JewelHeart admins (Firebase UID) ----
CREATE TABLE IF NOT EXISTS jewelheart_admins (
  firebase_uid text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---- ACL: per-retreat access (optional; if empty for a retreat, fall back to global admin only — app policy) ----
CREATE TABLE IF NOT EXISTS jewelheart_retreat_admins (
  retreat_id uuid NOT NULL REFERENCES jewelheart_retreats (id) ON DELETE CASCADE,
  firebase_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (retreat_id, firebase_uid)
);

CREATE INDEX IF NOT EXISTS jewelheart_retreat_admins_uid_idx
  ON jewelheart_retreat_admins (firebase_uid);

-- ---- updated_at trigger ----
CREATE OR REPLACE FUNCTION jewelheart_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jewelheart_retreats_updated_at ON jewelheart_retreats;
CREATE TRIGGER jewelheart_retreats_updated_at
  BEFORE UPDATE ON jewelheart_retreats
  FOR EACH ROW EXECUTE PROCEDURE jewelheart_set_updated_at();

DROP TRIGGER IF EXISTS jewelheart_jobs_updated_at ON jewelheart_jobs;
CREATE TRIGGER jewelheart_jobs_updated_at
  BEFORE UPDATE ON jewelheart_jobs
  FOR EACH ROW EXECUTE PROCEDURE jewelheart_set_updated_at();

DROP TRIGGER IF EXISTS jewelheart_slots_updated_at ON jewelheart_slots;
CREATE TRIGGER jewelheart_slots_updated_at
  BEFORE UPDATE ON jewelheart_slots
  FOR EACH ROW EXECUTE PROCEDURE jewelheart_set_updated_at();

DROP TRIGGER IF EXISTS jewelheart_tasks_updated_at ON jewelheart_tasks;
CREATE TRIGGER jewelheart_tasks_updated_at
  BEFORE UPDATE ON jewelheart_tasks
  FOR EACH ROW EXECUTE PROCEDURE jewelheart_set_updated_at();

DROP TRIGGER IF EXISTS jewelheart_volunteers_updated_at ON jewelheart_volunteers;
CREATE TRIGGER jewelheart_volunteers_updated_at
  BEFORE UPDATE ON jewelheart_volunteers
  FOR EACH ROW EXECUTE PROCEDURE jewelheart_set_updated_at();

COMMIT;
