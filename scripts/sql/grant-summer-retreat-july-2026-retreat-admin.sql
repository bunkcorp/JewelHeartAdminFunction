-- Grant one Firebase user per-retreat admin on the seeded summer retreat (Jul 20–25, 2026).
-- Retreat id is stable from scripts/seed_summer_retreat_july_2026_from_xlsx.py (uuid5).
--
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/grant-summer-retreat-july-2026-retreat-admin.sql
-- Or replace the UID below first (Firebase Console → Authentication, or Meta tab in admin app).

INSERT INTO jewelheart_retreat_admins (retreat_id, firebase_uid)
VALUES (
  '34d43115-67b3-5fbf-9173-abb051c11ca7'::uuid,
  'YOUR_FIREBASE_UID_HERE'
)
ON CONFLICT (retreat_id, firebase_uid) DO NOTHING;
