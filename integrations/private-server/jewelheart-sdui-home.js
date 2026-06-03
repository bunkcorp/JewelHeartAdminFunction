/**
 * Volunteer SDUI home + search (jewelheart.home, jewelheart.volunteer.search).
 * Canonical copy in JewelHeartAdminFunction; apply script copies beside sduiScreens.js.
 */

import { query } from '../db.js';
import { listRetreats, getScheduleByDay, listJobs } from './service.js';

const jewelheartDefaultTimeZoneId = 'America/New_York';
const volunteerHomeGold = '#FFCA10';
const volunteerHomeSummaryBlue = '#7A95CA';
/** Mockups.docx — Maroon (action buttons). */
const volunteerHomeMaroon = '#92160E';
const volunteerHomeLightMaroon = '#C68581';

/**
 * Minimal volunteer phone target (mockups): 360dp wide, 12dp outer + 8dp bar padding → ~320dp text.
 * At 17sp bold, ~30 characters fit on one line without wrapping.
 */
const VOLUNTEER_HOME_MIN_WIDTH_DP = 360;
/** ~35–36 chars at 17sp bold on 360dp (mockups). */
const VOLUNTEER_HOME_MAX_BAR_CHARS = 38;
const VOLUNTEER_HOME_MAX_HINT_CHARS = 38;
const VOLUNTEER_HOME_BAR_FONT_SP = 17;
const VOLUNTEER_HOME_BAR_V_PAD = 10;
const VOLUNTEER_HOME_ACTION_SECTION_SPACER = 28;

function volunteerHomeLayoutWarn(warnings, code, original) {
  const msg = `${code}: "${original}" (${original.length} chars)`;
  warnings.push(msg);
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[jewelheart.home layout] ${msg} — max ${VOLUNTEER_HOME_MAX_BAR_CHARS} on ${VOLUNTEER_HOME_MIN_WIDTH_DP}dp`);
  }
}

function volunteerHomeCompactJobPhrase(text) {
  return String(text || '')
    .replace(/\s-\sEnd of Day$/i, ' · EOD')
    .replace(/\s-\send of lunch break$/i, ' · lunch')
    .replace(/\s-\send of day$/i, ' · EOD')
    .replace(/\s-\s/g, ' · ');
}

function volunteerHomeFitLine(text, maxChars, warnings, code) {
  let s = volunteerHomeCompactJobPhrase(String(text || '').trim());
  if (s.length <= maxChars) return s;
  volunteerHomeLayoutWarn(warnings, code, s);
  return `${s.slice(0, maxChars - 1)}…`;
}

function volunteerHomeShortPersonName(name) {
  const parts = String(name || 'Volunteer').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}. ${parts[parts.length - 1]}`;
  return parts[0] || 'Volunteer';
}

function volunteerHomeFitRetreatTitle(name, warnings) {
  let s = volunteerHomeRetreatShortName(name);
  s = s.replace(/\b(20(\d{2}))\b/g, "'$2");
  s = s.replace(/\s+/g, ' ').trim();
  return volunteerHomeFitLine(s, VOLUNTEER_HOME_MAX_BAR_CHARS, warnings, 'retreat_title');
}

function volunteerHomeFitSummary(name, shiftCount, todayCount, warnings) {
  const shiftWord = shiftCount === 1 ? 'shift' : 'shifts';
  let line = `${name} - ${shiftCount} ${shiftWord} - ${todayCount} today:`;
  if (line.length > VOLUNTEER_HOME_MAX_BAR_CHARS) {
    line = `${volunteerHomeShortPersonName(name)} - ${shiftCount} ${shiftWord} - ${todayCount} today:`;
  }
  return volunteerHomeFitLine(line, VOLUNTEER_HOME_MAX_BAR_CHARS, warnings, 'summary');
}

