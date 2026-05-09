-- Optional link from Firebase (or Keycloak-resolved) uid to jewelheart_volunteers for messaging / self-service.
-- Apply after 001_jewelheart_initial.sql (and alongside 002+ if present).

BEGIN;

ALTER TABLE jewelheart_volunteers
  ADD COLUMN IF NOT EXISTS firebase_uid text;

CREATE UNIQUE INDEX IF NOT EXISTS jewelheart_volunteers_firebase_uid_uidx
  ON jewelheart_volunteers (firebase_uid)
  WHERE firebase_uid IS NOT NULL AND length(trim(firebase_uid)) > 0;

COMMENT ON COLUMN jewelheart_volunteers.firebase_uid IS
  'When set, Bearer auth uid maps to this volunteer row for req.volunteerId (messaging). Falls back to email match if unset.';

COMMIT;
