/**
 * Volunteer SDUI home for jewelheart.home (KarmaDots sduiScreens.js).
 * Canonical copy in JewelHeartAdminFunction; apply script copies beside sduiScreens.js.
 */

import { query } from '../db.js';
import { listRetreats, getScheduleByDay } from './service.js';

const jewelheartDefaultTimeZoneId = 'America/New_York';
const volunteerHomeGold = '#FFCA10';
const volunteerHomeSummaryBlue = '#7A95CA';

function volunteerHomeEffectiveTodayIso(timeZone) {
  const test =
    typeof process !== 'undefined' && process.env && process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY
      ? String(process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY).trim()
      : '';
  if (test && isIsoDate(test)) return test;
  return todayYmdInTimeZone(timeZone);
}

function isIsoDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function todayYmdInTimeZone(timeZone) {
  const tz = timeZone || jewelheartDefaultTimeZoneId;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
    .filter((p) => p.type !== 'literal')
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysIsoYmd(ymd, delta) {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mo}-${da}`;
}

function daysBetweenIsoYmd(start, end) {
  const [sy, sm, sd] = start.split('-').map((x) => parseInt(x, 10));
  const [ey, em, ed] = end.split('-').map((x) => parseInt(x, 10));
  const s = Date.UTC(sy, sm - 1, sd, 12, 0, 0);
  const e = Date.UTC(ey, em - 1, ed, 12, 0, 0);
  return Math.round((e - s) / 86400000);
}

function volunteerHomeWeekdayShort(iso) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(dt);
}

function volunteerHomeRetreatShortName(name) {
  return String(name || '')
    .replace(/\s+Retreat$/i, '')
    .trim();
}

function volunteerHomeDateInRetreat(iso, retreat) {
  const start = retreat.startDate;
  const end = retreat.endDate;
  if (!start || !end) return false;
  return iso >= start && iso <= end;
}

function volunteerHomePickRetreat(retreats, todayIso) {
  const inRange = (retreats || []).find((r) => volunteerHomeDateInRetreat(todayIso, r));
  return inRange || (retreats && retreats[0]) || null;
}

function volunteerHomeDayNumber(retreat, todayIso) {
  if (!retreat.startDate || !isIsoDate(retreat.startDate)) return 1;
  const days = daysBetweenIsoYmd(retreat.startDate, todayIso);
  return Math.max(1, days + 1);
}

function volunteerHomeRetreatDates(retreat) {
  const start = retreat.startDate;
  const end = retreat.endDate;
  if (!start || !end || !isIsoDate(start) || !isIsoDate(end)) return [];
  const dates = [];
  let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = addDaysIsoYmd(cur, 1);
  }
  return dates;
}

function volunteerHomeJobLine(item) {
  const raw = (item.task && item.task.jobTitle) || (item.job && item.job.title) || '';
  const title = String(raw).replace(/—/g, ' - ').replace(/–/g, ' - ');
  const slot = (item.task && item.task.slotLabel) || (item.slot && item.slot.label) || '';
  return slot ? `${title} - ${slot}` : title;
}

function volunteerHomeBar(content, backgroundColor, textColor) {
  return {
    type: 'text',
    content,
    textStyle: {
      fontSize: 17,
      fontWeight: 'bold',
      textAlign: 'center',
      color: textColor,
    },
    style: {
      backgroundColor,
      padding: { top: 10, bottom: 10, left: 8, right: 8 },
    },
  };
}

async function resolveVolunteerIdForHome(firebaseUid, retreatId) {
  const byUid = await query(
    `SELECT id, display_name AS "displayName"
     FROM jewelheart_volunteers
     WHERE firebase_uid = $1
     LIMIT 1`,
    [firebaseUid],
  );
  if (byUid.rows[0]) return byUid.rows[0];
  if (retreatId) {
    const linked = await query(
      `SELECT v.id, v.display_name AS "displayName"
       FROM jewelheart_retreat_volunteers rv
       JOIN jewelheart_volunteers v ON v.id = rv.volunteer_id
       WHERE rv.retreat_id = $1
       ORDER BY rv.linked_at NULLS LAST, v.display_name
       LIMIT 1`,
      [retreatId],
    );
    if (linked.rows[0]) return linked.rows[0];
  }
  return null;
}

function volunteerHomeDemoLines(todayIso) {
  const weekday = volunteerHomeWeekdayShort(todayIso);
  return {
    retreatDayLine: `JH Summer 2026 - Day 2, ${weekday}`,
    summaryLine: 'David Lewis - 2 shifts - 1 today:',
    todayJobLines: ['Kitchen Full Clean - End of Day'],
  };
}

/** @returns screen object for buildSduiResponse wrap() (no schemaVersion envelope) */
export async function buildJewelheartHomeScreen(firebaseUid, authToken = undefined) {
  const tz = jewelheartDefaultTimeZoneId;
  const todayIso = volunteerHomeEffectiveTodayIso(tz);
  let retreatDayLine = '';
  let summaryLine = '';
  let todayJobLines = [];
  let usingDemo = false;
  let errorNote = null;

  try {
    const { items: retreats } = await listRetreats(firebaseUid, authToken);
    const retreat = volunteerHomePickRetreat(retreats, todayIso);
    if (!retreat) {
      usingDemo = true;
      errorNote = 'No retreat found.';
    } else {
      const dayNum = volunteerHomeDayNumber(retreat, todayIso);
      const weekday = volunteerHomeWeekdayShort(todayIso);
      retreatDayLine = `${volunteerHomeRetreatShortName(retreat.name)} - Day ${dayNum}, ${weekday}`;

      const volunteerRow = await resolveVolunteerIdForHome(firebaseUid, retreat.id);
      const volunteerId = volunteerRow && volunteerRow.id;
      if (!volunteerId) {
        usingDemo = true;
      } else {
        const dates = volunteerHomeRetreatDates(retreat);
        const mine = [];
        for (const iso of dates) {
          const day = await getScheduleByDay(firebaseUid, retreat.id, iso, authToken);
          for (const item of day?.items || []) {
            const assigns = item.assignments || [];
            if (!assigns.some((a) => a.volunteerId === volunteerId)) continue;
            mine.push({ date: iso, label: volunteerHomeJobLine(item) });
          }
        }
        if (!mine.length) {
          usingDemo = true;
        } else {
          const name =
            (volunteerRow.displayName && String(volunteerRow.displayName).trim()) || 'Volunteer';
          const todayCount = mine.filter((m) => m.date === todayIso).length;
          const shiftWord = mine.length === 1 ? 'shift' : 'shifts';
          summaryLine = `${name} - ${mine.length} ${shiftWord} - ${todayCount} today:`;
          todayJobLines = mine.filter((m) => m.date === todayIso).map((m) => m.label);
        }
      }
    }
  } catch (err) {
    usingDemo = true;
    errorNote = err && err.message ? err.message : String(err);
  }

  if (usingDemo) {
    const demo = volunteerHomeDemoLines(todayIso);
    retreatDayLine = demo.retreatDayLine;
    summaryLine = demo.summaryLine;
    todayJobLines = demo.todayJobLines;
  }

  const children = [
    volunteerHomeBar(retreatDayLine, volunteerHomeGold, '#000000'),
    volunteerHomeBar('Volunteer Home', volunteerHomeGold, '#000000'),
    volunteerHomeBar(summaryLine, volunteerHomeSummaryBlue, '#FFFFFF'),
    ...todayJobLines.map((line) => volunteerHomeBar(line, volunteerHomeSummaryBlue, '#FFFFFF')),
  ];
  if (errorNote) {
    children.push({
      type: 'text',
      content: errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }
  if (usingDemo) {
    children.push({
      type: 'text',
      content:
        'Demo schedule (set Volunteer profile under Volunteer tab, or link firebase_uid on volunteer row, for live data).',
      textStyle: { fontSize: 11, textAlign: 'center', color: '#666666' },
    });
  }

  return {
    id: 'jewelheart.home',
    title: 'JewelHeart',
    metadata: { app: 'jewelheart' },
    components: [
      {
        type: 'container',
        layout: 'column',
        spacing: 0,
        style: { padding: { all: 12 } },
        children,
      },
    ],
  };
}