function volunteerHomeLayoutWarningComponents(warnings) {
  if (!warnings?.length) return [];
  const n = warnings.length;
  return [
    {
      type: 'text',
      content: `⚠ ${n} line${n === 1 ? '' : 's'} shortened (${VOLUNTEER_HOME_MIN_WIDTH_DP}dp min)`,
      textStyle: { fontSize: 11, fontWeight: 'bold', textAlign: 'center', color: '#996600' },
      style: { padding: { top: 8, bottom: 4, left: 8, right: 8 } },
    },
  ];
}

function volunteerHomeEffectiveTodayIso(timeZone) {
  const test =
    typeof process !== 'undefined' && process.env && process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY
      ? String(process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY).trim()
      : '';
  if (test && isIsoDate(test)) return test;
  return todayYmdInTimeZone(timeZone);
}

/** When set (e.g. 2026-07-21 = retreat day 2), home uses demo shift lines for QA. */
function volunteerHomeForceDemoAssignments() {
  const test =
    typeof process !== 'undefined' && process.env && process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY
      ? String(process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY).trim()
      : '';
  return Boolean(test && isIsoDate(test));
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

function volunteerHomeMonthDayLong(iso) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(dt);
}

function volunteerHomeFormatJulDay(iso) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(dt);
  return `${month} ${d}`;
}

function volunteerHomeFormatJulDateRange(startIso, endIso) {
  if (!startIso || !endIso) return 'Jul 20-26';
  const start = volunteerHomeFormatJulDay(startIso);
  const end = volunteerHomeFormatJulDay(endIso);
  const [startMonth, startDay] = start.split(' ');
  const [endMonth, endDay] = end.split(' ');
  if (startMonth === endMonth) return `${startMonth} ${startDay}-${endDay}`;
  return `${start}-${end}`;
}

function volunteerHomeRetreatBannerName(name) {
  let s = String(name || 'JH Summer Retreat 2026')
    .replace(/\bJewel\s*Heart\b/gi, 'JH')
    .trim();
  if (!/\bRetreat\b/i.test(s) && /\b20\d{2}\b/.test(s)) s = `${s} Retreat`;
  return s.replace(/\s+/g, ' ').trim();
}

function volunteerHomeRetreatBannerLine(retreat) {
  const title = volunteerHomeRetreatBannerName(retreat?.name || 'JH Summer Retreat 2026');
  const range = volunteerHomeFormatJulDateRange(retreat?.startDate, retreat?.endDate);
  return `${title} - ${range}`;
}

function volunteerHomeVolunteerHomeLine(dayNum, todayIso) {
  const weekday = volunteerHomeWeekdayShort(todayIso);
  const monthDay = volunteerHomeMonthDayLong(todayIso);
  return `Volunteer Home - Day ${dayNum}, ${weekday} ${monthDay}`;
}

