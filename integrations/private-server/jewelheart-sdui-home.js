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
const VOLUNTEER_HOME_BAR_H_PAD = 12;
/** Bar + home button row height — text centered vertically in clients. */
const VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP = 44;
const VOLUNTEER_HOME_BUTTON_H_PAD = 6;
const VOLUNTEER_HOME_BUTTON_ELEVATION_DP = 9;
/** Fits widest demo time label (e.g. 12:00 PM). */
const VOLUNTEER_HOME_TIME_BAR_WIDTH_DP = 100;
const VOLUNTEER_HOME_DEMO_DAY_ISO = '2026-07-21';
const VOLUNTEER_HOME_BAR_GAP = 6;
const VOLUNTEER_HOME_PILL_RADIUS = 16;
const VOLUNTEER_HOME_EN_DASH = ' – ';
const VOLUNTEER_HOME_ACTION_SECTION_SPACER = 14;

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
    .replace(/\s-\s/g, ' · ')
    .replace(/\s*—\s*/g, ' · ');
}

/** “Job – Wd” with the job name fitted first so the day never truncates away. */
function volunteerHomeJobDayLabel(jobName, dayIso, maxChars, warnings, code) {
  const weekday = volunteerHomeWeekdayShort(dayIso);
  const suffix = `${VOLUNTEER_HOME_EN_DASH}${weekday}`;
  const fitted = volunteerHomeFitLine(jobName, maxChars - suffix.length, warnings, code);
  return `${fitted}${suffix}`;
}

function volunteerHomeFitLine(text, maxChars, warnings, code) {
  let s = volunteerHomeCompactJobPhrase(String(text || '').trim());
  if (s.length <= maxChars) return s;
  volunteerHomeLayoutWarn(warnings, code, s);
  return `${s.slice(0, maxChars - 1)}…`;
}

