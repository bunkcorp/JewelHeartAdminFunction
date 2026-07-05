-- Check-ins per assignment + required count per job (v9 Master column K).
BEGIN;

ALTER TABLE jewelheart_jobs
  ADD COLUMN IF NOT EXISTS checkins_required integer NOT NULL DEFAULT 1;

ALTER TABLE jewelheart_jobs
  DROP CONSTRAINT IF EXISTS jewelheart_jobs_checkins_required_check;

ALTER TABLE jewelheart_jobs
  ADD CONSTRAINT jewelheart_jobs_checkins_required_check
  CHECK (checkins_required >= 1);

COMMENT ON COLUMN jewelheart_jobs.checkins_required IS
  'Check-ins needed to fulfill one assignment (v9 Master col K; urinals = 2).';

CREATE TABLE IF NOT EXISTS jewelheart_shift_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES jewelheart_assignments (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jewelheart_shift_checkins_assignment_idx
  ON jewelheart_shift_checkins (assignment_id);

CREATE INDEX IF NOT EXISTS jewelheart_shift_checkins_started_idx
  ON jewelheart_shift_checkins (started_at DESC);

COMMENT ON TABLE jewelheart_shift_checkins IS
  'Volunteer check-in records per assignment; Start creates a row; Finish sets finished_at.';

UPDATE jewelheart_jobs
SET checkins_required = 2
WHERE lower(title) LIKE '%urinal%';

COMMIT;
