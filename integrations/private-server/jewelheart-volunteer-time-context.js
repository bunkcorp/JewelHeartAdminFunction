/**
 * Volunteer calendar context — live vs testing "today" (single resolver).
 */

import { HttpError } from './errors.js';
import { assertUuid } from './service.js';

export const JEWELHEART_DEFAULT_TIMEZONE = 'America/New_York';
export const JEWELHEART_DEFAULT_PINNED_TODAY = '2026-07-21';

const EN_DASH = ' • ';

export function isIsoDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

export function isoDateFromPg(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (isIsoDate(s)) return s;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

export function liveTodayIso(timeZone = JEWELHEART_DEFAULT_TIMEZONE) {
  const tz = timeZone || JEWELHEART_DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(new Date())
    .filter((p) => p.type !== 'literal')
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function daysBetweenIsoYmd(startIso, endIso) {
  const [sy, sm, sd] = startIso.split('-').map((x) => parseInt(x, 10));
  const [ey, em, ed] = endIso.split('-').map((x) => parseInt(x, 10));
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.floor((endMs - startMs) / 86400000);
}

export function volunteerDayNumber(retreatStartIso, todayIso) {
  if (!retreatStartIso || !isIsoDate(retreatStartIso)) return 1;
  const days = daysBetweenIsoYmd(retreatStartIso, todayIso);
  return Math.max(1, days + 1);
}

export function volunteerWeekdayShort(iso) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dt);
}

export function volunteerRetreatSpanCompact(startIso, endIso) {
  if (!startIso || !endIso) return '2026.7.20-26';
  const [sy, sm, sd] = startIso.split('-').map((x) => parseInt(x, 10));
  const [, , ed] = endIso.split('-').map((x) => parseInt(x, 10));
  return `${sy}.${sm}.${sd}-${ed}`;
}

export function buildVolunteerRetreatBannerLine(retreat, todayIso) {
  const startDate = retreat?.startDate || '2026-07-20';
  const endDate = retreat?.endDate || '2026-07-26';
  const span = volunteerRetreatSpanCompact(startDate, endDate);
  const dayNum = volunteerDayNumber(startDate, todayIso);
  const weekday = volunteerWeekdayShort(todayIso);
  return `JH Retreat${EN_DASH}${span}${EN_DASH}Day ${dayNum} ${weekday}`;
}

function envDemoFallbackSettings() {
  const demo =
    typeof process !== 'undefined' && process.env
      ? String(process.env.JEWELHEART_VOLUNTEER_HOME_DEMO ?? '1').trim()
      : '1';
  const testToday =
    typeof process !== 'undefined' && process.env && process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY
      ? String(process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY).trim()
      : '';
  const enabled = demo !== '0' && demo.toLowerCase() !== 'false';
  const pinnedToday =
    testToday && isIsoDate(testToday) ? testToday : enabled ? JEWELHEART_DEFAULT_PINNED_TODAY : null;
  return { enabled, pinnedToday, overrideStartDate: null, overrideEndDate: null };
}

function mapTestingSettingsRow(row) {
  if (!row) return envDemoFallbackSettings();
  const enabled = row.enabled === true;
  const pinnedToday = isoDateFromPg(row.pinnedToday);
  return {
    enabled,
    pinnedToday: pinnedToday || (enabled ? JEWELHEART_DEFAULT_PINNED_TODAY : null),
    overrideStartDate: isoDateFromPg(row.overrideStartDate),
    overrideEndDate: isoDateFromPg(row.overrideEndDate),
    updatedAt: row.updatedAt || null,
    updatedByFirebaseUid: row.updatedByFirebaseUid || null,
  };
}

export async function loadVolunteerTestingSettings(query) {
  try {
    const { rows } = await query(
      `SELECT enabled,
              pinned_today AS "pinnedToday",
              override_start_date AS "overrideStartDate",
              override_end_date AS "overrideEndDate",
              updated_at AS "updatedAt",
              updated_by_firebase_uid AS "updatedByFirebaseUid"
       FROM jewelheart_volunteer_testing_settings
       WHERE id = 1
       LIMIT 1`,
    );
    return mapTestingSettingsRow(rows[0]);
  } catch {
    return envDemoFallbackSettings();
  }
}

export function resolveTodayIso(testingSettings, timeZone = JEWELHEART_DEFAULT_TIMEZONE) {
  const live = liveTodayIso(timeZone);
  if (testingSettings?.enabled) {
    const pin = isoDateFromPg(testingSettings.pinnedToday);
    if (pin && isIsoDate(pin)) return pin;
    return JEWELHEART_DEFAULT_PINNED_TODAY;
  }
  return live;
}

function activeRetreatIdFromEnv() {
  const id = String(process.env.JEWELHEART_ACTIVE_RETREAT_ID || '').trim();
  if (!id) return null;
  try {
    assertUuid(id, 'JEWELHEART_ACTIVE_RETREAT_ID');
    return id;
  } catch {
    return null;
  }
}

