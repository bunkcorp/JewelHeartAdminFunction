/**
 * JewelHeart — calendar ICS feed + mint/revoke handlers (private-server paste-in)
 * =============================================================================
 *
 * Paste into KarmaDots / buddhist-stone `private-server` jewelheart routes (see README.txt).
 *
 * Wiring (Express-style example):
 *
 *   const { createJewelHeartCalendarHandlers } = require('./jewelheart-calendar-feed.fragment.js');
 *   const cal = createJewelHeartCalendarHandlers({
 *     query,                         // async (text, params) => pool.query(...)
 *     assertUuid,
 *     ensureVolunteerPatchAccess,    // async (req, volunteerId) => void; throws/403 like PATCH /volunteers/:id
 *     publicOriginFromReq,           // (req) => 'https://api.example.org' (see env note below)
 *     volunteerNotify,              // optional: createJewelHeartVolunteerNotify({ query }) — mint/rotate/revoke emails
 *   });
 *   app.head('/jewelheart/calendar-feed/:feedToken', cal.headVolunteerCalendarFeed);
 *   app.get('/jewelheart/calendar-feed/:feedToken', cal.getCalendarFeedIcs);
 *   app.post('/jewelheart/volunteers/:volunteerId/calendar-feed', cal.mintVolunteerCalendarFeed);
 *   app.delete('/jewelheart/volunteers/:volunteerId/calendar-feed', cal.revokeVolunteerCalendarFeed);
 *
 * Env:
 *   JEWELHEART_PUBLIC_ORIGIN — optional canonical origin for subscribe URLs (no trailing slash).
 *     Falls back to `${req.protocol}://${req.get('host')}` when omitted.
 *
 * Dependencies: Node built-ins only (`crypto`). Requires JSON + urlencoded body parsers on authenticated routes.
 */

'use strict';

const crypto = require('crypto');

/** Same mapping as scripts/generate_volunteer_calendar_ics.py */
const TIME_BAND_WINDOWS = {
  early: [
    [7, 0],
    [9, 0],
  ],
  lunchtime: [
    [11, 30],
    [13, 30],
  ],
  dinnertime: [
    [17, 0],
    [19, 0],
  ],
  anytime: [
    [12, 0],
    [13, 0],
  ],
  allday: null,
};

