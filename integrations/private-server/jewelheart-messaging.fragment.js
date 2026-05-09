/**
 * JewelHeart — in-app messaging (paste-in for private-server)
 * ============================================================
 *
 * Export: `createJewelHeartMessagingHandlers(deps)`
 *
 * **deps:** `query`, `assertUuid`, `ensureMessagingAccess(req, { retreatId, volunteerId })`,
 * optional `isGlobalJewelHeartAdmin(req)` (default false).
 *
 * **Volunteer identity:** Routes expect `req.volunteerId` (UUID) from auth middleware
 * (Firebase / Keycloak uid → `jewelheart_volunteers.firebase_uid` or email fallback).
 *
 * Wiring (Express-style): see `integrations/private-server/README.txt`.
 *
 * Env (optional):
 *   JEWELHEART_MESSAGE_EMAIL_NOTIFY — truthy to email other participants after POST message (SendGrid; never fails HTTP).
 *   JEWELHEART_MESSAGE_FCM_ENABLED — reserved; FCM device registry not in schema yet (no-op, see README).
 */

'use strict';

/**
 * @typedef {Object} MessagingDeps
 * @property {(sql: string, params?: any[]) => Promise<{ rows: any[] }>} query
 * @property {(id: string, label?: string) => void} assertUuid
 * @property {(req: import('express').Request, ctx: { retreatId: string, volunteerId: string }) => Promise<void>} ensureMessagingAccess
 * @property {(req: import('express').Request) => Promise<boolean>} [isGlobalJewelHeartAdmin]
 */

/**
 * Default no-op ACL for offline tests — **do not use in production.**
 * @type {MessagingDeps['ensureMessagingAccess']}
 */
async function ensureMessagingAccessStub(_req, _ctx) {}

