-- Grant one Firebase user per-retreat admin access on every existing retreat.
-- Use when a coordinator should see the same retreat list and jobs as another admin
-- who has global access (or when you want them to match "all retreats" without jewelheart_admins).
--
-- Run against the same Postgres as private-server (e.g. psql "$DATABASE_URL" -f this-file).
-- Replace YOUR_FIREBASE_UID_HERE with the recipient UID (Meta tab in the app).

INSERT INTO jewelheart_retreat_admins (retreat_id, firebase_uid)
SELECT r.id, 'YOUR_FIREBASE_UID_HERE'
FROM jewelheart_retreats r
ON CONFLICT DO NOTHING;
