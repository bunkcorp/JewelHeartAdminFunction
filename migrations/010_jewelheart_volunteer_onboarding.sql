-- Volunteer onboarding profile confirmation + contact OTP verifications.

ALTER TABLE jewelheart_volunteers
  ADD COLUMN IF NOT EXISTS profile_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS auth_email_at_signup text,
  ADD COLUMN IF NOT EXISTS auth_phone_at_signup text;

COMMENT ON COLUMN jewelheart_volunteers.profile_confirmed_at IS
  'Set when volunteer completes onboarding; NULL forces onboarding screen.';
COMMENT ON COLUMN jewelheart_volunteers.auth_email_at_signup IS
  'Email from auth provider at first bootstrap (audit).';
COMMENT ON COLUMN jewelheart_volunteers.auth_phone_at_signup IS
  'Phone from auth provider at first bootstrap (audit).';

CREATE TABLE IF NOT EXISTS jewelheart_contact_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid NOT NULL REFERENCES jewelheart_volunteers (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email')),
  destination text NOT NULL,
  code_hash text NOT NULL,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jewelheart_contact_verifications_volunteer_idx
  ON jewelheart_contact_verifications (volunteer_id, channel, destination);