function volunteerHomeShiftsSummaryLine(shiftCount, todayCount) {
  const shiftWord = shiftCount === 1 ? 'shift' : 'shifts';
  if (!todayCount) return `${shiftCount} ${shiftWord}, none today`;
  const todayWord = todayCount === 1 ? '1 today' : `${todayCount} today`;
  return `${shiftCount} ${shiftWord}, ${todayWord} (tap to check in):`;
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

function volunteerHomeSearchableDates(retreat, todayIso) {
  const dates = volunteerHomeRetreatDates(retreat);
  return dates.filter((iso) => iso >= todayIso);
}

function volunteerHomeJobLine(item) {
  const raw = (item.task && item.task.jobTitle) || (item.job && item.job.title) || '';
  const title = String(raw).replace(/—/g, ' - ').replace(/–/g, ' - ');
  const slot = (item.task && item.task.slotLabel) || (item.slot && item.slot.label) || '';
  return slot ? `${title} - ${slot}` : title;
}

function parseCsvParam(value) {
  if (value == null || !String(value).trim()) return new Set();
  return new Set(
    String(value)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );
}

function toggleCsvValue(currentCsv, token) {
  const set = parseCsvParam(currentCsv);
  if (set.has(token)) set.delete(token);
  else set.add(token);
  return [...set].sort().join(',');
}

function volunteerHomeBar(content, backgroundColor, textColor, action = undefined) {
  const node = {
    type: 'text',
    content,
    textStyle: {
      fontSize: VOLUNTEER_HOME_BAR_FONT_SP,
      fontWeight: 'bold',
      textAlign: 'center',
      color: textColor,
    },
    style: {
      backgroundColor,
      padding: {
        top: VOLUNTEER_HOME_BAR_V_PAD,
        bottom: VOLUNTEER_HOME_BAR_V_PAD,
        left: 8,
        right: 8,
      },
    },
  };
  if (action) node.action = action;
  return node;
}

function volunteerHomeSpacer(height = 12) {
  return { type: 'spacer', style: { height: { value: height } } };
}

function volunteerHomePlainLabel(content) {
  return {
    type: 'text',
    content,
    textStyle: {
      fontSize: 19,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    style: { padding: { top: 4, bottom: 8, left: 8, right: 8 } },
  };
}

function volunteerHomeBodyText(content, warnings, code = 'hint') {
  const fitted = volunteerHomeFitLine(content, VOLUNTEER_HOME_MAX_HINT_CHARS, warnings, code);
  return {
    type: 'text',
    content: fitted,
    textStyle: { fontSize: 14, textAlign: 'center' },
    style: { padding: { top: 8, bottom: 8, left: 8, right: 8 } },
  };
}

/** Centered maroon pill (type button — not edge-to-edge). */
function volunteerHomeActionButton(label, target, payload = {}) {
  return {
    type: 'button',
    content: label,
    label,
    action: { type: 'navigate', target, payload },
    textStyle: {
      fontSize: VOLUNTEER_HOME_BAR_FONT_SP,
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#FFFFFF',
    },
    style: {
      backgroundColor: volunteerHomeMaroon,
      padding: {
        top: VOLUNTEER_HOME_BAR_V_PAD,
        bottom: VOLUNTEER_HOME_BAR_V_PAD,
        left: 24,
        right: 24,
      },
    },
  };
}

function volunteerHomeCenteredAction(label, target, payload = {}) {
  return {
    type: 'container',
    layout: 'column',
    spacing: 0,
    textStyle: { textAlign: 'center' },
    style: { padding: { top: 6, bottom: 6, left: 16, right: 16 } },
    children: [volunteerHomeActionButton(label, target, payload)],
  };
}

/** Tappable full-width maroon bar — same 17sp / vertical size as blue/gold header lines. */
function volunteerHomeMaroonButton(label, target, payload = {}) {
  return {
    type: 'text',
    content: label,
    action: { type: 'navigate', target, payload },
    textStyle: {
      fontSize: VOLUNTEER_HOME_BAR_FONT_SP,
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#FFFFFF',
    },
    style: {
      backgroundColor: volunteerHomeMaroon,
      padding: {
        top: VOLUNTEER_HOME_BAR_V_PAD,
        bottom: VOLUNTEER_HOME_BAR_V_PAD,
        left: 8,
        right: 8,
      },
    },
  };
}

function volunteerHomeShiftsSummaryBar(ctx, checkInPayload) {
  const hasToday = ctx.todayCount > 0;
  const bg = hasToday ? volunteerHomeGold : volunteerHomeSummaryBlue;
  const fg = hasToday ? '#000000' : '#FFFFFF';
  const action = hasToday
    ? { type: 'navigate', target: 'jewelheart.volunteer.checkin', payload: checkInPayload }
    : undefined;
  return volunteerHomeBar(ctx.shiftsSummaryLine, bg, fg, action);
}

/** Mockup “I want to…” actions — centered maroon pills (not full-width bars). */
function volunteerHomeIWantToButtons(ctx, searchPayload, checkInPayload) {
  const buttons = [
    volunteerHomeCenteredAction(
      ctx.shiftCount === 0 ? 'Sign up for shifts' : 'Sign up for more shifts',
      'jewelheart.volunteer.search',
      searchPayload,
    ),
  ];
  if (ctx.shiftCount > 0) {
    buttons.push(
      volunteerHomeCenteredAction(
        'Review / edit my assigned shifts',
        'jewelheart.volunteer.mine',
        searchPayload,
      ),
    );
  }
  if (ctx.todayCount > 0) {
    const checkInLabel =
      ctx.todayCount === 1 ? 'Check in for my shift today' : 'Check in for a shift today';
    buttons.push(
      volunteerHomeCenteredAction(checkInLabel, 'jewelheart.volunteer.checkin', checkInPayload),
    );
  }
  return buttons;
}

function volunteerHomeToggleButton(label, selected, target, payload) {
  return {
    type: 'text',
    content: label,
    action: { type: 'navigate', target, payload },
    textStyle: {
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#FFFFFF',
    },
    style: {
      backgroundColor: selected ? volunteerHomeMaroon : volunteerHomeLightMaroon,
      padding: { top: 8, bottom: 8, left: 10, right: 10 },
    },
  };
}

/** Three blue header bars shared by home and volunteer sub-screens. */
function volunteerHomeBlueHeaderChildren(ctx) {
  const warnings = ctx.layoutWarnings;
  const retreatLine = volunteerHomeFitLine(
    ctx.retreatBannerLine,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    warnings,
    'retreat_banner',
  );
  const homeLine = volunteerHomeFitLine(
    ctx.volunteerHomeLine,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    warnings,
    'volunteer_home_line',
  );
  const announceLine = volunteerHomeFitLine(
    'Tap for announcements and messages',
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    warnings,
    'announcements',
  );
  const basePayload = ctx.retreatId ? { retreatId: ctx.retreatId } : {};
  return [
    volunteerHomeBar(retreatLine, volunteerHomeSummaryBlue, '#FFFFFF'),
    volunteerHomeSpacer(6),
    volunteerHomeBar(homeLine, volunteerHomeSummaryBlue, '#FFFFFF'),
    volunteerHomeSpacer(6),
    volunteerHomeBar(announceLine, volunteerHomeSummaryBlue, '#FFFFFF', {
      type: 'navigate',
      target: 'jewelheart.volunteer.messages',
      payload: basePayload,
    }),
    volunteerHomeSpacer(12),
  ];
}

function volunteerHomeGoldPageTitleBar(pageTitle, warnings) {
  const fitted = volunteerHomeFitLine(pageTitle, VOLUNTEER_HOME_MAX_BAR_CHARS, warnings, 'page_title');
  return [volunteerHomeBar(fitted, volunteerHomeGold, '#000000'), volunteerHomeSpacer(16)];
}

function volunteerHomeScreenEnvelope(id, title, children, layoutWarnings = []) {
  return {
    id,
    title: 'JewelHeart',
    metadata: { app: 'jewelheart', layoutWarnings, minWidthDp: VOLUNTEER_HOME_MIN_WIDTH_DP },
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

function volunteerHomeDemoContext(todayIso, retreat) {
  const demoRetreat = retreat || {
    name: 'JH Summer Retreat 2026',
    startDate: '2026-07-20',
    endDate: '2026-07-26',
  };
  const dayNum = volunteerHomeDayNumber(demoRetreat, todayIso);
  return {
    shiftCount: 4,
    todayCount: 2,
    retreatBannerLine: volunteerHomeRetreatBannerLine(demoRetreat),
    volunteerHomeLine: volunteerHomeVolunteerHomeLine(dayNum, todayIso),
    todayShifts: [
      { taskId: 'demo-kitchen-full', label: 'Kitchen full clean - End of day' },
      { taskId: 'demo-urinals', label: 'Urinals - End of day' },
    ],
  };
}

/** Shared header data for home and volunteer search screens. */
export async function gatherVolunteerHomeContext(firebaseUid, authToken = undefined) {
  const tz = jewelheartDefaultTimeZoneId;
  const todayIso = volunteerHomeEffectiveTodayIso(tz);
  let retreat = null;
  let shiftCount = 0;
  let todayCount = 0;
  let rawTodayShifts = [];
  let usingDemo = false;
  let errorNote = null;
  let searchableDayIsos = [];
  let jobs = [];

  try {
    const { items: retreats } = await listRetreats(firebaseUid, authToken);
    retreat = volunteerHomePickRetreat(retreats, todayIso);
    if (!retreat) {
      usingDemo = true;
      errorNote = 'No retreat found.';
    } else {
      searchableDayIsos = volunteerHomeSearchableDates(retreat, todayIso);

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
            const taskId = item.task && item.task.id;
            mine.push({
              date: iso,
              taskId: taskId ? String(taskId) : '',
              label: volunteerHomeJobLine(item),
            });
          }
        }
        if (!mine.length) {
          usingDemo = true;
        } else {
          shiftCount = mine.length;
          const todayMine = mine.filter((m) => m.date === todayIso);
          todayCount = todayMine.length;
          rawTodayShifts = todayMine;
        }
        try {
          const jobRes = await listJobs(firebaseUid, retreat.id, authToken);
          jobs = (jobRes?.items || []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));
        } catch {
          jobs = [];
        }
      }
    }
  } catch (err) {
    usingDemo = true;
    errorNote = err && err.message ? err.message : String(err);
  }

  if (usingDemo) {
    const demo = volunteerHomeDemoContext(todayIso, retreat);
    shiftCount = demo.shiftCount;
    todayCount = demo.todayCount;
    rawTodayShifts = demo.todayShifts;
    searchableDayIsos = [todayIso, addDaysIsoYmd(todayIso, 1), addDaysIsoYmd(todayIso, 2)];
    jobs = [
      { id: 'demo-caf-light', title: 'Cafe light clean - end of lunch break' },
      { id: 'demo-kitchen-light', title: 'Kitchen light clean - end of lunch break' },
      { id: 'demo-caf-full', title: 'Cafe full clean - end of day' },
      { id: 'demo-kitchen-full', title: 'Kitchen full clean - end of day' },
    ];
  }

  if (volunteerHomeForceDemoAssignments()) {
    const demo = volunteerHomeDemoContext(todayIso, retreat);
    shiftCount = demo.shiftCount;
    todayCount = demo.todayCount;
    rawTodayShifts = demo.todayShifts;
    usingDemo = true;
  }

  const layoutWarnings = [];
  const dayNum = retreat ? volunteerHomeDayNumber(retreat, todayIso) : volunteerHomeDayNumber(
    { startDate: '2026-07-20' },
    todayIso,
  );
  const retreatBannerLine = volunteerHomeFitLine(
    volunteerHomeRetreatBannerLine(retreat || { name: 'JH Summer Retreat 2026', startDate: '2026-07-20', endDate: '2026-07-26' }),
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    layoutWarnings,
    'retreat_banner',
  );
  const volunteerHomeLine = volunteerHomeFitLine(
    volunteerHomeVolunteerHomeLine(dayNum, todayIso),
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    layoutWarnings,
    'volunteer_home_line',
  );
  const shiftsSummaryLine = volunteerHomeFitLine(
    volunteerHomeShiftsSummaryLine(shiftCount, todayCount),
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    layoutWarnings,
    'shifts_summary',
  );
  const todayShifts = rawTodayShifts.map((row, index) => ({
    taskId: row.taskId,
    label: volunteerHomeFitLine(row.label, VOLUNTEER_HOME_MAX_BAR_CHARS, layoutWarnings, `today_shift_${index}`),
  }));

  return {
    todayIso,
    retreat,
    retreatId: retreat?.id || null,
    retreatBannerLine,
    volunteerHomeLine,
    shiftsSummaryLine,
    shiftCount,
    todayCount,
    todayShifts,
    searchableDayIsos,
    jobs,
    usingDemo,
    errorNote,
    layoutWarnings,
  };
}

