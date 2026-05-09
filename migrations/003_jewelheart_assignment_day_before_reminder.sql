-- Idempotent "day before shift" reminder sends (see jewelheart-volunteer-notify.fragment.js).

ALTER TABLE jewelheart_assignments
  ADD COLUMN IF NOT EXISTS day_before_reminder_sent_at timestamptz;

COMMENT ON COLUMN jewelheart_assignments.day_before_reminder_sent_at IS
  'Set when a day-before reminder email/SMS was successfully sent for this assignment; prevents duplicate cron sends.';
