-- Soft-delete for JewelHeart in-app messages (moderation + sender recall).
-- Apply after 004_jewelheart_messaging.sql.

BEGIN;

ALTER TABLE jewelheart_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS jewelheart_messages_conv_deleted_idx
  ON jewelheart_messages (conversation_id, deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN jewelheart_messages.deleted_at IS
  'When set, message is hidden from normal list/get; admins may pass include_deleted=true.';

COMMIT;