function escapeIcsText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldIcsContent(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  const max = 75;
  for (let line of lines) {
    let rest = line;
    while (rest.length > max) {
      out.push(rest.slice(0, max));
      rest = ` ${rest.slice(max)}`;
    }
    out.push(rest);
  }
  return `${out.join('\r\n')}\r\n`;
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatUtcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

/** Wall-clock instant in IANA tz → UTC epoch ms (Temporal when available; binary search fallback). */
function wallClockToUtcEpoch(slotDate, hour, minute, second, tz) {
  const isoTime = `${slotDate}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
  const T = globalThis.Temporal?.ZonedDateTime;
  if (T) {
    try {
      return Number(T.from(`${isoTime}[${tz}]`).epochMilliseconds);
    } catch {
      /* continue */
    }
  }
  const [y, mo, d] = slotDate.split('-').map((x) => parseInt(x, 10));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  function wallAt(ms) {
    const parts = formatter.formatToParts(new Date(ms));
    const o = {};
    for (const p of parts) {
      if (p.type !== 'literal') o[p.type] = p.value;
    }
    return {
      y: Number(o.year),
      mo: Number(o.month),
      d: Number(o.day),
      h: Number(o.hour),
      mi: Number(o.minute),
      sec: Number(o.second),
    };
  }
  function cmpWall(a, b) {
    if (a.y !== b.y) return a.y - b.y;
    if (a.mo !== b.mo) return a.mo - b.mo;
    if (a.d !== b.d) return a.d - b.d;
    if (a.h !== b.h) return a.h - b.h;
    if (a.mi !== b.mi) return a.mi - b.mi;
    return a.sec - b.sec;
  }
  const target = { y, mo, d, h: hour, mi: minute, sec: second };
  let lo = Date.UTC(y, mo - 1, d, hour, minute, second) - 48 * 3600 * 1000;
  let hi = Date.UTC(y, mo - 1, d, hour, minute, second) + 48 * 3600 * 1000;
  for (let i = 0; i < 56; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const w = wallAt(mid);
    const c = cmpWall(w, target);
    if (c === 0) return mid;
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return Date.UTC(y, mo - 1, d, hour, minute, second);
}

function formatIcsDateTimeInZone(ms, tz) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(ms));
  const o = {};
  for (const p of parts) {
    if (p.type !== 'literal') o[p.type] = p.value;
  }
  return `${o.year}${o.month}${o.day}T${o.hour}${o.minute}${o.second}`;
}

function formatIcsDateOnly(slotDate) {
  return slotDate.replace(/-/gu, '');
}

/** Job length in minutes; falls back when DB column missing. */
function effectiveDurationMinutes(row) {
  const n = parseInt(String(row.estimated_minutes ?? ''), 10);
  if (Number.isFinite(n) && n > 0) return Math.min(n, 24 * 60);
  return 30;
}

function appendStandardValarms(lines) {
  lines.push('BEGIN:VALARM');
  lines.push('ACTION:DISPLAY');
  lines.push('DESCRIPTION:Reminder (24h before)');
  lines.push('TRIGGER:-P1D');
  lines.push('END:VALARM');
  lines.push('BEGIN:VALARM');
  lines.push('ACTION:DISPLAY');
  lines.push('DESCRIPTION:Reminder (3h before)');
  lines.push('TRIGGER:-PT3H');
  lines.push('END:VALARM');
}

function buildVevent(row, dtstampUtc) {
  const uid = `assignment-${row.assignment_id}@jewelheart`;
  const tz = row.retreat_timezone;
  const summary = escapeIcsText(row.job_title || 'Volunteer shift');
  const durMin = effectiveDurationMinutes(row);
  const descBits = [
    row.retreat_name,
    row.slot_label,
    `timeBand=${row.time_band}`,
    `durationMin=${durMin}`,
    `assignmentId=${row.assignment_id}`,
  ].filter(Boolean);
  let rawDesc = descBits.join('\n');
  if (rawDesc.length > 180) rawDesc = `${rawDesc.slice(0, 177)}…`;
  const description = escapeIcsText(rawDesc);

  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstampUtc}`,
    'SEQUENCE:1',
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
  ];

  const windows = TIME_BAND_WINDOWS[row.time_band];
  const par = `;TZID=${tz}`;

  if (row.time_band === 'allday' || windows == null) {
    // Timed block on the slot day (not misleading full-day); noon anchor in retreat TZ.
    const startMs = wallClockToUtcEpoch(row.slot_date, 12, 0, 0, tz);
    const endMs = startMs + durMin * 60 * 1000;
    lines.push(`DTSTART${par}:${formatIcsDateTimeInZone(startMs, tz)}`);
    lines.push(`DTEND${par}:${formatIcsDateTimeInZone(endMs, tz)}`);
    appendStandardValarms(lines);
  } else {
    const [[sh, sm]] = windows;
    const startMs = wallClockToUtcEpoch(row.slot_date, sh, sm, 0, tz);
    const endMs = startMs + durMin * 60 * 1000;
    lines.push(`DTSTART${par}:${formatIcsDateTimeInZone(startMs, tz)}`);
    lines.push(`DTEND${par}:${formatIcsDateTimeInZone(endMs, tz)}`);
    appendStandardValarms(lines);
  }

  lines.push('END:VEVENT');
  return `${lines.join('\r\n')}\r\n`;
}

/** Apple Calendar + many clients use `X-WR-CALNAME` as the default subscription title. */
function retreatNameFromRow(r) {
  const v = r.retreat_name ?? r.retreatName;
  return String(v || '').trim();
}

/** ASCII hyphen avoids rare client issues with U+00B7 in calendar titles. */
function deriveCalendarTitle(rows) {
  if (!rows || !rows.length) return 'JewelHeart volunteer shifts';
  const names = [...new Set(rows.map(retreatNameFromRow).filter(Boolean))];
  if (names.length === 1) return `${names[0]} - Volunteer shifts`;
  return 'JewelHeart volunteer shifts';
}

