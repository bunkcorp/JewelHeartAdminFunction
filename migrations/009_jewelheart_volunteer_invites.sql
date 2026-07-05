-- Volunteer invite tokens (QR / magic link onboarding) + roster role flags.
-- Apply after 006_jewelheart_volunteer_firebase_uid.sql.

BEGIN;

ALTER TABLE jewelheart_volunteers
  ADD COLUMN IF NOT EXISTS roster_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS roster_manage boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN jewelheart_volunteers.roster_admin IS
  'When true, first successful invite redeem grants jewelheart_admins for auth uid.';
COMMENT ON COLUMN jewelheart_volunteers.roster_manage IS
  'When true, first successful invite redeem grants jewelheart_managers for auth uid.';

CREATE TABLE IF NOT EXISTS jewelheart_volunteer_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retreat_id uuid NOT NULL REFERENCES jewelheart_retreats (id) ON DELETE CASCADE,
  volunteer_id uuid NOT NULL REFERENCES jewelheart_volunteers (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by_uid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jewelheart_volunteer_invites_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS jewelheart_volunteer_invites_retreat_vol_idx
  ON jewelheart_volunteer_invites (retreat_id, volunteer_id);

CREATE INDEX IF NOT EXISTS jewelheart_volunteer_invites_active_idx
  ON jewelheart_volunteer_invites (volunteer_id)
  WHERE consumed_at IS NULL;

COMMENT ON TABLE jewelheart_volunteer_invites IS
  'One-time (or short-TTL) invite tokens tying a volunteer row to a retreat login QR/link.';

COMMIT;