/** @returns screen object for buildSduiResponse wrap() */
export async function buildJewelheartHomeScreen(firebaseUid, authToken = undefined) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);

  const searchPayload = ctx.retreatId ? { retreatId: ctx.retreatId } : {};
  const checkInPayload = { ...searchPayload };

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx),
    volunteerHomeShiftsSummaryBar(ctx, checkInPayload),
    ...ctx.todayShifts.map((row) => {
      const payload = { ...checkInPayload };
      if (row.taskId) payload.taskId = row.taskId;
      return volunteerHomeMaroonButton(row.label, 'jewelheart.volunteer.checkin', payload);
    }),
    volunteerHomeSpacer(VOLUNTEER_HOME_ACTION_SECTION_SPACER),
    ...volunteerHomeIWantToButtons(ctx, searchPayload, checkInPayload),
  ];

  if (ctx.errorNote) {
    children.push({
      type: 'text',
      content: ctx.errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }
  if (ctx.usingDemo) {
    children.push({
      type: 'text',
      content: 'Demo schedule — link volunteer for live data.',
      textStyle: { fontSize: 11, textAlign: 'center', color: '#666666' },
    });
  }
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));

  return volunteerHomeScreenEnvelope('jewelheart.home', 'JewelHeart', children, ctx.layoutWarnings);
}

