-- Volunteer testing mode: pin "today" for QA (dev/test databases).
-- Single row (id = 1). Production retreat DB should keep enabled = false.

CREATE TABLE IF NOT EXISTS jewelheart_volunteer_testing_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  pinned_today date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_firebase_uid text
);

INSERT INTO jewelheart_volunteer_testing_settings (id, enabled, pinned_today)
VALUES (1, true, '2026-07-21'::date)
ON CONFLICT (id) DO NOTHING;
