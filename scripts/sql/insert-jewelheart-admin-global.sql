-- Global JewelHeart admin by Firebase UID (optional).
-- Replace YOUR_FIREBASE_UID_HERE (Settings → KarmaDots profile / Firebase console).

INSERT INTO jewelheart_admins (firebase_uid)
VALUES ('YOUR_FIREBASE_UID_HERE')
ON CONFLICT (firebase_uid) DO NOTHING;
