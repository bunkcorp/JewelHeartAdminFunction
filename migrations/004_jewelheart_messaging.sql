-- JewelHeart in-app messaging (MVP): conversations, participants, messages.
-- Apply after 001_jewelheart_initial.sql (requires jewelheart_retreats, jewelheart_volunteers, jewelheart_retreat_volunteers).

BEGIN;

-- Conversations: one retreat_room per retreat; direct uses canonical ordered pair columns for uniqueness.
CREATE TABLE IF NOT EXISTS jewelheart_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retreat_id uuid NOT NULL REFERENCES jewelheart_retreats (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('direct', 'retreat_room')),
  -- For kind=direct only: ordered volunteer ids (low < high) for one row per unordered pair per retreat.
  direct_peer_low uuid REFERENCES jewelheart_volunteers (id) ON DELETE CASCADE,
  direct_peer_high uuid REFERENCES jewelheart_volunteers (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'retreat_room' AND direct_peer_low IS NULL AND direct_peer_high IS NULL)
    OR (
      kind = 'direct'
      AND direct_peer_low IS NOT NULL
      AND direct_peer_high IS NOT NULL
      AND direct_peer_low < direct_peer_high
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS jewelheart_conversations_one_room_per_retreat
  ON jewelheart_conversations (retreat_id)
  WHERE kind = 'retreat_room';

CREATE UNIQUE INDEX IF NOT EXISTS jewelheart_conversations_direct_pair_uidx
  ON jewelheart_conversations (retreat_id, direct_peer_low, direct_peer_high)
  WHERE kind = 'direct';

CREATE INDEX IF NOT EXISTS jewelheart_conversations_retreat_updated_idx
  ON jewelheart_conversations (retreat_id, updated_at DESC);

DROP TRIGGER IF EXISTS jewelheart_conversations_updated_at ON jewelheart_conversations;
CREATE TRIGGER jewelheart_conversations_updated_at
  BEFORE UPDATE ON jewelheart_conversations
  FOR EACH ROW EXECUTE PROCEDURE jewelheart_set_updated_at();

CREATE TABLE IF NOT EXISTS jewelheart_conversation_participants (
  conversation_id uuid NOT NULL REFERENCES jewelheart_conversations (id) ON DELETE CASCADE,
  volunteer_id uuid NOT NULL REFERENCES jewelheart_volunteers (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS jewelheart_conversation_participants_volunteer_idx
  ON jewelheart_conversation_participants (volunteer_id);

CREATE TABLE IF NOT EXISTS jewelheart_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES jewelheart_conversations (id) ON DELETE CASCADE,
  sender_volunteer_id uuid NOT NULL REFERENCES jewelheart_volunteers (id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jewelheart_messages_conv_created_idx
  ON jewelheart_messages (conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION jewelheart_touch_conversation_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE jewelheart_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jewelheart_messages_touch_conversation ON jewelheart_messages;
CREATE TRIGGER jewelheart_messages_touch_conversation
  AFTER INSERT ON jewelheart_messages
  FOR EACH ROW EXECUTE PROCEDURE jewelheart_touch_conversation_updated_at();

COMMIT;