export async function loadActiveRetreatRow(query) {
  const id = activeRetreatIdFromEnv();
  if (!id) return null;
  const { rows } = await query(
    `SELECT id,
            name,
            start_date AS "startDate",
            end_date AS "endDate"
     FROM jewelheart_retreats
     WHERE id = $1
     LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    name: rows[0].name || 'Retreat',
    startDate: isoDateFromPg(rows[0].startDate),
    endDate: isoDateFromPg(rows[0].endDate),
  };
}

function applyRetreatDateOverrides(dbRetreat, testingSettings) {
  const base = dbRetreat || {
    id: null,
    name: 'JH Summer Retreat 2026',
    startDate: '2026-07-20',
    endDate: '2026-07-26',
  };
  if (!testingSettings?.enabled) {
    return { retreat: { ...base }, retreatDateOverride: false };
  }
  const oStart = isoDateFromPg(testingSettings.overrideStartDate);
  const oEnd = isoDateFromPg(testingSettings.overrideEndDate);
  if (oStart && oEnd && isIsoDate(oStart) && isIsoDate(oEnd) && oStart <= oEnd) {
    return {
      retreat: { ...base, startDate: oStart, endDate: oEnd },
      retreatDateOverride: true,
    };
  }
  return { retreat: { ...base }, retreatDateOverride: false };
}

export async function buildVolunteerTimeContext(query, options = {}) {
  const timeZone = options.timeZone || JEWELHEART_DEFAULT_TIMEZONE;
  const testingSettings = await loadVolunteerTestingSettings(query);
  const live = liveTodayIso(timeZone);
  const todayIso = resolveTodayIso(testingSettings, timeZone);
  const dbRetreat =
    options.retreat ||
    (await loadActiveRetreatRow(query)) ||
    {
      id: null,
      name: 'JH Summer Retreat 2026',
      startDate: '2026-07-20',
      endDate: '2026-07-26',
    };
  const { retreat, retreatDateOverride } = applyRetreatDateOverrides(dbRetreat, testingSettings);
  const retreatBannerLine = buildVolunteerRetreatBannerLine(retreat, todayIso);
  const testingEnabled = testingSettings.enabled === true;
  const parts = [];
  if (testingEnabled) parts.push(`today pinned to ${todayIso}`);
  if (retreatDateOverride) {
    parts.push(`retreat ${retreat.startDate} … ${retreat.endDate}`);
  }
  return {
    testingEnabled,
    todayIso,
    liveTodayIso: live,
    pinnedTodayIso: testingEnabled ? todayIso : null,
    retreatDateOverride,
    dbRetreatStart: dbRetreat.startDate || null,
    dbRetreatEnd: dbRetreat.endDate || null,
    retreat,
    retreatBannerLine,
    testingNote: testingEnabled
      ? `Testing mode — ${parts.join('; ')} (live calendar: ${live})`
      : null,
    testingSettings,
  };
}

function validateTestingSaveBody(body, enabled) {
  const pinnedToday = isoDateFromPg(body?.pinnedToday);
  const overrideStartDate = isoDateFromPg(body?.overrideStartDate);
  const overrideEndDate = isoDateFromPg(body?.overrideEndDate);
  if (enabled) {
    if (!pinnedToday || !isIsoDate(pinnedToday)) {
      throw new HttpError(400, 'Enter a valid pinned today date.');
    }
    if (!overrideStartDate || !overrideEndDate) {
      throw new HttpError(400, 'Enter both retreat start and end dates.');
    }
    if (overrideStartDate > overrideEndDate) {
      throw new HttpError(400, 'Retreat start must be on or before end.');
    }
  }
  return { pinnedToday, overrideStartDate, overrideEndDate };
}

export async function saveVolunteerTestingSettings(query, body, firebaseUid) {
  const enabled = body?.enabled === true;
  const current = await loadVolunteerTestingSettings(query);
  let pinnedToday = isoDateFromPg(body?.pinnedToday);
  let overrideStartDate = isoDateFromPg(body?.overrideStartDate);
  let overrideEndDate = isoDateFromPg(body?.overrideEndDate);

  if (enabled) {
    const validated = validateTestingSaveBody(body, true);
    pinnedToday = validated.pinnedToday;
    overrideStartDate = validated.overrideStartDate;
    overrideEndDate = validated.overrideEndDate;
  } else {
    if (!pinnedToday) pinnedToday = isoDateFromPg(current.pinnedToday) || JEWELHEART_DEFAULT_PINNED_TODAY;
    if (!overrideStartDate) overrideStartDate = isoDateFromPg(current.overrideStartDate);
    if (!overrideEndDate) overrideEndDate = isoDateFromPg(current.overrideEndDate);
  }

  const uid = String(firebaseUid || '').trim() || null;
  const { rows } = await query(
    `INSERT INTO jewelheart_volunteer_testing_settings
       (id, enabled, pinned_today, override_start_date, override_end_date, updated_by_firebase_uid)
     VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
       SET enabled = EXCLUDED.enabled,
           pinned_today = EXCLUDED.pinned_today,
           override_start_date = EXCLUDED.override_start_date,
           override_end_date = EXCLUDED.override_end_date,
           updated_by_firebase_uid = EXCLUDED.updated_by_firebase_uid,
           updated_at = now()
     RETURNING enabled,
               pinned_today AS "pinnedToday",
               override_start_date AS "overrideStartDate",
               override_end_date AS "overrideEndDate",
               updated_at AS "updatedAt",
               updated_by_firebase_uid AS "updatedByFirebaseUid"`,
    [enabled, pinnedToday, overrideStartDate, overrideEndDate, uid],
  );
  const saved = mapTestingSettingsRow(rows[0] || {
    enabled,
    pinnedToday,
    overrideStartDate,
    overrideEndDate,
  });
  const timeCtx = await buildVolunteerTimeContext(query);
  return {
    ok: true,
    settings: saved,
    timeContext: {
      testingEnabled: timeCtx.testingEnabled,
      todayIso: timeCtx.todayIso,
      liveTodayIso: timeCtx.liveTodayIso,
      pinnedTodayIso: timeCtx.pinnedTodayIso,
      retreatDateOverride: timeCtx.retreatDateOverride,
      retreatBannerLine: timeCtx.retreatBannerLine,
      testingNote: timeCtx.testingNote,
      retreat: {
        startDate: timeCtx.retreat?.startDate || null,
        endDate: timeCtx.retreat?.endDate || null,
      },
      dbRetreat: {
        startDate: timeCtx.dbRetreatStart,
        endDate: timeCtx.dbRetreatEnd,
      },
    },
  };
}

async function assertManagerOrAdmin(query, firebaseUid) {
  const uid = String(firebaseUid || '').trim();
  if (!uid) throw new HttpError(401, 'Sign in required');
  const admin = await query('SELECT 1 FROM jewelheart_admins WHERE firebase_uid = $1 LIMIT 1', [uid]);
  if (admin.rows[0]) return;
  const mgr = await query('SELECT 1 FROM jewelheart_managers WHERE firebase_uid = $1 LIMIT 1', [uid]);
  if (mgr.rows[0]) return;
  throw new HttpError(403, 'Manager access required.');
}

function settingsJson(settings, timeCtx) {
  return {
    settings: {
      enabled: settings.enabled === true,
      pinnedToday: isoDateFromPg(settings.pinnedToday),
      overrideStartDate: isoDateFromPg(settings.overrideStartDate),
      overrideEndDate: isoDateFromPg(settings.overrideEndDate),
    },
    timeContext: {
      testingEnabled: timeCtx.testingEnabled,
      todayIso: timeCtx.todayIso,
      liveTodayIso: timeCtx.liveTodayIso,
      pinnedTodayIso: timeCtx.pinnedTodayIso,
      retreatDateOverride: timeCtx.retreatDateOverride,
      retreatBannerLine: timeCtx.retreatBannerLine,
      testingNote: timeCtx.testingNote,
      retreat: {
        startDate: timeCtx.retreat?.startDate || null,
        endDate: timeCtx.retreat?.endDate || null,
      },
      dbRetreat: {
        startDate: timeCtx.dbRetreatStart,
        endDate: timeCtx.dbRetreatEnd,
      },
    },
  };
}

export function createJewelHeartVolunteerTestingHandlers({ query }) {
  return {
    async getTimeContext(_req, res) {
      try {
        const timeCtx = await buildVolunteerTimeContext(query);
        res.status(200).json({
          ok: true,
          testingEnabled: timeCtx.testingEnabled,
          todayIso: timeCtx.todayIso,
          liveTodayIso: timeCtx.liveTodayIso,
          pinnedTodayIso: timeCtx.pinnedTodayIso,
          retreatDateOverride: timeCtx.retreatDateOverride,
          retreatBannerLine: timeCtx.retreatBannerLine,
          testingNote: timeCtx.testingNote,
          retreat: {
            startDate: timeCtx.retreat?.startDate || null,
            endDate: timeCtx.retreat?.endDate || null,
          },
        });
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('volunteer time-context', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },

    async getSettings(req, res) {
      try {
        await assertManagerOrAdmin(query, req.uid);
        const settings = await loadVolunteerTestingSettings(query);
        const timeCtx = await buildVolunteerTimeContext(query);
        res.status(200).json({ ok: true, ...settingsJson(settings, timeCtx) });
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('volunteer testing get', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },

    async putSettings(req, res) {
      try {
        await assertManagerOrAdmin(query, req.uid);
        const out = await saveVolunteerTestingSettings(query, req.body || {}, req.uid);
        res.status(200).json(out);
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('volunteer testing put', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },
  };
}