/**
 * Search for available shifts (mockup search screen).
 * @param {object} params - selectedDays, selectedJobs (comma-separated), retreatId
 */
export async function buildJewelheartVolunteerSearchScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  const retreatId = params.retreatId || ctx.retreatId || '';
  const selectedDays = parseCsvParam(params.selectedDays);
  const selectedJobs = parseCsvParam(params.selectedJobs);

  const basePayload = retreatId ? { retreatId } : {};
  const searchTarget = 'jewelheart.volunteer.search';

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx),
    ...volunteerHomeGoldPageTitleBar('Search available shifts', ctx.layoutWarnings),
    volunteerHomeMaroonButton('← Volunteer Home', 'jewelheart.home', basePayload),
    volunteerHomeBodyText('Tap days (skip = all days)', ctx.layoutWarnings, 'search_days_hint'),
  ];

  const dayButtons = ctx.searchableDayIsos.map((iso) => {
    const label = volunteerHomeWeekdayShort(iso);
    const selected = selectedDays.has(iso);
    const payload = {
      ...basePayload,
      selectedDays: toggleCsvValue(params.selectedDays, iso),
      selectedJobs: params.selectedJobs || '',
    };
    return volunteerHomeToggleButton(label, selected, searchTarget, payload);
  });

  if (dayButtons.length) {
    children.push({
      type: 'container',
      layout: 'row',
      spacing: 8,
      style: { padding: { top: 4, bottom: 8, left: 4, right: 4 } },
      children: dayButtons,
    });
  }

  children.push(volunteerHomeBodyText('Tap jobs (skip = all jobs)', ctx.layoutWarnings, 'search_jobs_hint'));

  for (const job of ctx.jobs) {
    const jobId = job.id;
    const selected = selectedJobs.has(jobId);
    const jobLabel = volunteerHomeFitLine(job.title, VOLUNTEER_HOME_MAX_BAR_CHARS, ctx.layoutWarnings, `job_${jobId}`);
    const payload = {
      ...basePayload,
      selectedDays: params.selectedDays || '',
      selectedJobs: toggleCsvValue(params.selectedJobs, jobId),
    };
    children.push(volunteerHomeToggleButton(jobLabel, selected, searchTarget, payload));
  }

  const searchRunPayload = {
    ...basePayload,
    selectedDays: params.selectedDays || '',
    selectedJobs: params.selectedJobs || '',
  };
  children.push(
    volunteerHomeMaroonButton('Search', 'jewelheart.volunteer.assign', searchRunPayload),
  );

  if (ctx.errorNote) {
    children.push({
      type: 'text',
      content: ctx.errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));

  return volunteerHomeScreenEnvelope('jewelheart.volunteer.search', 'JewelHeart', children, ctx.layoutWarnings);
}

