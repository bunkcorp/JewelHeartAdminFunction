-- Grant JewelHeart manager access (app-internal ops: poster, assignments, etc.).
-- Replace YOUR_FIREBASE_UID with the user's Firebase Auth UID.

INSERT INTO jewelheart_managers (firebase_uid)
VALUES ('YOUR_FIREBASE_UID')
ON CONFLICT (firebase_uid) DO NOTHING;
