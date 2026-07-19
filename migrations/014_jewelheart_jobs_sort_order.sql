-- Master-tab row order for jobs (v9 spreadsheet rows 2–18).
-- Seeding from Excel should set sort_order explicitly; poster-order fallback remains in app code.
BEGIN;

ALTER TABLE jewelheart_jobs
  ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON COLUMN jewelheart_jobs.sort_order IS
  'Display order within retreat (Master tab row order). Lower = earlier.';

-- Backfill Summer-2026 titles in canonical spreadsheet order.
UPDATE jewelheart_jobs j
SET sort_order = v.ord
FROM (
  VALUES
    ('Café, lunch break / Light cleanup', 0),
    ('Café, end of day / Full cleanup', 1),
    ('Kitchen, lunch brk / Light cleanup', 2),
    ('Kitchen, end of day / Full cleanup', 3),
    ('Coffee & snacks / Morning setup', 4),
    ('Coffee & snacks / Evening brkdwn', 5),
    ('Tara Paradse, store / Vacuum', 6),
    ('JH off, main hallway / Vacuum', 7),
    ('Coatrm, café hallwy / Vacuum', 8),
    ('Foyer & lobby / Vacuum', 9),
    ('Lama offices / Clean', 10),
    ('Men''s room / Clean & stock', 11),
    ('Urinals / Check pads & mop', 12),
    ('Women''s room / Clean & stock', 13),
    ('Unisx, Lama bathrooms', 14),
    ('Front windows / Clean', 15),
    ('Towels, mop pads / launder at home', 16)
) AS v(title, ord)
WHERE j.title = v.title
  AND j.sort_order IS NULL;

UPDATE jewelheart_jobs
SET sort_order = 9999
WHERE sort_order IS NULL;

ALTER TABLE jewelheart_jobs
  ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE jewelheart_jobs
  ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS jewelheart_jobs_retreat_sort_idx
  ON jewelheart_jobs (retreat_id, sort_order);

COMMIT;