/** Placeholder until assign-results screen is built. */
export async function buildJewelheartVolunteerAssignScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx),
    ...volunteerHomeGoldPageTitleBar('Assign shifts to me', ctx.layoutWarnings),
    volunteerHomeBodyText('Tap a shift to assign it.', ctx.layoutWarnings, 'assign_hint'),
    volunteerHomeBodyText(
      selectedDaysJobsHint(params) || 'No filters — all open shifts.',
      ctx.layoutWarnings,
      'assign_filters',
    ),
    volunteerHomeMaroonButton('← Volunteer Home', 'jewelheart.home', {}),
  ];
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.assign', 'JewelHeart', children, ctx.layoutWarnings);
}

function selectedDaysJobsHint(params) {
  const days = params.selectedDays;
  const jobs = params.selectedJobs;
  const parts = [];
  if (days && String(days).trim()) parts.push(`Days: ${days}`);
  if (jobs && String(jobs).trim()) parts.push(`Jobs: ${jobs}`);
  const raw = parts.length ? parts.join(' · ') : '';
  if (raw.length <= VOLUNTEER_HOME_MAX_HINT_CHARS) return raw;
  return `${raw.slice(0, VOLUNTEER_HOME_MAX_HINT_CHARS - 1)}…`;
}

/** Placeholder — review / edit assigned shifts (mockup §1.1). */
export async function buildJewelheartVolunteerMineScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  const basePayload = ctx.retreatId ? { retreatId: ctx.retreatId } : {};
  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx),
    ...volunteerHomeGoldPageTitleBar('My assigned shifts', ctx.layoutWarnings),
    volunteerHomeBodyText('Tap a shift to review or remove it.', ctx.layoutWarnings, 'mine_hint'),
    volunteerHomeMaroonButton('← Volunteer Home', 'jewelheart.home', basePayload),
  ];
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.mine', 'JewelHeart', children, ctx.layoutWarnings);
}

