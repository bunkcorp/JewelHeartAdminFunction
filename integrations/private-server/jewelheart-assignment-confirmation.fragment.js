/**
 * JewelHeart — sealed assignment confirmation GET (HTML) + POST (JSON or form)
 * =============================================================================
 *
 * Token: URL-safe `payloadB64.sigB64` where payload is JSON
 *   `{ "assignmentId": "<uuid>", "volunteerId": "<uuid>", "exp": <unix_sec> }`
 * and sig = HMAC-SHA256(`CALENDAR_CONFIRM_SECRET`, payloadB64) as base64url.
 *
 * Env:
 *   CALENDAR_CONFIRM_SECRET — required in production (min 16 chars recommended).
 *
 * Express wiring:
 *
 *   const confirm = createJewelHeartAssignmentConfirmationHandlers({ query, volunteerNotify });
 *   app.get('/jewelheart/assignment-confirmations/:sealedConfirmationToken', confirm.getAssignmentConfirmationLanding);
 *   app.post('/jewelheart/assignment-confirmations/:sealedConfirmationToken', confirm.postAssignmentConfirmationRespond);
 *   app.get('/jewelheart/static/volunteer-assignment-confirmed.gif', confirm.getVolunteerAssignmentConfirmedGif);
 *
 * Use `express.urlencoded({ extended: false })` so HTML forms work alongside `express.json()`.
 *
 * Helper for email/SMS stubs (future): `signAssignmentConfirmationToken(payload, secret)`
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Public path (same host as API) for the success GIF; register GET in Express. */
const VOLUNTEER_CONFIRM_GIF_URL_PATH = '/jewelheart/static/volunteer-assignment-confirmed.gif';

/**
 * @returns {string|null} absolute path to GIF on disk, or null
 */
