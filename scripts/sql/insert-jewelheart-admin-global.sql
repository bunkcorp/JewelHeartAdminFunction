-- Global JewelHeart admin for Firebase UID (run once against prod DB).

INSERT INTO jewelheart_admins (firebase_uid)
VALUES ('YOUR_FIREBASE_UID_HERE')
ON CONFLICT (firebase_uid) DO NOTHING;
