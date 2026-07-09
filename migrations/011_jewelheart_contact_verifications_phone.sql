-- Allow phone channel for onboarding contact OTP (Twilio SMS).

ALTER TABLE jewelheart_contact_verifications
  DROP CONSTRAINT IF EXISTS jewelheart_contact_verifications_channel_check;

ALTER TABLE jewelheart_contact_verifications
  ADD CONSTRAINT jewelheart_contact_verifications_channel_check
  CHECK (channel IN ('email', 'phone'));