function truthyEnv(v) {
  if (v == null || v === '') return false;
  const t = String(v).trim().toLowerCase();
  return t === '1' || t === 'true' || t === 'yes' || t === 'on';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonError(res, status, error, message, extra) {
  const body = { error, message, ...(extra && typeof extra === 'object' ? extra : {}) };
  res.status(status).json(body);
}

function httpStatus(e) {
  if (!e || typeof e !== 'object') return null;
  const s = e.status != null ? e.status : e.statusCode;
  return typeof s === 'number' && Number.isFinite(s) ? s : null;
}

function readVolunteerId(req) {
  const v = req.volunteerId ?? req.jewelheartVolunteerId;
  if (v == null || typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

function parseLimit(raw, def, max) {
  const n = raw == null || raw === '' ? def : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(n, max);
}

/**
 * Fire-and-forget email to conversation participants (except sender). Uses SendGrid HTTP API (Node 18+ fetch).
 * @param {(sql: string, params?: any[]) => Promise<{ rows: any[] }>} query
 * @param {{ conversationId: string, senderVolunteerId: string, bodyPreview: string, retreatName?: string }} ctx
 */
async function notifyOtherParticipantsEmail(query, ctx) {
  if (!truthyEnv(process.env.JEWELHEART_MESSAGE_EMAIL_NOTIFY)) return;
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL || process.env.JEWELHEART_FROM_EMAIL;
  if (!key || !from) return;

  try {
    const { rows: parts } = await query(
      `SELECT DISTINCT p.volunteer_id AS id
       FROM jewelheart_conversation_participants p
       WHERE p.conversation_id = $1 AND p.volunteer_id <> $2`,
      [ctx.conversationId, ctx.senderVolunteerId],
    );
    if (!parts.length) return;

    const ids = parts.map((r) => r.id);
    const { rows: vols } = await query(
      `SELECT id, display_name, email, notify_email
       FROM jewelheart_volunteers
       WHERE id = ANY($1::uuid[])`,
      [ids],
    );

    const subject = `New JewelHeart message${ctx.retreatName ? ` — ${ctx.retreatName}` : ''}`;
    const text =
      `You have a new message in a JewelHeart conversation.\n\n` +
      `${ctx.bodyPreview.slice(0, 400)}${ctx.bodyPreview.length > 400 ? '…' : ''}\n\n` +
      `Open the JewelHeart app to read the full thread.\n`;

    const html =
      `<p>You have a new message in a JewelHeart conversation.</p>` +
      `<blockquote style="border-left:3px solid #ccc;padding-left:8px;color:#333">${escapeHtml(ctx.bodyPreview.slice(0, 800))}${
        ctx.bodyPreview.length > 800 ? '…' : ''
      }</blockquote>` +
      `<p style="font-size:12px;color:#666">Open the JewelHeart app to reply.</p>`;

    for (const v of vols) {
      const wantEmail = v.notify_email !== false;
      const email = typeof v.email === 'string' ? v.email.trim() : '';
      if (!wantEmail || !email) continue;
      try {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: from },
            subject,
            content: [
              { type: 'text/plain', value: text },
              { type: 'text/html', value: html },
            ],
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          // eslint-disable-next-line no-console
          console.error('jewelheart message email notify sendgrid', res.status, t.slice(0, 300));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('jewelheart message email notify', err && err.message);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('jewelheart message email notify query', err && err.message);
  }
}

/**
 * FCM: no `fcm_token` (or device) column in current JewelHeart schema — no-op when enabled.
 * TODO: add device registry + tokens, then send via firebase-admin messaging.
 */
async function tryNotifyParticipantsFcmStub() {
  if (!truthyEnv(process.env.JEWELHEART_MESSAGE_FCM_ENABLED)) return;
  /* intentionally empty — see integrations/private-server/README.txt */
}

/**
 * @param {MessagingDeps} deps
 */
function createJewelHeartMessagingHandlers(deps) {
  const {
    query,
    assertUuid,
    ensureMessagingAccess = ensureMessagingAccessStub,
    isGlobalJewelHeartAdmin = async () => false,
  } = deps;

  async function assertRetreatVolunteer(retreatId, volunteerId) {
    const r = await query(
      `SELECT 1 FROM jewelheart_retreat_volunteers WHERE retreat_id = $1 AND volunteer_id = $2`,
      [retreatId, volunteerId],
    );
    return (r.rows && r.rows.length > 0) || false;
  }

  async function assertParticipant(conversationId, volunteerId) {
    const r = await query(
      `SELECT 1 FROM jewelheart_conversation_participants WHERE conversation_id = $1 AND volunteer_id = $2`,
      [conversationId, volunteerId],
    );
    return (r.rows && r.rows.length > 0) || false;
  }

  async function loadConversation(conversationId) {
    const r = await query(`SELECT id, retreat_id AS "retreatId", kind FROM jewelheart_conversations WHERE id = $1`, [
      conversationId,
    ]);
    return r.rows && r.rows[0] ? r.rows[0] : null;
  }

  async function linkedOrAdmin(req, retreatId, volunteerId) {
    if (await assertRetreatVolunteer(retreatId, volunteerId)) return true;
    return isGlobalJewelHeartAdmin(req);
  }

  /** POST /jewelheart/retreats/:retreatId/conversations */
  async function postRetreatConversation(req, res) {
    try {
      const retreatId = req.params.retreatId;
      assertUuid(retreatId, 'retreatId');
      const me = readVolunteerId(req);
      if (!me) {
        jsonError(res, 401, 'unauthorized', 'Missing volunteer context (req.volunteerId).');
        return;
      }
      assertUuid(me, 'volunteerId');
      await ensureMessagingAccess(req, { retreatId, volunteerId: me });

      if (!(await linkedOrAdmin(req, retreatId, me))) {
        jsonError(res, 403, 'forbidden', 'Volunteer is not linked to this retreat.');
        return;
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const kind = body.kind;
      if (kind !== 'direct' && kind !== 'retreat_room') {
        jsonError(res, 400, 'bad_request', 'body.kind must be "direct" or "retreat_room".');
        return;
      }

      if (kind === 'direct') {
        const peer = body.peerVolunteerId;
        if (!peer || typeof peer !== 'string') {
          jsonError(res, 400, 'bad_request', 'peerVolunteerId is required for direct conversations.');
          return;
        }
        assertUuid(peer, 'peerVolunteerId');
        if (peer === me) {
          jsonError(res, 400, 'bad_request', 'peerVolunteerId must differ from the current volunteer.');
          return;
        }
        const peerLinked = await assertRetreatVolunteer(retreatId, peer);
        if (!peerLinked) {
          jsonError(res, 403, 'forbidden', 'Peer volunteer is not linked to this retreat.');
          return;
        }
        const low = me < peer ? me : peer;
        const high = me < peer ? peer : me;

        let convId;
        const found = await query(
          `SELECT id FROM jewelheart_conversations
           WHERE retreat_id = $1 AND kind = 'direct' AND direct_peer_low = $2 AND direct_peer_high = $3`,
          [retreatId, low, high],
        );
        if (found.rows && found.rows[0]) {
          convId = found.rows[0].id;
        } else {
          try {
            const ins = await query(
              `INSERT INTO jewelheart_conversations (retreat_id, kind, direct_peer_low, direct_peer_high)
               VALUES ($1, 'direct', $2, $3)
               RETURNING id`,
              [retreatId, low, high],
            );
            convId = ins.rows[0].id;
          } catch (e) {
            if (e && e.code === '23505') {
              const again = await query(
                `SELECT id FROM jewelheart_conversations
                 WHERE retreat_id = $1 AND kind = 'direct' AND direct_peer_low = $2 AND direct_peer_high = $3`,
                [retreatId, low, high],
              );
              convId = again.rows[0].id;
            } else {
              throw e;
            }
          }
        }
        await query(
          `INSERT INTO jewelheart_conversation_participants (conversation_id, volunteer_id)
           VALUES ($1, $2), ($1, $3)
           ON CONFLICT DO NOTHING`,
          [convId, me, peer],
        );
        const row = await query(
          `SELECT c.id, c.retreat_id AS "retreatId", c.kind, c.updated_at AS "updatedAt",
                  p.last_read_at AS "lastReadAt",
                  CASE WHEN c.kind = 'direct' AND c.direct_peer_low = $2 THEN c.direct_peer_high ELSE c.direct_peer_low END AS "peerVolunteerId",
                  ov.display_name AS "peerDisplayName"
           FROM jewelheart_conversations c
           JOIN jewelheart_conversation_participants p ON p.conversation_id = c.id AND p.volunteer_id = $2
           LEFT JOIN jewelheart_volunteers ov ON ov.id = CASE WHEN c.direct_peer_low = $2 THEN c.direct_peer_high ELSE c.direct_peer_low END
           WHERE c.id = $1`,
          [convId, me],
        );
        res.status(200).json(row.rows[0]);
        return;
      }

      /* retreat_room */
      let convId;
      const room = await query(
        `SELECT id FROM jewelheart_conversations WHERE retreat_id = $1 AND kind = 'retreat_room'`,
        [retreatId],
      );
      if (room.rows && room.rows[0]) {
        convId = room.rows[0].id;
      } else {
        try {
          const ins = await query(
            `INSERT INTO jewelheart_conversations (retreat_id, kind) VALUES ($1, 'retreat_room') RETURNING id`,
            [retreatId],
          );
          convId = ins.rows[0].id;
        } catch (e) {
          if (e && e.code === '23505') {
            const again = await query(
              `SELECT id FROM jewelheart_conversations WHERE retreat_id = $1 AND kind = 'retreat_room'`,
              [retreatId],
            );
            convId = again.rows[0].id;
          } else {
            throw e;
          }
        }
      }
      await query(
        `INSERT INTO jewelheart_conversation_participants (conversation_id, volunteer_id)
         SELECT $1::uuid, rv.volunteer_id FROM jewelheart_retreat_volunteers rv WHERE rv.retreat_id = $2
         ON CONFLICT DO NOTHING`,
        [convId, retreatId],
      );
      if (await isGlobalJewelHeartAdmin(req)) {
        await query(
          `INSERT INTO jewelheart_conversation_participants (conversation_id, volunteer_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [convId, me],
        );
      }
      const row = await query(
        `SELECT c.id, c.retreat_id AS "retreatId", c.kind, c.updated_at AS "updatedAt",
                p.last_read_at AS "lastReadAt",
                NULL::uuid AS "peerVolunteerId",
                NULL::text AS "peerDisplayName"
         FROM jewelheart_conversations c
         JOIN jewelheart_conversation_participants p ON p.conversation_id = c.id AND p.volunteer_id = $2
         WHERE c.id = $1`,
        [convId, me],
      );
      res.status(200).json(row.rows[0]);
    } catch (e) {
      const st = httpStatus(e);
      if (st === 401 || st === 403) {
        jsonError(res, st, st === 401 ? 'unauthorized' : 'forbidden', e.message || String(st));
        return;
      }
      if (e && (e.statusCode === 400 || e.status === 400)) {
        jsonError(res, 400, 'bad_request', e.message || 'bad_request');
        return;
      }
      // eslint-disable-next-line no-console
      console.error('jewelheart messaging postRetreatConversation', e);
      jsonError(res, 500, 'server_error', 'Could not create conversation.');
    }
  }

  /** GET /jewelheart/retreats/:retreatId/conversations */
  async function getRetreatConversations(req, res) {
    try {
      const retreatId = req.params.retreatId;
      assertUuid(retreatId, 'retreatId');
      const me = readVolunteerId(req);
      if (!me) {
        jsonError(res, 401, 'unauthorized', 'Missing volunteer context (req.volunteerId).');
        return;
      }
      assertUuid(me, 'volunteerId');
      await ensureMessagingAccess(req, { retreatId, volunteerId: me });

      if (!(await linkedOrAdmin(req, retreatId, me))) {
        jsonError(res, 403, 'forbidden', 'Volunteer is not linked to this retreat.');
        return;
      }

      const r = await query(
        `SELECT c.id, c.retreat_id AS "retreatId", c.kind, c.updated_at AS "updatedAt",
                p.last_read_at AS "lastReadAt",
                CASE
                  WHEN c.kind = 'direct' AND c.direct_peer_low = $2 THEN c.direct_peer_high
                  WHEN c.kind = 'direct' THEN c.direct_peer_low
                  ELSE NULL
                END AS "peerVolunteerId",
                ov.display_name AS "peerDisplayName"
         FROM jewelheart_conversations c
         JOIN jewelheart_conversation_participants p ON p.conversation_id = c.id AND p.volunteer_id = $2
         LEFT JOIN jewelheart_volunteers ov ON ov.id = CASE
           WHEN c.kind = 'direct' AND c.direct_peer_low = $2 THEN c.direct_peer_high
           WHEN c.kind = 'direct' THEN c.direct_peer_low
           ELSE NULL
         END
         WHERE c.retreat_id = $1
         ORDER BY c.updated_at DESC`,
        [retreatId, me],
      );
      res.status(200).json({ items: r.rows || [] });
    } catch (e) {
      const st = httpStatus(e);
      if (st === 401 || st === 403) {
        jsonError(res, st, st === 401 ? 'unauthorized' : 'forbidden', e.message || String(st));
        return;
      }
      // eslint-disable-next-line no-console
      console.error('jewelheart messaging getRetreatConversations', e);
      jsonError(res, 500, 'server_error', 'Could not list conversations.');
    }
  }

  /** GET /jewelheart/conversations/:conversationId/messages */
  async function getConversationMessages(req, res) {
    try {
      const conversationId = req.params.conversationId;
      assertUuid(conversationId, 'conversationId');
      const me = readVolunteerId(req);
      if (!me) {
        jsonError(res, 401, 'unauthorized', 'Missing volunteer context (req.volunteerId).');
        return;
      }
      assertUuid(me, 'volunteerId');

      const conv = await loadConversation(conversationId);
      if (!conv) {
        jsonError(res, 404, 'not_found', 'Conversation not found.');
        return;
      }
      await ensureMessagingAccess(req, { retreatId: conv.retreatId, volunteerId: me });

      const ok = await assertParticipant(conversationId, me);
      if (!ok) {
        jsonError(res, 403, 'forbidden', 'Not a participant in this conversation.');
        return;
      }

      const admin = await isGlobalJewelHeartAdmin(req);
      const includeDeleted =
        admin && req.query && String(req.query.include_deleted || '').toLowerCase() === 'true';

      const limit = parseLimit(req.query && req.query.limit, 50, 100);
      const cursor = req.query && req.query.cursor ? String(req.query.cursor) : null;
      if (cursor) {
        assertUuid(cursor, 'cursor');
      }

      const delClause = includeDeleted ? '' : 'AND m.deleted_at IS NULL ';

      const r = await query(
        `SELECT m.id, m.conversation_id AS "conversationId", m.sender_volunteer_id AS "senderVolunteerId",
                v.display_name AS "senderDisplayName", m.body, m.created_at AS "createdAt",
                m.deleted_at AS "deletedAt"
         FROM jewelheart_messages m
         JOIN jewelheart_volunteers v ON v.id = m.sender_volunteer_id
         WHERE m.conversation_id = $1
           ${delClause}
           AND (
             $2::uuid IS NULL
             OR (m.created_at, m.id) < (
               SELECT created_at, id FROM jewelheart_messages WHERE id = $2::uuid AND conversation_id = $1
             )
           )
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $3`,
        [conversationId, cursor, limit],
      );
      const raw = r.rows || [];
      const nextCursor = raw.length > 0 ? raw[raw.length - 1].id : null;
      const items = includeDeleted
        ? raw
        : raw.map((row) => {
            const { deletedAt, ...rest } = row;
            return rest;
          });
      res.status(200).json({ items, nextCursor });
    } catch (e) {
      const st = httpStatus(e);
      if (st === 401 || st === 403) {
        jsonError(res, st, st === 401 ? 'unauthorized' : 'forbidden', e.message || String(st));
        return;
      }
      // eslint-disable-next-line no-console
      console.error('jewelheart messaging getConversationMessages', e);
      jsonError(res, 500, 'server_error', 'Could not load messages.');
    }
  }

  /** POST /jewelheart/conversations/:conversationId/messages */
  async function postConversationMessage(req, res) {
    try {
      const conversationId = req.params.conversationId;
      assertUuid(conversationId, 'conversationId');
      const me = readVolunteerId(req);
      if (!me) {
        jsonError(res, 401, 'unauthorized', 'Missing volunteer context (req.volunteerId).');
        return;
      }
      assertUuid(me, 'volunteerId');

      const conv = await loadConversation(conversationId);
      if (!conv) {
        jsonError(res, 404, 'not_found', 'Conversation not found.');
        return;
      }
      await ensureMessagingAccess(req, { retreatId: conv.retreatId, volunteerId: me });

      const ok = await assertParticipant(conversationId, me);
      if (!ok) {
        jsonError(res, 403, 'forbidden', 'Not a participant in this conversation.');
        return;
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const text = body.body;
      if (typeof text !== 'string' || !text.trim()) {
        jsonError(res, 400, 'bad_request', 'body.body must be a non-empty string.');
        return;
      }

      const ins = await query(
        `INSERT INTO jewelheart_messages (conversation_id, sender_volunteer_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, conversation_id AS "conversationId", sender_volunteer_id AS "senderVolunteerId",
                   body, created_at AS "createdAt", deleted_at AS "deletedAt"`,
        [conversationId, me, text],
      );
      const row = ins.rows[0];
      const v = await query(`SELECT display_name AS "senderDisplayName" FROM jewelheart_volunteers WHERE id = $1`, [me]);
      row.senderDisplayName = v.rows[0] ? v.rows[0].senderDisplayName : null;
      if (row.deletedAt != null) {
        delete row.deletedAt;
      }

      let retreatName = '';
      try {
        const nr = await query(`SELECT name FROM jewelheart_retreats WHERE id = $1`, [conv.retreatId]);
        retreatName = nr.rows[0] && nr.rows[0].name ? String(nr.rows[0].name) : '';
      } catch (_) {
        /* ignore */
      }

      void notifyOtherParticipantsEmail(query, {
        conversationId,
        senderVolunteerId: me,
        bodyPreview: text.trim(),
        retreatName,
      });
      void tryNotifyParticipantsFcmStub();

      res.status(201).json(row);
    } catch (e) {
      const st = httpStatus(e);
      if (st === 401 || st === 403) {
        jsonError(res, st, st === 401 ? 'unauthorized' : 'forbidden', e.message || String(st));
        return;
      }
      if (e && e.code === '23514') {
        jsonError(res, 400, 'bad_request', 'Message body failed validation.');
        return;
      }
      // eslint-disable-next-line no-console
      console.error('jewelheart messaging postConversationMessage', e);
      jsonError(res, 500, 'server_error', 'Could not send message.');
    }
  }

  /** POST /jewelheart/conversations/:conversationId/read */
  async function postConversationRead(req, res) {
    try {
      const conversationId = req.params.conversationId;
      assertUuid(conversationId, 'conversationId');
      const me = readVolunteerId(req);
      if (!me) {
        jsonError(res, 401, 'unauthorized', 'Missing volunteer context (req.volunteerId).');
        return;
      }
      assertUuid(me, 'volunteerId');

      const conv = await loadConversation(conversationId);
      if (!conv) {
        jsonError(res, 404, 'not_found', 'Conversation not found.');
        return;
      }
      await ensureMessagingAccess(req, { retreatId: conv.retreatId, volunteerId: me });

      const r = await query(
        `UPDATE jewelheart_conversation_participants SET last_read_at = now()
         WHERE conversation_id = $1 AND volunteer_id = $2
         RETURNING last_read_at AS "lastReadAt"`,
        [conversationId, me],
      );
      if (!r.rows || !r.rows[0]) {
        jsonError(res, 403, 'forbidden', 'Not a participant in this conversation.');
        return;
      }
      res.status(200).json({ ok: true, lastReadAt: r.rows[0].lastReadAt });
    } catch (e) {
      const st = httpStatus(e);
      if (st === 401 || st === 403) {
        jsonError(res, st, st === 401 ? 'unauthorized' : 'forbidden', e.message || String(st));
        return;
      }
      // eslint-disable-next-line no-console
      console.error('jewelheart messaging postConversationRead', e);
      jsonError(res, 500, 'server_error', 'Could not update read state.');
    }
  }

  /** DELETE /jewelheart/messages/:messageId */
  async function deleteJewelHeartMessage(req, res) {
    try {
      const messageId = req.params.messageId;
      assertUuid(messageId, 'messageId');
      const me = readVolunteerId(req);
      if (!me) {
        jsonError(res, 401, 'unauthorized', 'Missing volunteer context (req.volunteerId).');
        return;
      }
      assertUuid(me, 'volunteerId');

      const mr = await query(
        `SELECT m.id, m.conversation_id AS "conversationId", m.sender_volunteer_id AS "senderVolunteerId", m.created_at AS "createdAt",
                m.deleted_at AS "deletedAt", c.retreat_id AS "retreatId"
         FROM jewelheart_messages m
         JOIN jewelheart_conversations c ON c.id = m.conversation_id
         WHERE m.id = $1`,
        [messageId],
      );
      const msg = mr.rows && mr.rows[0];
      if (!msg) {
        jsonError(res, 404, 'not_found', 'Message not found.');
        return;
      }
      if (msg.deletedAt) {
        jsonError(res, 404, 'not_found', 'Message already deleted.');
        return;
      }

      await ensureMessagingAccess(req, { retreatId: msg.retreatId, volunteerId: me });

      const admin = await isGlobalJewelHeartAdmin(req);
      const participant = await assertParticipant(msg.conversationId, me);
      if (!participant && !admin) {
        jsonError(res, 403, 'forbidden', 'Not allowed to delete this message.');
        return;
      }

      const senderOwn =
        msg.senderVolunteerId === me &&
        (() => {
          const t = new Date(msg.createdAt).getTime();
          return Number.isFinite(t) && Date.now() - t <= 15 * 60 * 1000;
        })();

      if (!admin && !senderOwn) {
        jsonError(res, 403, 'forbidden', 'You can only delete your own messages within 15 minutes, unless you are a JewelHeart admin.');
        return;
      }

      await query(`UPDATE jewelheart_messages SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [messageId]);
      res.status(204).end();
    } catch (e) {
      const st = httpStatus(e);
      if (st === 401 || st === 403) {
        jsonError(res, st, st === 401 ? 'unauthorized' : 'forbidden', e.message || String(st));
        return;
      }
      // eslint-disable-next-line no-console
      console.error('jewelheart messaging deleteJewelHeartMessage', e);
      jsonError(res, 500, 'server_error', 'Could not delete message.');
    }
  }

  return {
    postRetreatConversation,
    getRetreatConversations,
    getConversationMessages,
    postConversationMessage,
    postConversationRead,
    deleteJewelHeartMessage,
  };
}

module.exports = { createJewelHeartMessagingHandlers, ensureMessagingAccessStub };
