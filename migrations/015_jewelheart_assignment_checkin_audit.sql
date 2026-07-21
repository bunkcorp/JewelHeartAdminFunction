-- Assignment and check-in audit columns (manager Job finder, future obo writes).

ALTER TABLE jewelheart_assignments
  ADD COLUMN IF NOT EXISTS assigned_by_volunteer_id uuid
    REFERENCES jewelheart_volunteers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_source text;

ALTER TABLE jewelheart_shift_checkins
  ADD COLUMN IF NOT EXISTS performed_by_volunteer_id uuid
    REFERENCES jewelheart_volunteers (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jewelheart_assignments_assigned_by_idx
  ON jewelheart_assignments (assigned_by_volunteer_id)
  WHERE assigned_by_volunteer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS jewelheart_shift_checkins_performed_by_idx
  ON jewelheart_shift_checkins (performed_by_volunteer_id)
  WHERE performed_by_volunteer_id IS NOT NULL;
