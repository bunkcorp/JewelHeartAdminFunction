-- Volunteer notification prefs + opaque calendar-feed token (per-volunteer secret URL segment).
-- Apply after 001_jewelheart_initial.sql.

BEGIN;

ALTER TABLE jewelheart_volunteers
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calendar_feed_token text;

COMMENT ON COLUMN jewelheart_volunteers.notify_email IS
  'If true (default), server may send transactional email when volunteer has email; Twilio SendGrid/etc. wired in deployment.';
COMMENT ON COLUMN jewelheart_volunteers.notify_sms IS
  'If true, server may send transactional SMS when phone present; Twilio/etc. wired in deployment.';
COMMENT ON COLUMN jewelheart_volunteers.calendar_feed_token IS
  'Opaque secret for GET /jewelheart/calendar-feed/{feedToken}; null until minted via authenticated POST calendar-feed. Rotate by replacing value.';

CREATE UNIQUE INDEX IF NOT EXISTS jewelheart_volunteers_calendar_feed_token_uidx
  ON jewelheart_volunteers (calendar_feed_token)
  WHERE calendar_feed_token IS NOT NULL AND length(trim(calendar_feed_token)) > 0;

COMMIT;