/** RFC 5987 `filename*` only needs ASCII in fallback `filename`. */
function contentDispositionFilename(calTitle) {
  const ascii = String(calTitle || 'jewelheart-volunteer')
    .replace(/[^\x20-\x7E]+/gu, '-')
    .replace(/[/\\?%*:|"<>]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 80);
  const base = ascii.length ? ascii : 'jewelheart-volunteer';
  return `inline; filename="${base}.ics"`;
}

function buildCalendarDoc(rows) {
  const dtstamp = formatUtcStamp(Date.now());
  let events = '';
  for (const row of rows) {
    events += buildVevent(row, dtstamp);
  }
  const calTitle = deriveCalendarTitle(rows);
  const esc = escapeIcsText(calTitle);
  // Order matches common Apple/Google exports: CALSCALE before X-WR-CALNAME; RFC 7986 `NAME` mirrors title.
  const header =
    'BEGIN:VCALENDAR\r\n' +
    'VERSION:2.0\r\n' +
    'PRODID:-//JewelHeart//Volunteer shifts//EN\r\n' +
    'CALSCALE:GREGORIAN\r\n' +
    `X-WR-CALNAME:${esc}\r\n` +
    `NAME:${esc}\r\n` +
    'METHOD:PUBLISH\r\n';
  const footer = 'END:VCALENDAR\r\n';
  return foldIcsContent(header + events + footer);
}

function etagFromRows(rows) {
  const maxTs = rows.reduce((acc, r) => {
    const t = new Date(r.row_rev).getTime();
    return Number.isFinite(t) && t > acc ? t : acc;
  }, 0);
  const h = crypto.createHash('sha256');
  for (const r of rows) h.update(String(r.assignment_id));
  const digest = h.digest('hex').slice(0, 16);
  return `W/"jh-cal-${maxTs}-${rows.length}-${digest}"`;
}

function httpDateFromRows(rows) {
  const maxTs = rows.reduce((acc, r) => {
    const t = new Date(r.row_rev).getTime();
    return Number.isFinite(t) && t > acc ? t : acc;
  }, 0);
  if (!maxTs) return new Date().toUTCString();
  return new Date(maxTs).toUTCString();
}

function normalizeFeedToken(raw) {
  let t = String(raw || '').trim();
  if (t.toLowerCase().endsWith('.ics')) t = t.slice(0, -4);
  return t;
}

function publicOriginFromReqDefault(req) {
  const env = process.env.JEWELHEART_PUBLIC_ORIGIN;
  if (env && typeof env === 'string') return env.replace(/\/+$/u, '');
  const proto = req.protocol || 'https';
  const host = req.get ? req.get('host') : req.headers.host;
  return `${proto}://${host || 'localhost'}`;
}

const ASSIGNMENTS_SQL = `
SELECT
  a.id AS assignment_id,
  a.created_at AS assignment_created_at,
  GREATEST(t.updated_at, s.updated_at, j.updated_at, r.updated_at, v.updated_at, a.created_at) AS row_rev,
  r.timezone AS retreat_timezone,
  r.name AS retreat_name,
  j.title AS job_title,
  j.estimated_minutes AS estimated_minutes,
  s.label AS slot_label,
  s.slot_date::text AS slot_date,
  s.time_band::text AS time_band
FROM jewelheart_assignments a
JOIN jewelheart_tasks t ON t.id = a.task_id
JOIN jewelheart_jobs j ON j.id = t.job_id
JOIN jewelheart_slots s ON s.id = t.slot_id AND s.retreat_id = t.retreat_id
JOIN jewelheart_retreats r ON r.id = t.retreat_id
JOIN jewelheart_volunteers v ON v.id = a.volunteer_id
WHERE v.calendar_feed_token = $1
ORDER BY s.slot_date ASC, s.time_band::text ASC, j.title ASC`;

/**
 * @param {object} deps
 * @param {(text:string, params?:any[]) => Promise<{ rows: any[] }>} deps.query
 * @param {(id:string, label?:string) => void} deps.assertUuid
 * @param {(req:any, volunteerId:string) => Promise<void>} deps.ensureVolunteerPatchAccess
 * @param {(req:any) => string} [deps.publicOriginFromReq]
 */
function createJewelHeartCalendarHandlers(deps) {
  const { query, assertUuid, ensureVolunteerPatchAccess } = deps;
  const originFn = deps.publicOriginFromReq || publicOriginFromReqDefault;
  /** @type {{ notifyAfterCalendarFeedChanged?: (p: Record<string, unknown>) => Promise<unknown> } | null | undefined} */
  const volunteerNotify = deps.volunteerNotify || null;

  async function loadFeedRows(feedToken) {
    const { rows } = await query(ASSIGNMENTS_SQL, [feedToken]);
    return rows;
  }

  async function resolveFeedOrRespond(req, res) {
    const token = normalizeFeedToken(req.params.feedToken);
    if (!token || token.length < 24) {
      res.status(404).end();
      return null;
    }
    const { rows: volRows } = await query(
      `SELECT id FROM jewelheart_volunteers WHERE calendar_feed_token = $1`,
      [token],
    );
    if (!volRows.length) {
      res.status(404).end();
      return null;
    }
    const rows = await loadFeedRows(token);
    return rows;
  }

  async function headVolunteerCalendarFeed(req, res) {
    try {
      const rows = await resolveFeedOrRespond(req, res);
      if (!rows) return;
      const etag = etagFromRows(rows);
      const ims = req.headers['if-none-match'];
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', httpDateFromRows(rows));
      if (ims && ims === etag) {
        res.status(304).end();
        return;
      }
      const body = buildCalendarDoc(rows);
      const calTitle = deriveCalendarTitle(rows);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', contentDispositionFilename(calTitle));
      res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
      res.status(200).end();
    } catch (e) {
      res.status(500).json({ error: 'calendar_feed_head_failed', message: String(e && e.message) });
    }
  }

  async function getCalendarFeedIcs(req, res) {
    try {
      const rows = await resolveFeedOrRespond(req, res);
      if (!rows) return;
      const etag = etagFromRows(rows);
      const ims = req.headers['if-none-match'];
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', httpDateFromRows(rows));
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      if (ims && ims === etag) {
        res.status(304).end();
        return;
      }
      const calTitle = deriveCalendarTitle(rows);
      res.setHeader('Content-Disposition', contentDispositionFilename(calTitle));
      const body = buildCalendarDoc(rows);
      res.status(200).send(body);
    } catch (e) {
      res.status(500).type('text/plain').send(`calendar_feed_failed: ${e && e.message}`);
    }
  }

  async function mintVolunteerCalendarFeed(req, res) {
    try {
      const volunteerId = req.params.volunteerId;
      assertUuid(volunteerId, 'volunteerId');
      await ensureVolunteerPatchAccess(req, volunteerId);
      const regenerate = Boolean(req.body && req.body.regenerate);
      const { rows: existing } = await query(
        `SELECT calendar_feed_token FROM jewelheart_volunteers WHERE id = $1`,
        [volunteerId],
      );
      if (!existing.length) {
        res.status(404).json({ error: 'volunteer_not_found' });
        return;
      }
      const hadToken = Boolean(existing[0].calendar_feed_token);
      let token = existing[0].calendar_feed_token;
      let rotated = false;
      if (!token || regenerate) {
        token = crypto.randomBytes(32).toString('hex');
        await query(`UPDATE jewelheart_volunteers SET calendar_feed_token = $2, updated_at = now() WHERE id = $1`, [
          volunteerId,
          token,
        ]);
        rotated = true;
      }
      const origin = originFn(req);
      const path = `/jewelheart/calendar-feed/${token}`;
      const subscribeHttpsUrl = `${origin}${path}`;
      const tail = subscribeHttpsUrl.replace(/^https?:\/\//u, '');
      const webcalSubscribeUrl = `webcal://${tail}`;
      /** @type {Record<string, unknown>} */
      const payload = { subscribeHttpsUrl, webcalSubscribeUrl };
      if (rotated) payload.lastRotatedAt = new Date().toISOString();
      res.status(200).json(payload);
      if (rotated && volunteerNotify && typeof volunteerNotify.notifyAfterCalendarFeedChanged === 'function') {
        const action = hadToken ? 'rotated' : 'minted';
        void volunteerNotify.notifyAfterCalendarFeedChanged({
          volunteerId,
          action,
          subscribeHttpsUrl,
          webcalSubscribeUrl,
        });
      }
    } catch (e) {
      const code = e && e.statusCode;
      if (code) res.status(code).json({ error: String(e.message || 'forbidden') });
      else res.status(500).json({ error: 'mint_calendar_feed_failed', message: String(e && e.message) });
    }
  }

  async function revokeVolunteerCalendarFeed(req, res) {
    try {
      const volunteerId = req.params.volunteerId;
      assertUuid(volunteerId, 'volunteerId');
      await ensureVolunteerPatchAccess(req, volunteerId);
      const { rows: exists } = await query(
        `SELECT id, calendar_feed_token FROM jewelheart_volunteers WHERE id = $1`,
        [volunteerId],
      );
      if (!exists.length) {
        res.status(404).end();
        return;
      }
      const hadFeed = Boolean(exists[0].calendar_feed_token);
      await query(`UPDATE jewelheart_volunteers SET calendar_feed_token = NULL, updated_at = now() WHERE id = $1`, [
        volunteerId,
      ]);
      res.status(204).end();
      if (
        hadFeed &&
        volunteerNotify &&
        typeof volunteerNotify.notifyAfterCalendarFeedChanged === 'function'
      ) {
        void volunteerNotify.notifyAfterCalendarFeedChanged({ volunteerId, action: 'revoked' });
      }
    } catch (e) {
      const code = e && e.statusCode;
      if (code) res.status(code).json({ error: String(e.message || 'forbidden') });
      else res.status(500).json({ error: 'revoke_calendar_feed_failed', message: String(e && e.message) });
    }
  }

  return {
    headVolunteerCalendarFeed,
    getCalendarFeedIcs,
    mintVolunteerCalendarFeed,
    revokeVolunteerCalendarFeed,
    TIME_BAND_WINDOWS,
    escapeIcsText,
    foldIcsContent,
    wallClockToUtcEpoch,
    buildCalendarDoc,
    normalizeFeedToken,
  };
}

module.exports = {
  TIME_BAND_WINDOWS,
  createJewelHeartCalendarHandlers,
  escapeIcsText,
  foldIcsContent,
  wallClockToUtcEpoch,
  buildVevent,
  buildCalendarDoc,
  normalizeFeedToken,
};