function volunteerHomeFitRetreatTitle(name, warnings) {
  let s = volunteerHomeRetreatShortName(name);
  s = s.replace(/\b(20(\d{2}))\b/g, "'$2");
  s = s.replace(/\s+/g, ' ').trim();
  return volunteerHomeFitLine(s, VOLUNTEER_HOME_MAX_BAR_CHARS, warnings, 'retreat_title');
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

const VOLUNTEER_HOME_DEFAULT_RETREAT = {
  name: 'JH Summer Retreat 2026',
  startDate: '2026-07-20',
  endDate: '2026-07-26',
};

const VOLUNTEER_HOME_DEMO_TASKS = {
  'demo-kitchen-full': {
    jobName: 'Kitchen full clean',
    instructions: ['blah blah', 'Contact is David L'],
  },
  'demo-urinals': {
    jobName: 'Urinals',
    instructions: ['blah blah', 'Contact is David L'],
  },
};

/**
 * Poster tab jobs + abbreviations + scheduled days (v8 spreadsheet).
 * Blank day cell = scheduled; XXXXX = not scheduled that day.
 */
const VOLUNTEER_POSTER_SEARCH_JOBS = [
  { id: 'poster-cafe-lunch-light', title: 'Café, lunch break / Light cleanup', abbrev: 'Café light clean @ lunch', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-cafe-eod-full', title: 'Café, end of day / Full cleanup', abbrev: 'Café, clean @ end of day', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-kitchen-lunch-light', title: 'Kitchen, lunch brk / Light cleanup', abbrev: 'Ktchn light clean @ lunch', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-kitchen-eod-full', title: 'Kitchen, end of day / Full cleanup', abbrev: 'Ktchn clean @ end of day', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-coffee-morning', title: 'Coffee & snacks / Morning setup', abbrev: 'Coffee, snacks Morn setup', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-coffee-evening', title: 'Coffee & snacks / Evening brkdwn', abbrev: 'Coffee, snacks Eve brkdwn', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-tara-vacuum', title: 'Tara Paradse, store / Vacuum', abbrev: 'Tara Paradse, store Vacuum', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { id: 'poster-jh-hallway-vacuum', title: 'JH off, main hallway / Vacuum', abbrev: 'JH office, hallway Vacuum', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { id: 'poster-coatrm-vacuum', title: 'Coatrm, café hallwy / Vacuum', abbrev: 'Coatrm, café, Vacuum', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-foyer-vacuum', title: 'Foyer & lobby / Vacuum', abbrev: 'Foyer,lobby Vacuum', scheduledDayIsos: ['2026-07-22', '2026-07-25'] },
  { id: 'poster-lama-offices', title: 'Lama offices / Clean', abbrev: 'Lama offices Clean', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { id: 'poster-mens-room', title: "Men's room / Clean & stock", abbrev: "Men's room Clean & stock", scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-urinals', title: 'Urinals / Check pads & mop', abbrev: 'Urinals Check pads, mop', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-womens-room', title: "Women's room / Clean & stock", abbrev: "Women's room Clean, stock", scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-unisex-lama', title: 'Unisx, Lama bathrooms', abbrev: 'Unisx, Lama bathrooms', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-front-windows', title: 'Front windows / Clean', abbrev: 'Front windows Clean', scheduledDayIsos: ['2026-07-22', '2026-07-25'] },
  { id: 'poster-towels-launder', title: 'Towels, mop pads / launder at home', abbrev: 'Towels, mop pads launder', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
];

/** Posted announcements (persistent store TBD; empty until admin “Post announcement”). */
const VOLUNTEER_HOME_DEMO_ANNOUNCEMENTS = [];

/** In-memory volunteer demo state (announcements seen + check-in sessions) until DB tables exist. */
const volunteerDemoStateByFirebaseUid = new Map();

function volunteerDemoState(firebaseUid) {
  const key = String(firebaseUid || 'anonymous');
  if (!volunteerDemoStateByFirebaseUid.has(key)) {
    volunteerDemoStateByFirebaseUid.set(key, {
      highestAnnouncementSeen: 0,
      taskCheckins: {},
    });
  }
  return volunteerDemoStateByFirebaseUid.get(key);
}

function volunteerHighestAnnouncementPosted() {
  if (!VOLUNTEER_HOME_DEMO_ANNOUNCEMENTS.length) return 0;
  return Math.max(...VOLUNTEER_HOME_DEMO_ANNOUNCEMENTS.map((a) => a.id));
}

function volunteerHasUnreadAnnouncements(firebaseUid) {
  const st = volunteerDemoState(firebaseUid);
  return volunteerHighestAnnouncementPosted() > st.highestAnnouncementSeen;
}

function volunteerUnseenAnnouncements(firebaseUid) {
  const st = volunteerDemoState(firebaseUid);
  return VOLUNTEER_HOME_DEMO_ANNOUNCEMENTS.filter((a) => a.id > st.highestAnnouncementSeen);
}

function volunteerMarkAnnouncementsSeen(firebaseUid, throughId) {
  const st = volunteerDemoState(firebaseUid);
  const maxId = Math.max(
    st.highestAnnouncementSeen,
    ...VOLUNTEER_HOME_DEMO_ANNOUNCEMENTS.filter((a) => a.id <= throughId).map((a) => a.id),
  );
  st.highestAnnouncementSeen = maxId;
}

function volunteerMarkAllAnnouncementsSeen(firebaseUid) {
  const last = VOLUNTEER_HOME_DEMO_ANNOUNCEMENTS[VOLUNTEER_HOME_DEMO_ANNOUNCEMENTS.length - 1];
  if (last) volunteerMarkAnnouncementsSeen(firebaseUid, last.id);
}

function volunteerHomeNowIso() {
  return new Date().toISOString();
}

function volunteerHomeFormatTimeAm(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: jewelheartDefaultTimeZoneId,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

function volunteerTaskCheckinState(firebaseUid, taskId) {
  const st = volunteerDemoState(firebaseUid);
  const key = String(taskId || 'unknown');
  if (!st.taskCheckins[key]) {
    st.taskCheckins[key] = { sessions: [], open: null };
  }
  return st.taskCheckins[key];
}

function volunteerApplyCheckinOp(firebaseUid, taskId, op, volunteerName) {
  if (!taskId || !op) return;
  const tc = volunteerTaskCheckinState(firebaseUid, taskId);
  const name = String(volunteerName || 'Volunteer').trim() || 'Volunteer';
  const now = volunteerHomeNowIso();
  if (op === 'start') {
    if (!tc.open) {
      tc.open = { volunteerName: name, startedAt: now, finishedAt: null };
    }
  } else if (op === 'finish') {
    if (tc.open) {
      tc.sessions.push({
        volunteerName: tc.open.volunteerName,
        startedAt: tc.open.startedAt,
        finishedAt: now,
      });
      tc.open = null;
    }
  }
}

function volunteerPreviousCheckinLabel(firebaseUid, taskId) {
  const tc = volunteerTaskCheckinState(firebaseUid, taskId);
  const last = tc.sessions[tc.sessions.length - 1];
  if (!last) return '';
  const t = last.finishedAt || last.startedAt;
  return t ? ` · prev: ${volunteerHomeFormatTimeAm(t)}` : '';
}

/**
 * Pin July 21 (retreat day 2) and demo shifts for management demos.
 * Set JEWELHEART_VOLUNTEER_HOME_DEMO=0 after go-live to use live dates/data.
 */
function volunteerHomePinSummer2026Demo() {
  const v =
    typeof process !== 'undefined' && process.env
      ? String(process.env.JEWELHEART_VOLUNTEER_HOME_DEMO ?? '1').trim()
      : '1';
  if (v === '0' || v.toLowerCase() === 'false') return false;
  if (v === '1' || v.toLowerCase() === 'true') return true;
  const test =
    typeof process !== 'undefined' && process.env && process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY
      ? String(process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY).trim()
      : '';
  return Boolean(test && isIsoDate(test));
}

/** @deprecated use volunteerHomePinSummer2026Demo */
function volunteerHomeForceDemoAssignments() {
  return volunteerHomePinSummer2026Demo();
}

function volunteerHomeDemoTodayIso(timeZone) {
  const forced =
    typeof process !== 'undefined' && process.env && process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY
      ? String(process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY).trim()
      : '';
  if (forced && isIsoDate(forced)) return forced;
  if (volunteerHomePinSummer2026Demo()) return VOLUNTEER_HOME_DEMO_DAY_ISO;
  return volunteerHomeEffectiveTodayIso(timeZone);
}

function volunteerHomeDefaultRetreat(retreat) {
  if (
    retreat &&
    retreat.startDate === VOLUNTEER_HOME_DEFAULT_RETREAT.startDate &&
    retreat.endDate === VOLUNTEER_HOME_DEFAULT_RETREAT.endDate
  ) {
    return retreat;
  }
  if (retreat?.id) {
    return { ...VOLUNTEER_HOME_DEFAULT_RETREAT, id: retreat.id, name: retreat.name || VOLUNTEER_HOME_DEFAULT_RETREAT.name };
  }
  return { ...VOLUNTEER_HOME_DEFAULT_RETREAT };
}

function volunteerHomeCheckinTitle(taskId, fallbackLabel) {
  const task = VOLUNTEER_HOME_DEMO_TASKS[taskId];
  if (task) return `Check in for ${task.jobName}`;
  const label = String(fallbackLabel || 'your shift').trim();
  return label.toLowerCase().startsWith('check in') ? label : `Check in for ${label}`;
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

/** Compact date for blue sub-header bars (e.g. 7/21). */
function volunteerHomeMonthDaySlash(iso) {
  const [, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  return `${m}/${d}`;
}

function volunteerHomeUtcWeekday(iso) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/** Retreat weekdays Mon–Fri only (for sign-up day filters). */
function volunteerHomeRetreatWeekdaysMonFri(isos) {
  return (isos || []).filter((iso) => {
    const w = volunteerHomeUtcWeekday(iso);
    return w >= 1 && w <= 5;
  });
}

function volunteerHomeFormatJulDay(iso) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(dt);
  return `${month} ${d}`;
}

function volunteerHomeFormatJulDateRange(startIso, endIso) {
  if (!startIso || !endIso) return '7/20-7/26';
  const start = volunteerHomeMonthDaySlash(startIso);
  const end = volunteerHomeMonthDaySlash(endIso);
  return `${start}-${end}`;
}

/** Second blue bar: “{screen} – Day n, Weekday, m/d” (e.g. Day 2, Tue, 7/21). */
function volunteerHomeScreenSubtitleLine(screenTitle, retreat, contextIso) {
  const r = retreat || VOLUNTEER_HOME_DEFAULT_RETREAT;
  const dayNum = volunteerHomeDayNumber(r, contextIso);
  const weekday = volunteerHomeWeekdayShort(contextIso);
  return `${screenTitle}${VOLUNTEER_HOME_EN_DASH}Day ${dayNum}, ${weekday}, ${volunteerHomeMonthDaySlash(contextIso)}`;
}

function volunteerHomeRetreatBannerLine(retreat) {
  const range = volunteerHomeFormatJulDateRange(retreat?.startDate, retreat?.endDate);
  return `JH Summer Retreat${VOLUNTEER_HOME_EN_DASH}${range}`;
}

function volunteerHomeHeaderChildren(ctx, screenTitle, contextIso = undefined) {
  const iso = contextIso || ctx.todayIso;
  const line = volunteerHomeFitLine(
    volunteerHomeScreenSubtitleLine(screenTitle, ctx.retreat, iso),
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'header_line',
  );
  return [...volunteerHomeTopBlueBars(ctx, line), volunteerHomeGap()];
}

/** Retreat days from today through Saturday (inclusive). */
function volunteerHomeSearchDayIsos(retreat, todayIso) {
  const dates = volunteerHomeRetreatDates(retreat || VOLUNTEER_HOME_DEFAULT_RETREAT).filter(
    (iso) => iso >= todayIso,
  );
  if (!dates.length) return [todayIso];
  const out = [];
  for (const iso of dates) {
    out.push(iso);
    if (volunteerHomeUtcWeekday(iso) === 6) break;
  }
  return out;
}

function volunteerHomePosterJobAbbrev(job) {
  return String(job.abbrev || job.title || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function volunteerHomePosterSearchJobs() {
  return VOLUNTEER_POSTER_SEARCH_JOBS;
}

/** True when live retreat jobs/tasks are available (search + assignments hit the DB). */
function volunteerHomeDbSearchAvailable(ctx) {
  return Boolean(ctx.retreatId && ctx.volunteerId && (ctx.jobs || []).length);
}

/** Job list driving the search filter buttons: live DB jobs, else poster fallback. */
function volunteerHomeSearchJobsList(ctx) {
  if (volunteerHomeDbSearchAvailable(ctx)) {
    return ctx.jobs.map((j) => ({
      id: String(j.id),
      title: String(j.title || 'Job'),
      abbrev: String(j.title || 'Job').replace(/\s*—\s*/g, ' · '),
    }));
  }
  return VOLUNTEER_POSTER_SEARCH_JOBS;
}

function volunteerSearchDaysAllParam(params) {
  const v = params.daysAll;
  if (v === '0' || v === '1') return v;
  return parseCsvParam(params.selectedDays).size ? '0' : '1';
}

function volunteerSearchJobsAllParam(params) {
  const v = params.jobsAll;
  if (v === '0' || v === '1') return v;
  return parseCsvParam(params.selectedJobs).size ? '0' : '1';
}

function volunteerSearchNormalizeDaysState(params, dayIsos, todayIso) {
  const lastDayOnly = dayIsos.length === 1;
  if (lastDayOnly) {
    return { daysAll: '0', selectedDays: dayIsos[0] };
  }
  let daysAll = volunteerSearchDaysAllParam(params);
  let selectedDays = String(params.selectedDays || '').trim();
  if (daysAll === '0' && !parseCsvParam(selectedDays).size) {
    daysAll = '1';
    selectedDays = '';
  }
  return { daysAll, selectedDays };
}

function volunteerSearchNextDaysOnAllTap(state, todayIso, dayIsos) {
  if (dayIsos.length === 1) return state;
  if (state.daysAll === '1') {
    return { daysAll: '0', selectedDays: todayIso };
  }
  return { daysAll: '1', selectedDays: '' };
}

function volunteerSearchNextDaysOnDayTap(state, tappedIso, dayIsos) {
  if (dayIsos.length === 1) return state;
  if (state.daysAll === '1') {
    return { daysAll: '0', selectedDays: tappedIso };
  }
  const set = parseCsvParam(state.selectedDays);
  if (set.has(tappedIso)) set.delete(tappedIso);
  else set.add(tappedIso);
  if (!set.size) {
    return { daysAll: '1', selectedDays: '' };
  }
  return { daysAll: '0', selectedDays: [...set].sort().join(',') };
}

function volunteerSearchNextJobsOnAllTap(state) {
  if (state.jobsAll === '1') return state;
  return { jobsAll: '1', selectedJobs: '' };
}

function volunteerSearchNextJobsOnJobTap(state, jobId) {
  if (state.jobsAll === '1') {
    return { jobsAll: '0', selectedJobs: jobId };
  }
  const set = parseCsvParam(state.selectedJobs);
  if (set.has(jobId)) set.delete(jobId);
  else set.add(jobId);
  if (!set.size) {
    return { jobsAll: '1', selectedJobs: '' };
  }
  return { jobsAll: '0', selectedJobs: [...set].sort().join(',') };
}

function volunteerSearchFilterPayload(base, daysState, jobsState, returnTo) {
  return volunteerHomeWithReturnTo(
    {
      ...base,
      daysAll: daysState.daysAll,
      selectedDays: daysState.selectedDays || '',
      jobsAll: jobsState.jobsAll,
      selectedJobs: jobsState.selectedJobs || '',
    },
    returnTo,
  );
}

function volunteerSearchResolveTargetDayIsos(params, retreat, todayIso) {
  const dayIsos = volunteerHomeSearchDayIsos(retreat, todayIso);
  const daysState = volunteerSearchNormalizeDaysState(params, dayIsos, todayIso);
  if (daysState.daysAll === '1') return dayIsos;
  const picked = parseCsvParam(daysState.selectedDays);
  return dayIsos.filter((iso) => picked.has(iso));
}

function volunteerSearchResolveTargetJobIds(params, searchJobs) {
  let jobsAll = volunteerSearchJobsAllParam(params);
  let selectedJobs = String(params.selectedJobs || '').trim();
  if (jobsAll === '0' && !parseCsvParam(selectedJobs).size) {
    jobsAll = '1';
    selectedJobs = '';
  }
  if (jobsAll === '1') return searchJobs.map((j) => j.id);
  return [...parseCsvParam(selectedJobs)];
}

function volunteerHomePosterJobDisplayName(job) {
  return volunteerHomeDisplayJobName(String(job.title || '').replace(/\s*\/\s*/g, ' – '));
}

function volunteerSearchPosterShifts(targetDayIsos, targetJobIds, todayIso) {
  const jobSet = new Set(targetJobIds);
  const rows = [];
  for (const job of volunteerHomePosterSearchJobs()) {
    if (!jobSet.has(job.id)) continue;
    for (const dayIso of job.scheduledDayIsos || []) {
      if (!targetDayIsos.includes(dayIso)) continue;
      if (dayIso < todayIso) continue;
      rows.push({
        jobId: job.id,
        dayIso,
        taskId: job.id,
        label: volunteerHomePosterJobDisplayName(job),
      });
    }
  }
  rows.sort(
    (a, b) => a.dayIso.localeCompare(b.dayIso) || a.label.localeCompare(b.label),
  );
  return rows;
}

/**
 * Open shifts matching the day/job filters. A shift is one (job, day); it is
 * open when at least one of its tasks still has capacity and I'm not on it.
 * Backed by the live schedule (assignments filter results); poster fallback offline.
 */
async function volunteerSearchMatchingShifts(ctx, params, firebaseUid, authToken) {
  const retreat = ctx.retreat || VOLUNTEER_HOME_DEFAULT_RETREAT;
  const searchJobs = volunteerHomeSearchJobsList(ctx);
  const targetDayIsos = volunteerSearchResolveTargetDayIsos(params, retreat, ctx.todayIso);
  const targetJobIds = volunteerSearchResolveTargetJobIds(params, searchJobs);

  if (!volunteerHomeDbSearchAvailable(ctx)) {
    return volunteerSearchPosterShifts(targetDayIsos, targetJobIds, ctx.todayIso);
  }

  const jobSet = new Set(targetJobIds);
  const myJobDays = new Set((ctx.myShifts || []).map((s) => `${s.jobId}|${s.dayIso}`));
  const rows = [];
  for (const dayIso of targetDayIsos) {
    if (dayIso < ctx.todayIso) continue;
    const day = await getScheduleByDay(firebaseUid, ctx.retreatId, dayIso, authToken);
    const seenJobIds = new Set();
    for (const item of day?.items || []) {
      const jobId = String((item.task && item.task.jobId) || (item.job && item.job.id) || '');
      if (!jobId || !jobSet.has(jobId)) continue;
      if (seenJobIds.has(jobId)) continue;
      // A shift is (job, day): hide it entirely once I'm assigned to any of its tasks.
      if (myJobDays.has(`${jobId}|${dayIso}`)) continue;
      const assigns = item.assignments || [];
      const needed =
        item.task?.volunteersNeeded ?? item.job?.volunteersNeeded ?? 1;
      const count = item.task?.assignmentCount ?? assigns.length;
      if (count >= needed) continue;
      seenJobIds.add(jobId);
      rows.push({
        jobId,
        dayIso,
        taskId: item.task?.id ? String(item.task.id) : jobId,
        label: volunteerHomeDisplayJobName(
          (item.job && item.job.title) || (item.task && item.task.jobTitle) || 'Shift',
        ),
      });
    }
  }
  rows.sort(
    (a, b) => a.dayIso.localeCompare(b.dayIso) || a.label.localeCompare(b.label),
  );
  return rows;
}

/** “no shifts” / “1 shift, none today” / “3 shifts, 2 today – tap to check in”. */
function volunteerHomeShiftsSummaryLine(shiftCount, todayCount) {
  if (!shiftCount) return 'no shifts';
  const shiftWord = shiftCount === 1 ? 'shift' : 'shifts';
  if (!todayCount) return `${shiftCount} ${shiftWord}, none today`;
  return `${shiftCount} ${shiftWord}, ${todayCount} today${VOLUNTEER_HOME_EN_DASH}tap to check in`;
}

function volunteerHomeDisplayJobName(label) {
  return String(label || '')
    .replace(/\s*[-–]\s*End of\s+day\s*$/i, '')
    .replace(/\s*[-–]\s*EOD\s*$/i, '')
    .replace(/\s*[-–]\s*end of\s+day\s*$/i, '')
    .trim();
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

function volunteerHomeBarStyle(backgroundColor, paddingOverrides = {}) {
  return {
    backgroundColor,
    fullBleed: true,
    height: { value: VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP },
    padding: {
      top: 0,
      bottom: 0,
      left: VOLUNTEER_HOME_BAR_H_PAD,
      right: VOLUNTEER_HOME_BAR_H_PAD,
      ...paddingOverrides,
    },
  };
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
    style: volunteerHomeBarStyle(backgroundColor),
  };
  if (action) node.action = action;
  return node;
}

function volunteerHomeSpacer(height = VOLUNTEER_HOME_BAR_GAP) {
  return { type: 'spacer', style: { height: { value: height } } };
}

function volunteerHomeGap() {
  return volunteerHomeSpacer(VOLUNTEER_HOME_BAR_GAP);
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
    style: {
      padding: { top: 2, bottom: 4, left: 8, right: 8 },
      parentCentered: true,
    },
  };
}

function volunteerHomeCenteredPlainLabel(content) {
  return volunteerHomePlainLabel(content);
}

function volunteerHomeInlineSectionLabel(content) {
  return {
    type: 'text',
    content,
    textStyle: {
      fontSize: 19,
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#333333',
    },
    style: { padding: { top: 10, bottom: 10, left: 0, right: 6 } },
  };
}

function volunteerHomeWithReturnTo(payload, returnTo) {
  const out = { ...(payload || {}) };
  if (returnTo) out.returnTo = returnTo;
  return out;
}

/** Short titles for ← back buttons (returnTo screen id). */
const VOLUNTEER_SCREEN_BACK_LABELS = {
  'jewelheart.home': 'Home',
  'jewelheart.volunteer.checkin': 'Job check in',
  'jewelheart.volunteer.search': 'Find open shifts',
  'jewelheart.volunteer.assign': 'Open shifts',
  'jewelheart.volunteer.shift': 'Shift',
  'jewelheart.volunteer.messages': 'Announcements',
  'jewelheart.volunteer.mine': 'My assigned shifts',
  'jewelheart.volunteer.account': 'Account',
  'jewelheart.volunteer.preferences': 'Preferences',
};

function volunteerHomeScreenBackLabel(screenId) {
  return VOLUNTEER_SCREEN_BACK_LABELS[screenId] || 'Back';
}

function volunteerHomeBackPayload(params, backTarget) {
  const p = {};
  if (params.retreatId) p.retreatId = String(params.retreatId);
  if (backTarget === 'jewelheart.volunteer.checkin' && params.taskId) {
    p.taskId = String(params.taskId);
    p.returnTo = 'jewelheart.home';
  }
  if (backTarget === 'jewelheart.volunteer.shift') {
    if (params.taskId) p.taskId = String(params.taskId);
    if (params.jobId) p.jobId = String(params.jobId);
    if (params.dayIso) p.dayIso = String(params.dayIso);
    p.shiftOp = params.shiftOp ? String(params.shiftOp) : 'mine';
    p.returnTo = 'jewelheart.volunteer.mine';
  }
  if (backTarget === 'jewelheart.volunteer.search' || backTarget === 'jewelheart.volunteer.assign') {
    if (backTarget === 'jewelheart.volunteer.search') p.returnTo = 'jewelheart.home';
    if (params.daysAll != null) p.daysAll = String(params.daysAll);
    if (params.selectedDays) p.selectedDays = String(params.selectedDays);
    if (params.jobsAll != null) p.jobsAll = String(params.jobsAll);
    if (params.selectedJobs) p.selectedJobs = String(params.selectedJobs);
  }
  return p;
}

/** Bottom nav pills: ← {returnTo} when not Home, plus ← Home on every sub-screen. */
function volunteerHomeBottomNavChildren(params = {}) {
  const backTarget = params.returnTo || 'jewelheart.home';
  const children = [];
  if (backTarget !== 'jewelheart.home') {
    const backLabel = `← ${volunteerHomeScreenBackLabel(backTarget)}`;
    children.push(
      volunteerHomePillButton(
        backLabel,
        backTarget,
        volunteerHomeBackPayload(params, backTarget),
        volunteerHomeSummaryBlue,
        '#FFFFFF',
        { hPad: 10 },
      ),
    );
  }
  const homePayload = params.retreatId ? { retreatId: String(params.retreatId) } : {};
  children.push(
    volunteerHomePillButton(
      '← Home',
      'jewelheart.home',
      homePayload,
      volunteerHomeSummaryBlue,
      '#FFFFFF',
      { hPad: 10 },
    ),
  );
  return children;
}

function volunteerHomeBottomNavRow(params = {}) {
  return {
    type: 'container',
    layout: 'row',
    spacing: 8,
    textStyle: { textAlign: 'center' },
    style: { padding: { top: 8, bottom: 8, left: 8, right: 8 } },
    children: volunteerHomeBottomNavChildren(params),
  };
}

function volunteerHomeStickyFooterRow(params = {}, options = {}) {
  const children = [];
  if (options.searchTarget && options.searchPayload) {
    children.push(volunteerHomeSearchRunButton(options.searchTarget, options.searchPayload));
  }
  children.push(...volunteerHomeBottomNavChildren(params));
  return {
    type: 'container',
    layout: 'row',
    spacing: 8,
    textStyle: { textAlign: 'center' },
    style: {
      padding: { top: 8, bottom: 8, left: 8, right: 8 },
      stickyFooter: true,
    },
    children,
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

/** Home pill — same height as bars; raised styling in clients. */
function volunteerHomePillButton(
  label,
  target,
  payload,
  backgroundColor,
  textColor,
  options = {},
) {
  const fontSize = options.fontSize ?? VOLUNTEER_HOME_BAR_FONT_SP;
  const hPad = options.hPad ?? VOLUNTEER_HOME_BUTTON_H_PAD;
  return {
    type: 'button',
    content: label,
    label,
    action: { type: 'navigate', target, payload },
    textStyle: {
      fontSize,
      fontWeight: 'bold',
      textAlign: 'center',
      color: textColor,
    },
    style: {
      backgroundColor,
      borderRadius: options.borderRadius ?? VOLUNTEER_HOME_PILL_RADIUS,
      buttonVariant: 'raised',
      elevation: options.elevation ?? VOLUNTEER_HOME_BUTTON_ELEVATION_DP,
      height: { value: VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP },
      padding: { top: 0, bottom: 0, left: hPad, right: hPad },
      parentCentered: options.parentCentered === true,
    },
  };
}

function volunteerHomeCenteredRow(children, spacing = 6, options = {}) {
  return {
    type: 'container',
    layout: 'row',
    spacing,
    textStyle: { textAlign: 'center' },
    style: {
      padding: { top: 0, bottom: 0, left: 6, right: 6 },
      equalWidthChildren: options.equalWidthChildren === true,
    },
    children,
  };
}

function volunteerHomeCenteredPill(label, target, payload, backgroundColor, textColor, options = {}) {
  return {
    type: 'container',
    layout: 'column',
    spacing: 0,
    textStyle: { textAlign: 'center' },
    style: { padding: { top: 0, bottom: 0, left: 0, right: 0 } },
    children: [
      volunteerHomePillButton(label, target, payload, backgroundColor, textColor, {
        ...options,
        parentCentered: true,
      }),
    ],
  };
}

/** Centered maroon pill (type button — not edge-to-edge). */
function volunteerHomeActionButton(label, target, payload = {}) {
  return volunteerHomePillButton(label, target, payload, volunteerHomeMaroon, '#FFFFFF', {
    borderRadius: VOLUNTEER_HOME_PILL_RADIUS,
  });
}

function volunteerHomeCenteredAction(label, target, payload = {}) {
  return volunteerHomeCenteredPill(label, target, payload, volunteerHomeMaroon, '#FFFFFF', {});
}

function volunteerHomeSmallBlueButton(label, target, payload = {}) {
  return volunteerHomePillButton(label, target, payload, volunteerHomeSummaryBlue, '#FFFFFF', {
    hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
    borderRadius: VOLUNTEER_HOME_PILL_RADIUS,
  });
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

function volunteerHomeShiftsSummaryBar(ctx) {
  const fg = ctx.todayCount > 0 ? '#000000' : '#FFFFFF';
  const bg = ctx.todayCount > 0 ? volunteerHomeGold : volunteerHomeMaroon;
  return volunteerHomeBar(ctx.shiftsSummaryLine, bg, fg);
}

/** Home header: retreat (yellow on blue) + second blue line. */
function volunteerHomeTopBlueBars(ctx, secondLineText = null) {
  const warnings = ctx.layoutWarnings;
  const retreatLine = volunteerHomeFitLine(
    ctx.retreatBannerLine,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    warnings,
    'retreat_banner',
  );
  const lineRaw = secondLineText ?? ctx.volunteerHomeLine;
  const secondLine = volunteerHomeFitLine(lineRaw, VOLUNTEER_HOME_MAX_BAR_CHARS, warnings, 'header_line');
  return [
    volunteerHomeBar(retreatLine, volunteerHomeSummaryBlue, volunteerHomeGold),
    volunteerHomeGap(),
    volunteerHomeBar(secondLine, volunteerHomeSummaryBlue, '#FFFFFF'),
  ];
}

function volunteerHomeCompactTimeBar(text) {
  return {
    type: 'text',
    content: text,
    textStyle: {
      fontSize: VOLUNTEER_HOME_BAR_FONT_SP,
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#FFFFFF',
    },
    style: {
      backgroundColor: volunteerHomeSummaryBlue,
      height: { value: VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP },
      width: { value: VOLUNTEER_HOME_TIME_BAR_WIDTH_DP },
      padding: { top: 0, bottom: 0, left: 6, right: 6 },
    },
  };
}

function volunteerHomeCenteredInlineRow(children) {
  return {
    type: 'container',
    layout: 'column',
    spacing: 0,
    textStyle: { textAlign: 'center' },
    style: { padding: { top: 0, bottom: 0, left: 0, right: 0 } },
    children: [
      {
        type: 'container',
        layout: 'row',
        spacing: 6,
        style: { padding: { top: 0, bottom: 0, left: 6, right: 6 } },
        children,
      },
    ],
  };
}

function volunteerHomeCheckinActionRow(buttonLabel, timeText, target, payload, op) {
  const rowPayload = { ...payload, checkinOp: op };
  return volunteerHomeCenteredInlineRow([
    volunteerHomePillButton(buttonLabel, target, rowPayload, volunteerHomeMaroon, '#FFFFFF', {
      hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
    }),
    volunteerHomeCompactTimeBar(timeText),
  ]);
}

function volunteerHomeCheckinHeaderChildren(ctx) {
  return volunteerHomeHeaderChildren(ctx, 'Job check in');
}

function volunteerHomeAnnouncementsButton(ctx) {
  const warnings = ctx.layoutWarnings;
  const label = volunteerHomeFitLine(
    'See announcements and messages',
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    warnings,
    'announcements_btn',
  );
  const basePayload = volunteerHomeWithReturnTo(
    ctx.retreatId ? { retreatId: ctx.retreatId } : {},
    'jewelheart.home',
  );
  return volunteerHomeCenteredPill(
    label,
    'jewelheart.volunteer.messages',
    basePayload,
    volunteerHomeGold,
    '#000000',
    {},
  );
}

function volunteerHomeCheckinPill(row, index, ctx, checkInPayload) {
  const payload = { ...checkInPayload };
  if (row.taskId) payload.taskId = row.taskId;
  const label = volunteerHomeDisplayJobName(row.label);
  return volunteerHomePillButton(
    label,
    'jewelheart.volunteer.checkin',
    volunteerHomeWithReturnTo(payload, 'jewelheart.home'),
    volunteerHomeGold,
    '#000000',
    { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
  );
}

/** Up to two check-in pills per row; pills grow to fit label text. */
function volunteerHomeTodayShiftButtons(ctx, checkInPayload) {
  const maxPerRow = 2;
  const blocks = [];
  for (let i = 0; i < ctx.todayShifts.length; i += maxPerRow) {
    const chunk = ctx.todayShifts.slice(i, i + maxPerRow);
    const pills = chunk.map((row, j) => volunteerHomeCheckinPill(row, i + j, ctx, checkInPayload));
    if (pills.length === 1) {
      blocks.push(volunteerHomeCenteredPill(
        pills[0].label,
        pills[0].action.target,
        pills[0].action.payload,
        volunteerHomeGold,
        '#000000',
        { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
      ));
    } else {
      blocks.push(volunteerHomeCenteredRow(pills, 6));
    }
    if (i + maxPerRow < ctx.todayShifts.length) blocks.push(volunteerHomeGap());
  }
  return blocks;
}

/** Mockup “I want to…” — two maroon pills + account/preferences row. */
function volunteerHomeIWantToSection(ctx, searchPayload) {
  const items = [
    volunteerHomeCenteredPlainLabel('I want to...'),
    volunteerHomeGap(),
    volunteerHomeCenteredAction(
      'Find and sign up for open shifts',
      'jewelheart.volunteer.search',
      volunteerHomeWithReturnTo(searchPayload, 'jewelheart.home'),
    ),
  ];
  if (ctx.shiftCount > 0) {
    items.push(
      volunteerHomeGap(),
      volunteerHomeCenteredAction(
        'Review / edit my assigned shifts',
        'jewelheart.volunteer.mine',
        volunteerHomeWithReturnTo(searchPayload, 'jewelheart.home'),
      ),
    );
  }
  items.push(volunteerHomeGap(), volunteerHomeAccountPreferencesRow(ctx));
  return items;
}

function volunteerHomeAccountPreferencesRow(ctx) {
  const basePayload = ctx.retreatId ? { retreatId: ctx.retreatId } : {};
  const label = {
    type: 'text',
    content: 'Review/edit my',
    textStyle: {
      fontSize: 19,
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#333333',
    },
    style: { padding: { top: 2, bottom: 4, left: 0, right: 6 } },
  };
  return volunteerHomeCenteredRow(
    [
      label,
      volunteerHomeSmallBlueButton(
        'Acct',
        'jewelheart.volunteer.account',
        volunteerHomeWithReturnTo(basePayload, 'jewelheart.home'),
      ),
      volunteerHomeSmallBlueButton(
        'Prefs',
        'jewelheart.volunteer.preferences',
        volunteerHomeWithReturnTo(basePayload, 'jewelheart.home'),
      ),
    ],
    6,
  );
}

function volunteerHomeToggleButton(label, selected, target, payload) {
  return volunteerHomeFilterToggleButton(label, selected, target, payload);
}

/** Day/job filter pill: light maroon off, dark maroon on; past days show × and do not toggle. */
function volunteerHomeFilterToggleButton(label, selected, target, payload, options = {}) {
  const disabled = options.disabled === true;
  const displayLabel = disabled ? `× ${label}` : label;
  const bg = selected && !disabled ? volunteerHomeMaroon : volunteerHomeLightMaroon;
  const node = {
    type: 'button',
    label: displayLabel,
    content: displayLabel,
    textStyle: {
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#FFFFFF',
    },
    style: {
      backgroundColor: bg,
      borderRadius: VOLUNTEER_HOME_PILL_RADIUS,
      buttonVariant: disabled ? undefined : 'raised',
      elevation: disabled ? 0 : VOLUNTEER_HOME_BUTTON_ELEVATION_DP,
      height: { value: VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP },
      padding: { top: 0, bottom: 0, left: 8, right: 8 },
    },
  };
  if (!disabled && options.noAction !== true) {
    node.action = { type: 'navigate', target, payload };
  }
  return node;
}

function volunteerHomeWrappedFilterRow(buttons) {
  return {
    type: 'container',
    layout: 'row',
    spacing: 6,
    textStyle: { textAlign: 'center' },
    style: { padding: { top: 0, bottom: 0, left: 6, right: 6 } },
    children: buttons,
  };
}

function volunteerHomeSearchRunButton(target, payload) {
  return volunteerHomePillButton('Search', target, payload, volunteerHomeMaroon, '#FFFFFF', {
    hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
  });
}

/** Blue header bars for volunteer sub-screens (no home-only controls). */
function volunteerHomeBlueHeaderChildren(ctx, screenTitle) {
  return volunteerHomeHeaderChildren(ctx, screenTitle || 'JewelHeart');
}

function volunteerHomeGoldPageTitleBar(pageTitle, warnings) {
  const fitted = volunteerHomeFitLine(pageTitle, VOLUNTEER_HOME_MAX_BAR_CHARS, warnings, 'page_title');
  return [volunteerHomeBar(fitted, volunteerHomeGold, '#000000'), volunteerHomeSpacer(16)];
}

const VOLUNTEER_SCREEN_TITLES = {
  'jewelheart.home': 'Home',
  'jewelheart.volunteer.search': 'Find open shifts',
  'jewelheart.volunteer.assign': 'Open shifts',
};

function volunteerHomeScreenEnvelope(id, title, children, layoutWarnings = [], extraMeta = {}) {
  const isHome = id === 'jewelheart.home';
  const stickyFooterComponents = extraMeta.stickyFooterComponents || [];
  return {
    id,
    title: VOLUNTEER_SCREEN_TITLES[id] || title || 'JewelHeart',
    metadata: {
      app: 'jewelheart',
      layoutWarnings,
      minWidthDp: VOLUNTEER_HOME_MIN_WIDTH_DP,
      edgeToEdgeBars: isHome,
      stickyFooter: extraMeta.stickyFooter === true,
      stickyFooterComponents,
    },
    components: [
      {
        type: 'container',
        layout: 'column',
        spacing: 0,
        style: {
          padding: isHome
            ? { top: 6, bottom: 6, left: 0, right: 0 }
            : { all: 12 },
        },
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

async function volunteerHomeLoadMyShifts(firebaseUid, retreat, volunteerId, todayIso, authToken) {
  const dates = volunteerHomeRetreatDates(retreat);
  const mine = [];
  for (const iso of dates) {
    const day = await getScheduleByDay(firebaseUid, retreat.id, iso, authToken);
    for (const item of day?.items || []) {
      const assigns = item.assignments || [];
      const myAssign = assigns.find((a) => a.volunteerId === volunteerId);
      if (!myAssign) continue;
      const taskId = item.task && item.task.id;
      mine.push({
        date: iso,
        dayIso: iso,
        taskId: taskId ? String(taskId) : '',
        jobId: item.job?.id ? String(item.job.id) : '',
        assignmentId: myAssign.id ? String(myAssign.id) : '',
        jobTitle: (item.job && item.job.title) || '',
        label: volunteerHomeJobLine(item),
      });
    }
  }
  const todayMine = mine.filter((m) => m.date === todayIso);
  return {
    shiftCount: mine.length,
    todayCount: todayMine.length,
    rawTodayShifts: todayMine,
    myShifts: mine,
  };
}

/** Volunteer record for the signed-in user (firebase uid match, else first linked). */
async function volunteerResolveSelf(firebaseUid, retreatId) {
  return resolveVolunteerIdForHome(firebaseUid, retreatId);
}

/**
 * Self-service assignment writes — direct SQL (volunteer action, not admin),
 * so anonymous Firebase sessions are not blocked by the admin retreat ACL.
 */
async function volunteerSelfAssign(retreatId, taskId, volunteerId) {
  const { rows } = await query(
    `INSERT INTO jewelheart_assignments (task_id, volunteer_id)
     SELECT t.id, $3
     FROM jewelheart_tasks t
     JOIN jewelheart_jobs j ON j.id = t.job_id
     WHERE t.id = $2 AND t.retreat_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM jewelheart_assignments a WHERE a.task_id = t.id AND a.volunteer_id = $3
       )
       AND (SELECT count(*) FROM jewelheart_assignments a WHERE a.task_id = t.id) < j.volunteers_needed
     RETURNING id`,
    [retreatId, taskId, volunteerId],
  );
  return rows.length > 0;
}

async function volunteerSelfUnassign(retreatId, taskId, volunteerId) {
  const { rows } = await query(
    `DELETE FROM jewelheart_assignments a
     USING jewelheart_tasks t
     WHERE a.task_id = t.id AND t.id = $2 AND t.retreat_id = $1 AND a.volunteer_id = $3
     RETURNING a.id`,
    [retreatId, taskId, volunteerId],
  );
  return rows.length > 0;
}

/** Already assigned to this task (per loaded context)? */
function volunteerHomeIsMyTask(ctx, taskId) {
  return Boolean(taskId && (ctx.myShifts || []).some((s) => s.taskId === String(taskId)));
}

function volunteerHomeMapTodayShifts(rawTodayShifts, layoutWarnings) {
  return rawTodayShifts.map((row, index) => {
    const name = volunteerHomeDisplayJobName(row.jobTitle || row.label);
    return {
      taskId: row.taskId,
      label: volunteerHomeFitLine(name, VOLUNTEER_HOME_MAX_BAR_CHARS, layoutWarnings, `today_shift_${index}`),
    };
  });
}

function volunteerHomeBuildContextFields(
  todayIso,
  retreat,
  shiftCount,
  todayCount,
  rawTodayShifts,
  layoutWarnings,
  extras = {},
) {
  const effectiveRetreat = retreat || VOLUNTEER_HOME_DEFAULT_RETREAT;
  const retreatBannerLine = volunteerHomeFitLine(
    volunteerHomeRetreatBannerLine(effectiveRetreat),
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    layoutWarnings,
    'retreat_banner',
  );
  const volunteerHomeLine = volunteerHomeFitLine(
    volunteerHomeScreenSubtitleLine('Home', effectiveRetreat, todayIso),
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
  return {
    todayIso,
    retreat: retreat || null,
    retreatId: retreat?.id || null,
    retreatBannerLine,
    volunteerHomeLine,
    shiftsSummaryLine,
    shiftCount,
    todayCount,
    todayShifts: volunteerHomeMapTodayShifts(rawTodayShifts, layoutWarnings),
    searchableDayIsos: volunteerHomeSearchableDates(effectiveRetreat, todayIso),
    allRetreatDayIsos: volunteerHomeRetreatDates(effectiveRetreat),
    layoutWarnings,
    ...extras,
  };
}

function volunteerHomeGroupMatchesByDay(matches) {
  const byDay = new Map();
  for (const row of matches) {
    if (!byDay.has(row.dayIso)) byDay.set(row.dayIso, []);
    byDay.get(row.dayIso).push(row);
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Shared header data for home and volunteer search screens. */
export async function gatherVolunteerHomeContext(firebaseUid, authToken = undefined) {
  const tz = jewelheartDefaultTimeZoneId;
  const todayIso = volunteerHomeDemoTodayIso(tz);

  if (volunteerHomePinSummer2026Demo()) {
    const todayIso = VOLUNTEER_HOME_DEMO_DAY_ISO;
    let retreat = volunteerHomeDefaultRetreat(null);
    let volunteerName = 'Volunteer';
    let volunteerId = null;
    let errorNote = null;
    let usingDemo = false;
    let shiftCount = 0;
    let todayCount = 0;
    let rawTodayShifts = [];
    let myShifts = [];
    let jobs = [];
    try {
      const { items: retreats } = await listRetreats(firebaseUid, authToken);
      const picked = volunteerHomePickRetreat(retreats, todayIso);
      if (picked) retreat = picked;
      const volunteerRow = await resolveVolunteerIdForHome(firebaseUid, retreat?.id);
      if (volunteerRow?.displayName) volunteerName = volunteerRow.displayName;
      volunteerId = volunteerRow?.id || null;
      if (volunteerId && retreat?.id) {
        const loaded = await volunteerHomeLoadMyShifts(
          firebaseUid,
          retreat,
          volunteerId,
          todayIso,
          authToken,
        );
        shiftCount = loaded.shiftCount;
        todayCount = loaded.todayCount;
        rawTodayShifts = loaded.rawTodayShifts;
        myShifts = loaded.myShifts;
        try {
          const jobRes = await listJobs(firebaseUid, retreat.id, authToken);
          jobs = (jobRes?.items || []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));
        } catch {
          jobs = [];
        }
      } else {
        usingDemo = true;
        errorNote = volunteerId ? null : 'Volunteer not linked to retreat.';
      }
    } catch (err) {
      usingDemo = true;
      errorNote = err && err.message ? err.message : String(err);
    }
    const layoutWarnings = [];
    return {
      ...volunteerHomeBuildContextFields(
        todayIso,
        retreat,
        shiftCount,
        todayCount,
        rawTodayShifts,
        layoutWarnings,
        { jobs, usingDemo, errorNote, volunteerId, myShifts },
      ),
      firebaseUid,
      volunteerName,
      hasAnnouncements: volunteerHasUnreadAnnouncements(firebaseUid),
    };
  }

  let retreat = null;
  let shiftCount = 0;
  let todayCount = 0;
  let rawTodayShifts = [];
  let myShifts = [];
  let usingDemo = false;
  let errorNote = null;
  let searchableDayIsos = [];
  let jobs = [];
  let volunteerName = 'Volunteer';
  let volunteerId = null;

  try {
    const { items: retreats } = await listRetreats(firebaseUid, authToken);
    retreat = volunteerHomePickRetreat(retreats, todayIso);
    if (!retreat) {
      usingDemo = true;
      errorNote = 'No retreat found.';
    } else {
      searchableDayIsos = volunteerHomeSearchableDates(retreat, todayIso);

      const volunteerRow = await resolveVolunteerIdForHome(firebaseUid, retreat.id);
      volunteerId = (volunteerRow && volunteerRow.id) || null;
      if (volunteerRow?.displayName) volunteerName = volunteerRow.displayName;
      if (!volunteerId) {
        usingDemo = true;
      } else {
        const loaded = await volunteerHomeLoadMyShifts(
          firebaseUid,
          retreat,
          volunteerId,
          todayIso,
          authToken,
        );
        shiftCount = loaded.shiftCount;
        todayCount = loaded.todayCount;
        rawTodayShifts = loaded.rawTodayShifts;
        myShifts = loaded.myShifts;
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

  const layoutWarnings = [];
  return {
    ...volunteerHomeBuildContextFields(
      todayIso,
      retreat,
      shiftCount,
      todayCount,
      rawTodayShifts,
      layoutWarnings,
      { jobs, usingDemo, errorNote, volunteerId, myShifts },
    ),
    searchableDayIsos: usingDemo
      ? [todayIso, addDaysIsoYmd(todayIso, 1), addDaysIsoYmd(todayIso, 2)]
      : searchableDayIsos,
    hasAnnouncements: volunteerHasUnreadAnnouncements(firebaseUid),
    firebaseUid,
    volunteerName,
  };
}

/** @returns screen object for buildSduiResponse wrap() */
export async function buildJewelheartHomeScreen(firebaseUid, authToken = undefined) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);

  const searchPayload = volunteerHomeWithReturnTo(
    ctx.retreatId ? { retreatId: ctx.retreatId } : {},
    'jewelheart.home',
  );
  const checkInPayload = { ...searchPayload };

  const children = [
    ...volunteerHomeTopBlueBars(ctx),
    volunteerHomeGap(),
    ...(ctx.hasAnnouncements ? [volunteerHomeAnnouncementsButton(ctx), volunteerHomeGap()] : []),
    volunteerHomeShiftsSummaryBar(ctx),
    ...(ctx.todayShifts.length ? [volunteerHomeGap(), ...volunteerHomeTodayShiftButtons(ctx, checkInPayload)] : []),
    volunteerHomeSpacer(VOLUNTEER_HOME_ACTION_SECTION_SPACER),
    ...volunteerHomeIWantToSection(ctx, searchPayload),
  ];

  if (ctx.errorNote) {
    children.push({
      type: 'text',
      content: ctx.errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }
  if (ctx.usingDemo && !volunteerHomePinSummer2026Demo()) {
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
  const retreat = ctx.retreat || VOLUNTEER_HOME_DEFAULT_RETREAT;
  const dayIsos = volunteerHomeSearchDayIsos(retreat, ctx.todayIso);
  const lastDayOnly = dayIsos.length === 1;
  const daysState = volunteerSearchNormalizeDaysState(params, dayIsos, ctx.todayIso);
  const jobsState = {
    jobsAll: volunteerSearchJobsAllParam(params),
    selectedJobs: String(params.selectedJobs || '').trim(),
  };
  if (jobsState.jobsAll === '0' && !parseCsvParam(jobsState.selectedJobs).size) {
    jobsState.jobsAll = '1';
    jobsState.selectedJobs = '';
  }
  const selectedDaySet = parseCsvParam(daysState.selectedDays);
  const selectedJobSet = parseCsvParam(jobsState.selectedJobs);

  const navParams = {
    retreatId: retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
    daysAll: daysState.daysAll,
    selectedDays: daysState.selectedDays,
    jobsAll: jobsState.jobsAll,
    selectedJobs: jobsState.selectedJobs,
  };
  const basePayload = retreatId ? { retreatId } : {};
  const searchTarget = 'jewelheart.volunteer.search';
  const assignTarget = 'jewelheart.volunteer.assign';
  const stickyFooter = volunteerHomeStickyFooterRow(navParams, {
    searchTarget: assignTarget,
    searchPayload: volunteerSearchFilterPayload(basePayload, daysState, jobsState, searchTarget),
  });

  const children = [
    ...volunteerHomeHeaderChildren(ctx, 'Find open shifts'),
    volunteerHomeGap(),
    volunteerHomeCenteredInlineRow([
      volunteerHomeInlineSectionLabel('Find open shifts'),
      volunteerHomeSearchRunButton(
        assignTarget,
        volunteerSearchFilterPayload(basePayload, daysState, jobsState, searchTarget),
      ),
    ]),
    volunteerHomeGap(),
  ];

  const dayButtons = [];
  if (!lastDayOnly) {
    const allSelected = daysState.daysAll === '1';
    dayButtons.push(
      volunteerHomeFilterToggleButton(
        'all days',
        allSelected,
        searchTarget,
        volunteerSearchFilterPayload(
          basePayload,
          volunteerSearchNextDaysOnAllTap(daysState, ctx.todayIso, dayIsos),
          jobsState,
          navParams.returnTo,
        ),
      ),
    );
  }
  for (const iso of dayIsos) {
    const label = volunteerHomeWeekdayShort(iso);
    const selected = lastDayOnly || (daysState.daysAll === '0' && selectedDaySet.has(iso));
    const payload = volunteerSearchFilterPayload(
      basePayload,
      volunteerSearchNextDaysOnDayTap(daysState, iso, dayIsos),
      jobsState,
      navParams.returnTo,
    );
    dayButtons.push(
      volunteerHomeFilterToggleButton(label, selected, searchTarget, payload, {
        disabled: lastDayOnly,
        noAction: lastDayOnly,
      }),
    );
  }
  if (dayButtons.length) {
    children.push(volunteerHomeWrappedFilterRow(dayButtons), volunteerHomeGap());
  }

  const jobButtons = [];
  const allJobsSelected = jobsState.jobsAll === '1';
  jobButtons.push(
    volunteerHomeFilterToggleButton(
      'All jobs',
      allJobsSelected,
      searchTarget,
      volunteerSearchFilterPayload(
        basePayload,
        daysState,
        volunteerSearchNextJobsOnAllTap(jobsState),
        navParams.returnTo,
      ),
      { noAction: allJobsSelected },
    ),
  );
  for (const job of volunteerHomeSearchJobsList(ctx)) {
    const selected = jobsState.jobsAll === '0' && selectedJobSet.has(job.id);
    const abbrev = volunteerHomeFitLine(
      volunteerHomePosterJobAbbrev(job),
      28,
      ctx.layoutWarnings,
      `job_abbrev_${job.id}`,
    );
    jobButtons.push(
      volunteerHomeFilterToggleButton(
        abbrev,
        selected,
        searchTarget,
        volunteerSearchFilterPayload(
          basePayload,
          daysState,
          volunteerSearchNextJobsOnJobTap(jobsState, job.id),
          navParams.returnTo,
        ),
      ),
    );
  }
  children.push(volunteerHomeWrappedFilterRow(jobButtons));

  if (ctx.errorNote) {
    children.push({
      type: 'text',
      content: ctx.errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));

  return volunteerHomeScreenEnvelope('jewelheart.volunteer.search', 'JewelHeart', children, ctx.layoutWarnings, {
    stickyFooter: true,
    stickyFooterComponents: [stickyFooter],
  });
}

/** Search results — tap a row to open jewelheart.volunteer.shift. */
export async function buildJewelheartVolunteerAssignScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  const retreatId = params.retreatId || ctx.retreatId || '';
  const basePayload = retreatId ? { retreatId } : {};
  const navParams = {
    retreatId: retreatId || '',
    returnTo: params.returnTo || 'jewelheart.volunteer.search',
    daysAll: volunteerSearchDaysAllParam(params),
    selectedDays: params.selectedDays || '',
    jobsAll: volunteerSearchJobsAllParam(params),
    selectedJobs: params.selectedJobs || '',
  };
  const shiftBase = volunteerHomeWithReturnTo(
    { ...basePayload, returnTo: 'jewelheart.volunteer.assign' },
    navParams.returnTo,
  );

  const matches = await volunteerSearchMatchingShifts(ctx, params, firebaseUid, authToken);
  const totalLine = `${matches.length} Open shifts found altogether`;

  const children = [
    ...volunteerHomeHeaderChildren(ctx, 'Open shifts'),
    volunteerHomeGap(),
    volunteerHomeCenteredPlainLabel(
      volunteerHomeFitLine(totalLine, VOLUNTEER_HOME_MAX_BAR_CHARS, ctx.layoutWarnings, 'open_shifts_total'),
    ),
    volunteerHomeGap(),
  ];

  if (!matches.length) {
    children.push(
      volunteerHomeBodyText('No open shifts match your filters.', ctx.layoutWarnings, 'assign_empty'),
    );
  }
  for (const [dayIso, dayRows] of volunteerHomeGroupMatchesByDay(matches)) {
    const weekday = volunteerHomeWeekdayShort(dayIso);
    const barText = volunteerHomeFitLine(
      `${dayRows.length} ${weekday} -- tap to sign up`,
      VOLUNTEER_HOME_MAX_BAR_CHARS,
      ctx.layoutWarnings,
      `open_shifts_day_${dayIso}`,
    );
    children.push(volunteerHomeBar(barText, volunteerHomeSummaryBlue, '#FFFFFF'));
    for (const row of dayRows) {
      const rowLabel = volunteerHomeJobDayLabel(
        row.label,
        dayIso,
        VOLUNTEER_HOME_MAX_BAR_CHARS,
        ctx.layoutWarnings,
        `open_shift_${row.jobId}_${dayIso}`,
      );
      children.push(
        volunteerHomeGap(),
        volunteerHomeCenteredPill(
          rowLabel,
          'jewelheart.volunteer.shift',
          {
            ...shiftBase,
            shiftOp: 'assign_me',
            jobId: row.jobId,
            dayIso: row.dayIso,
            taskId: row.taskId || row.jobId,
            volunteerId: 'me',
          },
          volunteerHomeMaroon,
          '#FFFFFF',
          { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
        ),
      );
    }
    children.push(volunteerHomeGap());
  }

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  const stickyFooter = volunteerHomeStickyFooterRow(navParams);
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.assign', 'JewelHeart', children, ctx.layoutWarnings, {
    stickyFooter: true,
    stickyFooterComponents: [stickyFooter],
  });
}

/** Instruction lines for a job: DB subjobs, else demo task lines, else placeholder. */
function volunteerHomeJobInstructionLines(ctx, jobId, taskId) {
  const job = (ctx.jobs || []).find((j) => String(j.id) === String(jobId));
  const subjobs = (job?.subjobs || [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((s) => String(s.text || '').trim())
    .filter(Boolean);
  if (subjobs.length) return subjobs;
  const demoTask = VOLUNTEER_HOME_DEMO_TASKS[taskId] || VOLUNTEER_HOME_DEMO_TASKS[jobId];
  if (demoTask?.instructions?.length) return demoTask.instructions;
  return ['No instructions on file for this job.'];
}

function volunteerHomeShiftJobName(ctx, jobId, taskId) {
  const job = (ctx.jobs || []).find((j) => String(j.id) === String(jobId));
  if (job?.title) return volunteerHomeDisplayJobName(job.title);
  const posterJob = VOLUNTEER_POSTER_SEARCH_JOBS.find((j) => j.id === jobId || j.id === taskId);
  const demoTask = VOLUNTEER_HOME_DEMO_TASKS[taskId] || VOLUNTEER_HOME_DEMO_TASKS[jobId];
  return volunteerHomeDisplayJobName(posterJob?.title || demoTask?.jobName || 'Shift');
}

/** Wrapping instruction text (not width-limited; clients wrap + scroll). */
function volunteerHomeInstructionText(content) {
  return {
    type: 'text',
    content,
    textStyle: { fontSize: 15, textAlign: 'left' },
    style: { padding: { top: 4, bottom: 4, left: 12, right: 12 } },
  };
}

/**
 * Shift page — `jewelheart.volunteer.shift`.
 * Params: shiftOp ('assign_me' from Open shifts, 'mine' from My assigned shifts),
 * jobId, dayIso, taskId, checkinOp ('assign' performs the DB assignment).
 *
 * Shows day+job bar (gold if today, blue otherwise), assign or check-in button,
 * then the job instructions (scrolling).
 */
export async function buildJewelheartVolunteerShiftScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const shiftOp = String(params.shiftOp || 'view');
  let jobId = String(params.jobId || '');
  const taskId = String(params.taskId || jobId || '');
  const checkinOp = params.checkinOp ? String(params.checkinOp) : '';
  const paramRetreatId = params.retreatId ? String(params.retreatId) : '';

  // One-shot DB write before loading context so the page reflects the result.
  let assignAttempted = false;
  if (checkinOp === 'assign' && taskId && paramRetreatId) {
    assignAttempted = true;
    const vol = await volunteerResolveSelf(firebaseUid, paramRetreatId);
    if (vol?.id) {
      try {
        await volunteerSelfAssign(paramRetreatId, taskId, vol.id);
      } catch {
        /* surfaced below via assignment state */
      }
    }
  } else if ((checkinOp === 'start' || checkinOp === 'finish') && taskId) {
    volunteerApplyCheckinOp(firebaseUid, taskId, checkinOp, 'Volunteer');
  }

  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  const myShiftForTask = taskId
    ? (ctx.myShifts || []).find((s) => s.taskId === taskId)
    : null;
  if (!jobId && myShiftForTask) jobId = myShiftForTask.jobId;
  const retreatId = paramRetreatId || ctx.retreatId || '';
  const dayIso = String(params.dayIso || myShiftForTask?.dayIso || ctx.todayIso);
  const basePayload = retreatId ? { retreatId } : {};
  const returnTo = params.returnTo || 'jewelheart.volunteer.assign';
  const navParams = { ...basePayload, returnTo, shiftOp, jobId, dayIso, taskId, volunteerId: params.volunteerId || 'me' };

  const jobName = volunteerHomeShiftJobName(ctx, jobId, taskId);
  const isToday = dayIso === ctx.todayIso;
  const isMine = volunteerHomeIsMyTask(ctx, taskId);
  const title = shiftOp === 'mine' || isMine ? 'My shift info' : 'Sign up';

  const dayJobBarText = volunteerHomeJobDayLabel(
    jobName,
    dayIso,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'shift_day_job',
  );
  const children = [
    ...volunteerHomeHeaderChildren(ctx, title, dayIso),
    volunteerHomeGap(),
    isToday
      ? volunteerHomeBar(dayJobBarText, volunteerHomeGold, '#000000')
      : volunteerHomeBar(dayJobBarText, volunteerHomeSummaryBlue, '#FFFFFF'),
    volunteerHomeGap(),
  ];

  const shiftPayload = (extra = {}) =>
    volunteerHomeWithReturnTo(
      { ...basePayload, shiftOp, jobId, dayIso, taskId, volunteerId: 'me', ...extra },
      returnTo,
    );

  if (isMine) {
    children.push(
      volunteerHomeBodyText('✓ This shift is assigned to you.', ctx.layoutWarnings, 'shift_assigned'),
    );
    if (isToday && taskId) {
      const checkinLabel = volunteerHomeFitLine(
        `Check in for ${jobName}`,
        VOLUNTEER_HOME_MAX_BAR_CHARS,
        ctx.layoutWarnings,
        'shift_checkin_btn',
      );
      children.push(
        volunteerHomeGap(),
        volunteerHomeCenteredPill(
          checkinLabel,
          'jewelheart.volunteer.checkin',
          volunteerHomeWithReturnTo({ ...basePayload, taskId }, 'jewelheart.volunteer.shift'),
          volunteerHomeGold,
          '#000000',
          { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
        ),
      );
    }
  } else if (assignAttempted) {
    children.push(
      volunteerHomeBodyText(
        'Could not assign this shift — it may already be filled.',
        ctx.layoutWarnings,
        'shift_assign_fail',
      ),
    );
  } else {
    children.push(
      volunteerHomeCenteredPill(
        'Assign this shift to me',
        'jewelheart.volunteer.shift',
        shiftPayload({ checkinOp: 'assign' }),
        volunteerHomeMaroon,
        '#FFFFFF',
        { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
      ),
    );
  }

  children.push(volunteerHomeSpacer(VOLUNTEER_HOME_ACTION_SECTION_SPACER));
  for (const line of volunteerHomeJobInstructionLines(ctx, jobId, taskId)) {
    children.push(volunteerHomeInstructionText(line));
  }

  children.push(volunteerHomeGap(), volunteerHomeBottomNavRow({ ...navParams, returnTo }));
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.shift', 'JewelHeart', children, ctx.layoutWarnings);
}

function selectedDaysJobsHint(params) {
  const parts = [];
  const daysAll = volunteerSearchDaysAllParam(params);
  const jobsAll = volunteerSearchJobsAllParam(params);
  if (daysAll === '1') parts.push('Days: all');
  else if (params.selectedDays && String(params.selectedDays).trim()) {
    parts.push(`Days: ${params.selectedDays}`);
  }
  if (jobsAll === '1') parts.push('Jobs: all');
  else if (params.selectedJobs && String(params.selectedJobs).trim()) {
    parts.push(`Jobs: ${params.selectedJobs}`);
  }
  const raw = parts.length ? parts.join(' · ') : '';
  if (raw.length <= VOLUNTEER_HOME_MAX_HINT_CHARS) return raw;
  return `${raw.slice(0, VOLUNTEER_HOME_MAX_HINT_CHARS - 1)}…`;
}

/**
 * My assigned shifts — one row per shift: 🗑 (unassign, stays here) + dark
 * maroon button (job – day) opening My shift info. Third bar (blue):
 * “🗑 unassigns – tap for detail”. checkinOp='unassign' + taskId performs the
 * one-shot DB delete before rendering.
 */
export async function buildJewelheartVolunteerMineScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const checkinOp = params.checkinOp ? String(params.checkinOp) : '';
  const taskId = params.taskId ? String(params.taskId) : '';
  const paramRetreatId = params.retreatId ? String(params.retreatId) : '';
  if (checkinOp === 'unassign' && taskId && paramRetreatId) {
    const vol = await volunteerResolveSelf(firebaseUid, paramRetreatId);
    if (vol?.id) {
      try {
        await volunteerSelfUnassign(paramRetreatId, taskId, vol.id);
      } catch {
        /* row simply remains if the delete failed */
      }
    }
  }

  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  const retreatId = ctx.retreatId || paramRetreatId || '';
  const basePayload = retreatId ? { retreatId } : {};
  const navParams = {
    retreatId,
    returnTo: params.returnTo || 'jewelheart.home',
  };

  const children = [
    ...volunteerHomeHeaderChildren(ctx, 'My assigned shifts'),
    volunteerHomeGap(),
    volunteerHomeBar(
      `🗑 unassigns${VOLUNTEER_HOME_EN_DASH}tap for detail`,
      volunteerHomeSummaryBlue,
      '#FFFFFF',
    ),
    volunteerHomeGap(),
  ];

  const sorted = (ctx.myShifts || [])
    .slice()
    .sort((a, b) => a.dayIso.localeCompare(b.dayIso) || a.label.localeCompare(b.label));
  if (!sorted.length) {
    children.push(
      volunteerHomeBodyText('No shifts are assigned to you yet.', ctx.layoutWarnings, 'mine_empty'),
    );
  }
  sorted.forEach((shift, index) => {
    const jobName = volunteerHomeDisplayJobName(shift.jobTitle || shift.label);
    const rowLabel = volunteerHomeJobDayLabel(
      jobName,
      shift.dayIso,
      VOLUNTEER_HOME_MAX_BAR_CHARS - 6,
      ctx.layoutWarnings,
      `mine_shift_${index}`,
    );
    const trashButton = volunteerHomePillButton(
      '🗑',
      'jewelheart.volunteer.mine',
      volunteerHomeWithReturnTo(
        { ...basePayload, taskId: shift.taskId, checkinOp: 'unassign' },
        navParams.returnTo,
      ),
      volunteerHomeSummaryBlue,
      '#FFFFFF',
      { hPad: 10 },
    );
    const shiftButton = volunteerHomePillButton(
      rowLabel,
      'jewelheart.volunteer.shift',
      volunteerHomeWithReturnTo(
        {
          ...basePayload,
          shiftOp: 'mine',
          jobId: shift.jobId,
          dayIso: shift.dayIso,
          taskId: shift.taskId,
          volunteerId: 'me',
        },
        'jewelheart.volunteer.mine',
      ),
      volunteerHomeMaroon,
      '#FFFFFF',
      { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
    );
    if (index > 0) children.push(volunteerHomeGap());
    children.push(volunteerHomeCenteredRow([trashButton, shiftButton], 6));
  });

  children.push(volunteerHomeGap(), volunteerHomeBottomNavRow(navParams));
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.mine', 'JewelHeart', children, ctx.layoutWarnings);
}

export async function buildJewelheartVolunteerCheckinScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  const basePayload = ctx.retreatId ? { retreatId: ctx.retreatId } : {};
  const navParams = {
    ...basePayload,
    returnTo: params.returnTo || 'jewelheart.home',
    taskId: params.taskId ? String(params.taskId) : '',
  };
  const taskId = params.taskId ? String(params.taskId) : '';
  const checkinOp = params.checkinOp ? String(params.checkinOp) : '';
  if (checkinOp && taskId) {
    volunteerApplyCheckinOp(firebaseUid, taskId, checkinOp, ctx.volunteerName);
  }

  const shiftLabel =
    (taskId && ctx.todayShifts.find((s) => s.taskId === taskId)?.label) ||
    (taskId && VOLUNTEER_HOME_DEMO_TASKS[taskId]?.jobName) ||
    (ctx.todayShifts[0] && ctx.todayShifts[0].label) ||
    'your shift today';
  const demoTask = VOLUNTEER_HOME_DEMO_TASKS[taskId];
  const jobName = volunteerHomeDisplayJobName(demoTask?.jobName || shiftLabel);
  const prevClause = volunteerPreviousCheckinLabel(firebaseUid, taskId);
  const jobBarText = volunteerHomeFitLine(
    `${jobName}${prevClause}`,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'checkin_job',
  );

  const tc = volunteerTaskCheckinState(firebaseUid, taskId);
  const lastSession = tc.sessions.length ? tc.sessions[tc.sessions.length - 1] : null;
  const displayStart = tc.open
    ? volunteerHomeFormatTimeAm(tc.open.startedAt)
    : lastSession
      ? volunteerHomeFormatTimeAm(lastSession.startedAt)
      : '—';
  const displayFinish = tc.open
    ? '—'
    : lastSession
      ? volunteerHomeFormatTimeAm(lastSession.finishedAt)
      : '—';
  const checkinTarget = 'jewelheart.volunteer.checkin';
  const checkinPayload = volunteerHomeWithReturnTo(
    { ...basePayload, ...(taskId ? { taskId } : {}) },
    navParams.returnTo,
  );

  const children = [...volunteerHomeCheckinHeaderChildren(ctx)];

  const unseen = volunteerUnseenAnnouncements(firebaseUid);
  if (unseen.length) {
    children.push(
      volunteerHomeCenteredPill(
        'See announcements and messages',
        'jewelheart.volunteer.messages',
        volunteerHomeWithReturnTo(
          { ...basePayload, ...(taskId ? { taskId } : {}) },
          'jewelheart.volunteer.checkin',
        ),
        volunteerHomeGold,
        '#000000',
        {},
      ),
      volunteerHomeGap(),
    );
  }

  children.push(
    volunteerHomeBar(jobBarText, volunteerHomeGold, '#000000'),
    volunteerHomeGap(),
    volunteerHomeCheckinActionRow('Start', displayStart, checkinTarget, checkinPayload, 'start'),
    volunteerHomeGap(),
    volunteerHomeCenteredInlineRow([
      volunteerHomeInlineSectionLabel('optional'),
      volunteerHomePillButton(
        'Finish',
        checkinTarget,
        { ...checkinPayload, checkinOp: 'finish' },
        volunteerHomeMaroon,
        '#FFFFFF',
        { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
      ),
      volunteerHomeCompactTimeBar(displayFinish),
    ]),
    volunteerHomeGap(),
    volunteerHomeBottomNavRow(navParams),
  );

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.checkin', 'JewelHeart', children, ctx.layoutWarnings);
}

export async function buildJewelheartVolunteerMessagesScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  const navParams = {
    retreatId: ctx.retreatId || params.retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
    taskId: params.taskId ? String(params.taskId) : '',
  };
  volunteerMarkAllAnnouncementsSeen(firebaseUid);

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx, 'Announcements'),
    ...volunteerHomeGoldPageTitleBar('Announcements', ctx.layoutWarnings),
  ];
  VOLUNTEER_HOME_DEMO_ANNOUNCEMENTS.forEach((ann, index) => {
    const line = `${ann.when}${VOLUNTEER_HOME_EN_DASH}${ann.text}`;
    children.push(volunteerHomeBodyText(line, ctx.layoutWarnings, `announcement_${index}`));
  });
  children.push(
    volunteerHomeGap(),
    volunteerHomeBottomNavRow(navParams),
  );
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.messages', 'JewelHeart', children, ctx.layoutWarnings);
}

function volunteerHomeSimplePlaceholderScreen(ctx, title, body, params, screenId) {
  const navParams = {
    retreatId: ctx.retreatId || params.retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
  };
  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx, title),
    ...volunteerHomeGoldPageTitleBar(title, ctx.layoutWarnings),
    volunteerHomeBodyText(body, ctx.layoutWarnings, `${screenId}_body`),
    volunteerHomeGap(),
    volunteerHomeBottomNavRow(navParams),
  ];
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope(screenId, 'JewelHeart', children, ctx.layoutWarnings);
}

export async function buildJewelheartVolunteerAccountScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  return volunteerHomeSimplePlaceholderScreen(
    ctx,
    'Account',
    'Placeholder screen — account details and sign-in options will go here.',
    params,
    'jewelheart.volunteer.account',
  );
}

export async function buildJewelheartVolunteerPreferencesScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await gatherVolunteerHomeContext(firebaseUid, authToken);
  return volunteerHomeSimplePlaceholderScreen(
    ctx,
    'Preferences',
    'Placeholder screen — notifications, display, and other settings will go here.',
    params,
    'jewelheart.volunteer.preferences',
  );
}
