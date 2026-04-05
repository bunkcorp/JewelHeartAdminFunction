-- Global JewelHeart admin for Firebase UID (run once against the same DB as private-server).
-- Needed for /jewelheart/volunteers and other directory-wide routes (see src/jewelheart/acl.js).
-- Get UID: Meta tab in the app (copy), Firebase Console → Authentication, or Xcode logs.
-- Anonymous Firebase users get a new UID per install/session; add each UID you use to this table.

INSERT INTO jewelheart_admins (firebase_uid)
VALUES ('YOUR_FIREBASE_UID_HERE')
ON CONFLICT (firebase_uid) DO NOTHING;