function resolveConfirmSuccessGifPath() {
  const envP = process.env.JEWELHEART_CONFIRM_SUCCESS_GIF_PATH;
  if (envP && fs.existsSync(envP)) return envP;
  const candidates = [
    path.join(__dirname, 'volunteer-assignment-confirmed.gif'),
    path.join(__dirname, '..', '..', 'assets', 'volunteer-assignment-confirmed.gif'),
    path.join(__dirname, '..', 'assets', 'volunteer-assignment-confirmed.gif'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function b64urlToBuf(s) {
  let b = String(s || '').replace(/-/gu, '+').replace(/_/gu, '/');
  while (b.length % 4) b += '=';
  return Buffer.from(b, 'base64');
}

function signAssignmentConfirmationToken(payload, secret) {
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

function verifyConfirmationToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  let sigBuf;
  try {
    sigBuf = b64urlToBuf(sigB64);
  } catch {
    return null;
  }
  const expectedBuf = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  try {
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  } catch {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const { assignmentId, volunteerId, exp } = payload;
  if (typeof assignmentId !== 'string' || typeof volunteerId !== 'string' || typeof exp !== 'number') return null;
  if (Math.floor(Date.now() / 1000) > exp) return null;
  return { assignmentId, volunteerId, exp };
}

function readIntent(req) {
  const b = req.body;
  if (!b) return null;
  if (typeof b.intent === 'string') return b.intent;
  return null;
}

/**
 * @param {object} deps
 * @param {(text:string, params?:any[]) => Promise<{ rows: any[] }>} deps.query
 * @param {{ notifyAfterAssignmentRemoved?: (p: { volunteerId: string, assignmentId: string }) => Promise<unknown> }} [deps.volunteerNotify]
 */
function createJewelHeartAssignmentConfirmationHandlers(deps) {
  const { query } = deps;
  /** @type {{ notifyAfterAssignmentRemoved?: (p: { volunteerId: string, assignmentId: string }) => Promise<unknown> } | null | undefined} */
  const volunteerNotify = deps.volunteerNotify || null;

  function confirmSecret() {
    const s = process.env.CALENDAR_CONFIRM_SECRET;
    return typeof s === 'string' && s.length > 0 ? s : null;
  }

  async function getAssignmentConfirmationLanding(req, res) {
    const secret = confirmSecret();
    const tok = req.params.sealedConfirmationToken;
    if (!secret) {
      res.status(503).type('text/plain').send('CALENDAR_CONFIRM_SECRET not configured');
      return;
    }
    const parsed = verifyConfirmationToken(tok, secret);
    if (!parsed) {
      res.status(404).type('text/plain').send('Invalid or expired link');
      return;
    }
    const { rows } = await query(
      `SELECT a.id, t.retreat_id
       FROM jewelheart_assignments a
       JOIN jewelheart_tasks t ON t.id = a.task_id
       WHERE a.id = $1 AND a.volunteer_id = $2`,
      [parsed.assignmentId, parsed.volunteerId],
    );
    if (!rows.length) {
      res.status(410).type('text/plain').send('Assignment no longer available');
      return;
    }

    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Assignment</title></head><body style="font-family:system-ui,sans-serif;padding:1rem">' +
      '<p>Confirm your volunteer assignment.</p>' +
      `<form method="post" action="/jewelheart/assignment-confirmations/${tok}" style="margin:.5rem 0">` +
      '<input type="hidden" name="intent" value="committed"/>' +
      '<button type="submit">Keep assignment</button></form>' +
      `<form method="post" action="/jewelheart/assignment-confirmations/${tok}" style="margin:.5rem 0">` +
      '<input type="hidden" name="intent" value="withdrawn"/>' +
      '<button type="submit">Withdraw</button></form>' +
      '</body></html>';
    res.status(200).type('text/html').send(html);
  }

  async function postAssignmentConfirmationRespond(req, res) {
    const secret = confirmSecret();
    const tok = req.params.sealedConfirmationToken;
    if (!secret) {
      res.status(503).json({ ok: false, message: 'confirmation_not_configured' });
      return;
    }
    const parsed = verifyConfirmationToken(tok, secret);
    if (!parsed) {
      res.status(404).json({ ok: false, message: 'invalid_or_expired_token' });
      return;
    }

    const intent = readIntent(req);
    if (intent !== 'committed' && intent !== 'withdrawn') {
      res.status(400).json({ ok: false, message: 'intent_required' });
      return;
    }

    const { rows } = await query(
      `SELECT a.id, t.retreat_id
       FROM jewelheart_assignments a
       JOIN jewelheart_tasks t ON t.id = a.task_id
       WHERE a.id = $1 AND a.volunteer_id = $2`,
      [parsed.assignmentId, parsed.volunteerId],
    );
    if (!rows.length) {
      res.status(410).json({ ok: false, message: 'assignment_gone' });
      return;
    }

    if (intent === 'committed') {
      const wantsJson =
        typeof req.get === 'function' &&
        String(req.get('accept') || '')
          .toLowerCase()
          .includes('application/json') &&
        !String(req.get('accept') || '')
          .toLowerCase()
          .includes('text/html');
      if (wantsJson) {
        res.status(200).json({ ok: true, message: 'committed', assignmentRemoved: false });
        return;
      }
      const gifPath = resolveConfirmSuccessGifPath();
      const imgBlock =
        gifPath != null
          ? `<p style="margin-top:1rem"><img src="${VOLUNTEER_CONFIRM_GIF_URL_PATH}" alt="" width="560" style="max-width:100%;height:auto;border-radius:8px"/></p>`
          : '';
      const html =
        '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Confirmed</title></head><body style="font-family:system-ui,sans-serif;padding:1rem">' +
        '<p>Thank you — your volunteer assignment is confirmed.</p>' +
        imgBlock +
        '</body></html>';
      res.status(200).type('text/html').send(html);
      return;
    }

    if (
      volunteerNotify &&
      typeof volunteerNotify.notifyAfterAssignmentRemoved === 'function'
    ) {
      await volunteerNotify.notifyAfterAssignmentRemoved({
        volunteerId: parsed.volunteerId,
        assignmentId: parsed.assignmentId,
      });
    }
    await query(`DELETE FROM jewelheart_assignments WHERE id = $1`, [parsed.assignmentId]);
    res.status(200).json({ ok: true, message: 'withdrawn', assignmentRemoved: true });
  }

  async function getVolunteerAssignmentConfirmedGif(req, res) {
    try {
      const p = resolveConfirmSuccessGifPath();
      if (!p) {
        res.status(404).type('text/plain').send('volunteer_confirm_gif_not_found');
        return;
      }
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      fs.createReadStream(p).pipe(res);
    } catch (e) {
      res.status(500).type('text/plain').send(String(e && e.message));
    }
  }

  return {
    getAssignmentConfirmationLanding,
    postAssignmentConfirmationRespond,
    getVolunteerAssignmentConfirmedGif,
    signAssignmentConfirmationToken,
    verifyConfirmationToken,
  };
}

module.exports = {
  createJewelHeartAssignmentConfirmationHandlers,
  signAssignmentConfirmationToken,
  verifyConfirmationToken,
  VOLUNTEER_CONFIRM_GIF_URL_PATH,
  resolveConfirmSuccessGifPath,
};