/** Placeholder until full check-in flow (mockup §1.5). */
export async function buildJewelheartVolunteerCheckinScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  const basePayload = ctx.retreatId ? { retreatId: ctx.retreatId } : {};
  const taskId = params.taskId ? String(params.taskId) : '';
  const shiftLabel =
    (taskId && ctx.todayShifts.find((s) => s.taskId === taskId)?.label) ||
    (ctx.todayShifts[0] && ctx.todayShifts[0].label) ||
    'Your shift today';

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx),
    ...volunteerHomeGoldPageTitleBar('Check in', ctx.layoutWarnings),
    volunteerHomeBodyText(shiftLabel, ctx.layoutWarnings, 'checkin_shift'),
    volunteerHomeBodyText('Check-in steps coming soon.', ctx.layoutWarnings, 'checkin_hint'),
    volunteerHomeMaroonButton('← Volunteer Home', 'jewelheart.home', basePayload),
  ];
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.checkin', 'JewelHeart', children, ctx.layoutWarnings);
}

/** Placeholder — links to retreat messaging when native/API flow is wired. */
export async function buildJewelheartVolunteerMessagesScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  const basePayload = ctx.retreatId ? { retreatId: ctx.retreatId } : {};
  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx),
    ...volunteerHomeGoldPageTitleBar('Announcements', ctx.layoutWarnings),
    volunteerHomeBodyText('Retreat announcements and messages.', ctx.layoutWarnings, 'messages_hint'),
    volunteerHomeMaroonButton('← Volunteer Home', 'jewelheart.home', basePayload),
  ];
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.messages', 'JewelHeart', children, ctx.layoutWarnings);
}
