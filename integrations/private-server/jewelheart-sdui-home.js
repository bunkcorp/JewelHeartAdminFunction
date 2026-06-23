/**
 * Volunteer SDUI home + search (jewelheart.home, jewelheart.volunteer.search).
 * Canonical copy in JewelHeartAdminFunction; apply script copies beside sduiScreens.js.
 */

import { query } from '../db.js';
import { listRetreats, getScheduleByDay, listJobs } from './service.js';

/** Bump on each deploy so testers can confirm API + UI version. */
// Deploy label: YYYYMMDDHHmm in America/New_York (not UTC).
const VOLUNTEER_SDUI_BUILD_STAMP = '202606222030';

/** karmadots.org/testerslogin sends uiChannel=testers — frozen before job-type search. */
function volunteerHomeUiChannel(params = {}) {
  return String(params?.uiChannel || '').trim().toLowerCase();
}

function volunteerHomeIsTestersChannel(params = {}) {
  return volunteerHomeUiChannel(params) === 'testers';
}

function volunteerHomePickRetreatFromList(retreats, todayIso, explicitRetreatId) {
  const id = String(explicitRetreatId || '').trim();
  if (id) {
    const match = (retreats || []).find((r) => r.id === id);
    if (match) return match;
  }
  return volunteerHomePickRetreat(retreats, todayIso);
}

function volunteerHomeGatherCtx(firebaseUid, authToken, params = {}) {
  const retreatId = params.retreatId ? String(params.retreatId).trim() : '';
  return gatherVolunteerHomeContext(
    firebaseUid,
    authToken,
    retreatId ? { retreatId } : {},
  );
}

const jewelheartDefaultTimeZoneId = 'America/New_York';
const volunteerHomeGold = '#FFCA10';
const volunteerHomeLightGold = '#FFE9A3';
const volunteerHomeSummaryBlue = '#7A95CA';
/** Mockups.docx — Maroon (action buttons). */
const volunteerHomeMaroon = '#92160E';
const volunteerHomeLightMaroon = '#C68581';
/** Past/inoperative day filter button (medium gray, white font). */
const volunteerHomeMediumGray = '#808080';

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
/**
 * Field separator. Per spec, a centered dot replaces every en-dash or single
 * dash flanked by spaces. Bullet (U+2022) reads as a slightly larger centered
 * dot and renders reliably on phones and Windows 10/11. Name kept for churn.
 */
const VOLUNTEER_HOME_EN_DASH = ' • ';
const VOLUNTEER_HOME_DOT_SEP = ' • ';
const VOLUNTEER_HOME_ACTION_SECTION_SPACER = 14;
/** Min height for today-shift scroll viewport: two 44dp pills + 6dp gap. */
const VOLUNTEER_HOME_TODAY_SCROLL_MIN_HEIGHT_DP =
  VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP * 2 + VOLUNTEER_HOME_BAR_GAP;

function volunteerHomeLayoutWarn(warnings, code, original) {
  const msg = `${code}: "${original}" (${original.length} chars)`;
  warnings.push(msg);
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[jewelheart.home layout] ${msg} — max ${VOLUNTEER_HOME_MAX_BAR_CHARS} on ${VOLUNTEER_HOME_MIN_WIDTH_DP}dp`);
  }
}

function volunteerHomeCompactJobPhrase(text) {
  return String(text || '')
    .replace(/\s-\sEnd of Day$/i, `${VOLUNTEER_HOME_DOT_SEP}EOD`)
    .replace(/\s-\send of lunch break$/i, `${VOLUNTEER_HOME_DOT_SEP}lunch`)
    .replace(/\s-\send of day$/i, `${VOLUNTEER_HOME_DOT_SEP}EOD`)
    .replace(/\s[-–]\s/g, VOLUNTEER_HOME_DOT_SEP)
    .replace(/\s*—\s*/g, VOLUNTEER_HOME_DOT_SEP)
    .replace(/\s*\/\s*/g, VOLUNTEER_HOME_DOT_SEP);
}

/** “Job • Wd” with the job name fitted first so the day never truncates away. */
function volunteerHomeJobDayLabel(jobName, dayIso, maxChars, warnings, code) {
  const weekday = volunteerHomeWeekdayShort(dayIso);
  const suffix = `${VOLUNTEER_HOME_EN_DASH}${weekday}`;
  const fitted = volunteerHomeFitLine(jobName, maxChars - suffix.length, warnings, code);
  return `${fitted}${suffix}`;
}

/** “Wd • Job” with the weekday first (never truncated) then the job, fitted. */
function volunteerHomeDayJobLabel(jobName, dayIso, maxChars, warnings, code) {
  const weekday = volunteerHomeWeekdayShort(dayIso);
  const prefix = `${weekday}${VOLUNTEER_HOME_EN_DASH}`;
  const fitted = volunteerHomeFitLine(jobName, maxChars - prefix.length, warnings, code);
  return `${prefix}${fitted}`;
}

function volunteerHomeFitLine(text, maxChars, warnings, code) {
  let s = volunteerHomeCompactJobPhrase(String(text || '').trim());
  if (s.length <= maxChars) return s;
  if (warnings) volunteerHomeLayoutWarn(warnings, code, s);
  return `${s.slice(0, maxChars - 1)}…`;
}

/** Fit abbrev text without compactJobPhrase (column K as-is except " - " → •). */
function volunteerHomeFitAbbrevLine(text, maxChars, warnings, code) {
  const s = String(text || '').trim();
  if (s.length <= maxChars) return s;
  if (warnings) volunteerHomeLayoutWarn(warnings, code, s);
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
  const codes = warnings.map((w) => String(w).split(':')[0]).join(', ');
  return [
    {
      type: 'text',
      content: `⚠ ${n} line${n === 1 ? '' : 's'} shortened (${codes})`,
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
 * Master tab jobs (v9 spreadsheet): column M = abbrev, column L = job type (f/v/b/m).
 * dbTitle matches live DB jewelheart_jobs.title after reseed for abbrev/type lookup.
 */
const VOLUNTEER_POSTER_SEARCH_JOBS = [
  { id: 'poster-cafe-lunch-light', title: 'Café, lunch break / light cleanup', dbTitle: 'Café, lunch break / Light cleanup', abbrev: 'Café, lunch, light clean', jobType: 'f', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-cafe-eod-full', title: 'Café, end of day / full cleanup', dbTitle: 'Café, end of day / Full cleanup', abbrev: 'Café, end of day, clean', jobType: 'f', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-kitchen-lunch-light', title: 'Kitchen, lunch brk / light cleanup', dbTitle: 'Kitchen, lunch brk / Light cleanup', abbrev: 'Ktchn, lunch, light clean', jobType: 'f', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-kitchen-eod-full', title: 'Kitchen, end of day / full cleanup', dbTitle: 'Kitchen, end of day / Full cleanup', abbrev: 'Ktchn, end of day, clean', jobType: 'f', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-coffee-morning', title: 'Coffee, snacks / Morning setup', dbTitle: 'Coffee & snacks / Morning setup', abbrev: 'Coffee, snacks morn, setup', jobType: 'f', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-coffee-evening', title: 'Coffee & snacks / Evening brkdwn', dbTitle: 'Coffee & snacks / Evening brkdwn', abbrev: 'Coffee, snacks Eve brkdwn', jobType: 'f', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-tara-vacuum', title: 'Tara Paradse, store, / Vacuum', dbTitle: 'Tara Paradse, store / Vacuum', abbrev: 'Tara Paradse, store, Vacuum', jobType: 'v', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { id: 'poster-jh-hallway-vacuum', title: 'JH office, main hallway / Vacuum', dbTitle: 'JH off, main hallway / Vacuum', abbrev: 'JH office, hallway Vacuum', jobType: 'v', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { id: 'poster-coatrm-vacuum', title: 'Coatrm, café hallwy / Vacuum', dbTitle: 'Coatrm, café hallwy / Vacuum', abbrev: 'Coatrm, café, Vacuum', jobType: 'v', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-foyer-vacuum', title: 'Foyer & lobby / Vacuum', dbTitle: 'Foyer & lobby / Vacuum', abbrev: 'Foyer,lobby Vacuum', jobType: 'v', scheduledDayIsos: ['2026-07-22', '2026-07-25'] },
  { id: 'poster-lama-offices', title: 'Lama offices / Clean', dbTitle: 'Lama offices / Clean', abbrev: 'Lama offices Clean', jobType: 'v', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { id: 'poster-mens-room', title: "Men's room / Clean & stock", dbTitle: "Men's room / Clean & stock", abbrev: "Men's room Clean & stock", jobType: 'b', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-urinals', title: 'Urinals / Check pads & mop', dbTitle: 'Urinals / Check pads & mop', abbrev: 'Urinals Check pads, mop', jobType: 'b', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-womens-room', title: "Women's room / Clean & stock", dbTitle: "Women's room / Clean & stock", abbrev: "Women's room Clean, stock", jobType: 'b', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-unisex-lama', title: 'Unisx, Lama bathrooms', dbTitle: 'Unisx, Lama bathrooms', abbrev: 'Unisx, Lama bathrooms', jobType: 'b', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { id: 'poster-front-windows', title: 'Front windows / Clean', dbTitle: 'Front windows / Clean', abbrev: 'Front windows Clean', jobType: 'm', scheduledDayIsos: ['2026-07-22', '2026-07-25'] },
  { id: 'poster-towels-launder', title: 'Towels, mop pads / launder at home', dbTitle: 'Towels, mop pads / launder at home', abbrev: 'Towels, mop pads launder', jobType: 'm', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
];

/**
 * Per-job instruction lines (v8 spreadsheet "Instructions" tab, column B).
 * Keyed by poster job id; the Instructions tab titles do not match the Master
 * tab, so these were mapped by content, not by title or row order.
 */
const VOLUNTEER_POSTER_JOB_INSTRUCTIONS = {
  'poster-cafe-lunch-light': ['Wipe tables', 'Clean serving table', 'Vacuum'],
  'poster-cafe-eod-full': ['Wipe tables', 'Clear, clean serving table', 'Chairs up', 'Vacuum', 'Mop', 'Chairs down (or leave for morning?)', 'Wash dishes in kitchen'],
  'poster-kitchen-lunch-light': ['Wipe, tidy big table', 'Wash dishes', 'Vacuum'],
  'poster-kitchen-eod-full': ['Clear, wipe big table', 'Stools up', 'Vacuum', 'Mop', 'Stools down', 'Store dry dishes', 'Wash dishes', 'Collect garbage, take out'],
  'poster-coffee-morning': ['Buy snacks?', 'Set up tea, coffee, snacks', 'Chairs down (if not done previous night)', 'Replenish & tidy through end of lunch'],
  'poster-coffee-evening': ['Replenish & tidy coffee area after lunch', 'End of day breakdown and cleanup:', 'Put away snacks', 'Clear, clean serving table', 'Wash coffee, tea pots', 'Wash other kitchen dishes as necessary'],
  'poster-tara-vacuum': ['Vacuum floors', 'Vacuum sofas as needed'],
  'poster-jh-hallway-vacuum': ['Vacuum floors', 'Vacuum sofas as needed'],
  'poster-coatrm-vacuum': ['Vacuum floors', 'Shake out mats as needed'],
  'poster-foyer-vacuum': ['(instructions to be added)'],
  'poster-lama-offices': ['Vacuum', 'Dust surfaces', 'Tidy desks'],
  'poster-mens-room': ['Mop', 'Clean sink', 'Wipe counter', 'Wipe fixtures', 'Clean toilet', 'Replenish deployed supplies', 'Replenish backup stock of supplies as needed', 'Empty trash, replace bag'],
  'poster-urinals': ['Mop as needed', 'Clean urinals', 'Moisten mop pads *slightly* as needed', 'Replace mop pads as needed'],
  'poster-womens-room': ['Mop', 'Clean sink', 'Wipe counter', 'Wipe fixtures', 'Clean toilet', 'Replenish deployed supplies', 'Replenish backup stock of supplies as needed', 'Empty trash, replace bag'],
  'poster-unisex-lama': ['Mop', 'Clean sink', 'Wipe counter', 'Wipe fixtures', 'Clean toilet', 'Replenish deployed supplies', 'Empty trash, replace bag'],
  'poster-front-windows': ['(instructions to be added)'],
  'poster-towels-launder': ['Pick up dirty towels in kitchen', 'Pick up dirty mop pads in closet', 'Launder at home', 'Return next morning'],
};

/** Resolve the v8 poster job (and its instructions) for a shift, by id or by DB job title. */
function volunteerHomePosterInstructions(ctx, jobId, taskId) {
  let posterJob = VOLUNTEER_POSTER_SEARCH_JOBS.find((j) => j.id === jobId || j.id === taskId);
  if (!posterJob) {
    const job = (ctx?.jobs || []).find((j) => String(j.id) === String(jobId));
    if (job?.title) {
      const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
      const want = norm(job.title);
      posterJob = VOLUNTEER_POSTER_SEARCH_JOBS.find((j) => norm(j.title) === want);
    }
  }
  const lines = posterJob ? VOLUNTEER_POSTER_JOB_INSTRUCTIONS[posterJob.id] : null;
  return Array.isArray(lines) && lines.length ? lines : null;
}

/** Canonical spreadsheet order of jobs, keyed by normalized title. */
const VOLUNTEER_POSTER_ORDER = new Map(
  VOLUNTEER_POSTER_SEARCH_JOBS.map((j, i) => [
    String(j.title).toLowerCase().replace(/\s+/g, ' ').trim(),
    i,
  ]),
);

function volunteerHomeJobOrderIndex(title) {
  const key = String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return VOLUNTEER_POSTER_ORDER.has(key) ? VOLUNTEER_POSTER_ORDER.get(key) : Number.MAX_SAFE_INTEGER;
}

/** Sort DB jobs into spreadsheet order (unknown titles fall to the end, alphabetical). */
function volunteerHomeSortJobs(items) {
  return (items || []).slice().sort(
    (a, b) =>
      volunteerHomeJobOrderIndex(a.title) - volunteerHomeJobOrderIndex(b.title) ||
      String(a.title).localeCompare(String(b.title)),
  );
}

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

/**
 * Second blue bar = screen title (verbatim), sometimes with a brief instruction.
 * Day/weekday now live in the top retreat-header bar, so this is a pass-through.
 */
function volunteerHomeScreenSubtitleLine(screenTitle /* , retreat, contextIso */) {
  return String(screenTitle || '');
}

/** Compact retreat span like "2026.7.20-26" (year.month.startDay-endDay). */
function volunteerHomeRetreatSpanCompact(startIso, endIso) {
  if (!startIso || !endIso) return '2026.7.20-26';
  const [sy, sm, sd] = startIso.split('-').map((x) => parseInt(x, 10));
  const [, , ed] = endIso.split('-').map((x) => parseInt(x, 10));
  return `${sy}.${sm}.${sd}-${ed}`;
}

/** Top retreat-header bar: "JH Retreat • 2026.7.20-26 • Day 2 Tue" (current day). */
function volunteerHomeRetreatBannerLine(retreat, contextIso) {
  const r = retreat || VOLUNTEER_HOME_DEFAULT_RETREAT;
  const span = volunteerHomeRetreatSpanCompact(r.startDate, r.endDate);
  const iso = contextIso || VOLUNTEER_HOME_DEMO_DAY_ISO;
  const dayNum = volunteerHomeDayNumber(r, iso);
  const weekday = volunteerHomeWeekdayShort(iso);
  return `JH Retreat${VOLUNTEER_HOME_EN_DASH}${span}${VOLUNTEER_HOME_EN_DASH}Day ${dayNum} ${weekday}`;
}

function volunteerHomeHeaderChildren(ctx, screenTitle, contextIso = undefined, options = {}) {
  const line = options.alreadyFitted
    ? String(screenTitle || '')
    : volunteerHomeFitLine(
        volunteerHomeScreenSubtitleLine(screenTitle, ctx.retreat, contextIso),
        VOLUNTEER_HOME_MAX_BAR_CHARS,
        ctx.layoutWarnings,
        options.warnCode || 'header_line',
      );
  return [...volunteerHomeTopBlueBars(ctx, line, { alreadyFitted: true }), volunteerHomeGap()];
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

function volunteerHomePosterJobMetaByTitle(title) {
  const t = String(title || '').trim();
  return VOLUNTEER_POSTER_SEARCH_JOBS.find(
    (j) => j.dbTitle === t || j.title === t,
  ) || null;
}

function volunteerHomePosterJobMetaForJob(job) {
  return volunteerHomePosterJobMetaByTitle(job?.title) || job;
}

function volunteerHomePosterJobAbbrev(job) {
  const meta = volunteerHomePosterJobMetaForJob(job);
  return String(meta.abbrev || meta.title || '')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/ - /g, VOLUNTEER_HOME_EN_DASH)
    .trim();
}

/** Filter pill label from Master column M abbrev (single line). */
function volunteerHomeJobFilterLabel(job, warnings, code) {
  return volunteerHomeFitAbbrevLine(volunteerHomePosterJobAbbrev(job), 26, warnings, code);
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
    return ctx.jobs.map((j) => {
      const meta = volunteerHomePosterJobMetaByTitle(j.title);
      return {
        id: String(j.id),
        title: String(j.title || 'Job'),
        abbrev: meta?.abbrev || String(j.title || 'Job').replace(/\s*—\s*/g, ' · '),
        jobType: meta?.jobType || '',
      };
    });
  }
  return VOLUNTEER_POSTER_SEARCH_JOBS.map((j) => ({
    id: j.id,
    title: j.title,
    abbrev: j.abbrev,
    jobType: j.jobType || '',
  }));
}

function volunteerSearchDaysAllParam(params) {
  const v = params.daysAll;
  if (v === '0' || v === '1') return v;
  return parseCsvParam(params.selectedDays).size ? '0' : '1';
}

function volunteerSearchJobsAllParam(params) {
  if (params.allJobsTap === '1' || params.filterReset === '1') return '1';
  const v = params.jobsAll;
  if (v === '0' || v === '1' || v === 0 || v === 1) return String(v);
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

/** --- Find (jewelheart.volunteer.search) filter state — clean reimplementation --- */

function volunteerFindFilterDefaultState(dayIsos) {
  if (dayIsos.length === 1) {
    return {
      daysAll: '0',
      selectedDays: dayIsos[0],
      daysPrev: '',
      jobsAll: '1',
      selectedJobs: '',
      jobsPrev: '',
    };
  }
  return {
    daysAll: '1',
    selectedDays: '',
    daysPrev: '',
    jobsAll: '1',
    selectedJobs: '',
    jobsPrev: '',
  };
}

function volunteerFindFilterFromParams(params, dayIsos) {
  if (params.filterReset === '1') {
    return volunteerFindFilterDefaultState(dayIsos);
  }
  const def = volunteerFindFilterDefaultState(dayIsos);
  let daysAll =
    params.daysAll === '0' || params.daysAll === 0
      ? '0'
      : params.daysAll === '1' || params.daysAll === 1
        ? '1'
        : def.daysAll;
  let selectedDays = String(params.selectedDays || '').trim();
  let daysPrev = String(params.daysPrev || '').trim();
  let jobsAll =
    params.jobsAll === '0' || params.jobsAll === 0
      ? '0'
      : params.jobsAll === '1' || params.jobsAll === 1
        ? '1'
        : def.jobsAll;
  let selectedJobs = String(params.selectedJobs || '').trim();
  let jobsPrev = String(params.jobsPrev || '').trim();

  if (daysAll === '1') selectedDays = '';
  if (jobsAll === '1') selectedJobs = '';

  if (dayIsos.length > 1 && daysAll === '0' && !parseCsvParam(selectedDays).size) {
    daysAll = '1';
    daysPrev = '';
  }
  if (jobsAll === '0' && !parseCsvParam(selectedJobs).size) {
    jobsAll = '1';
    jobsPrev = '';
  }

  return { daysAll, selectedDays, daysPrev, jobsAll, selectedJobs, jobsPrev };
}

function volunteerFindFilterToPayload(base, state, returnTo, options = {}) {
  const out = {
    ...base,
    daysAll: state.daysAll,
    selectedDays: state.selectedDays || '',
    daysPrev: state.daysPrev || '',
    jobsAll: state.jobsAll,
    selectedJobs: state.selectedJobs || '',
    jobsPrev: state.jobsPrev || '',
  };
  if (options.filterReset === true) out.filterReset = '1';
  return volunteerHomeWithReturnTo(out, returnTo);
}

/**
 * Tap the "All <group>" toggle. Symmetric for days and jobs — see docs/sdui/find.md §5.1/5.3:
 *   - on  + has prev → turn off, restore prev (prev cleared)
 *   - on  + no prev  → no-op
 *   - off            → turn on, remember the current subset as prev
 * Returns { all, selected, prev }.
 */
function findFilterTapAll(all, selected, prev) {
  if (all === '1') {
    if (String(prev || '').trim()) return { all: '0', selected: String(prev).trim(), prev: '' };
    return { all: '1', selected: '', prev: '' };
  }
  return { all: '1', selected: '', prev: String(selected || '').trim() };
}

/**
 * Tap one item in a group — see docs/sdui/find.md §5.2/5.4. `order` is the canonical id list
 * (calendar order for days, job-list order for jobs); the resulting CSV follows it.
 *   - all on  → switch to that item only
 *   - all off → toggle; if it empties the set → revert to all-on (prev cleared)
 * Returns { all, selected, prev }.
 */
function findFilterTapItem(all, selected, prev, id, order = []) {
  if (all === '1') return { all: '0', selected: id, prev: '' };
  const set = parseCsvParam(selected);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  if (!set.size) return { all: '1', selected: '', prev: '' };
  const ordered = order.filter((x) => set.has(x));
  const csv = ordered.length === set.size ? ordered.join(',') : [...set].join(',');
  return { all: '0', selected: csv, prev: String(prev || '').trim() };
}

function volunteerFindFilterNextDaysAllTap(state, _todayIso, dayIsos) {
  if (dayIsos.length === 1) return state;
  const g = findFilterTapAll(state.daysAll, state.selectedDays, state.daysPrev);
  return { ...state, daysAll: g.all, selectedDays: g.selected, daysPrev: g.prev };
}

function volunteerFindFilterNextDaysOnDayTap(state, tappedIso, dayIsos) {
  if (dayIsos.length === 1) return state;
  const g = findFilterTapItem(state.daysAll, state.selectedDays, state.daysPrev, tappedIso, dayIsos);
  return { ...state, daysAll: g.all, selectedDays: g.selected, daysPrev: g.prev };
}

function volunteerFindFilterNextJobsAllTap(state) {
  const g = findFilterTapAll(state.jobsAll, state.selectedJobs, state.jobsPrev);
  return { ...state, jobsAll: g.all, selectedJobs: g.selected, jobsPrev: g.prev };
}

function volunteerFindFilterNextJobsOnJobTap(state, jobId, jobIdOrder = []) {
  const g = findFilterTapItem(state.jobsAll, state.selectedJobs, state.jobsPrev, jobId, jobIdOrder);
  return { ...state, jobsAll: g.all, selectedJobs: g.selected, jobsPrev: g.prev };
}

function volunteerFindFilterDayIsos(state, dayIsos) {
  if (state.daysAll === '1') return dayIsos;
  const picked = parseCsvParam(state.selectedDays);
  return dayIsos.filter((iso) => picked.has(iso));
}

function volunteerFindFilterJobIds(state, searchJobs) {
  if (state.jobsAll === '1') return searchJobs.map((j) => j.id);
  const picked = parseCsvParam(state.selectedJobs);
  return searchJobs.filter((j) => picked.has(j.id)).map((j) => j.id);
}

/** "All" toggle carries no action when on with no remembered subset (tap would be a no-op). */
function volunteerFindFilterAllNoAction(all, prev) {
  return all === '1' && !String(prev || '').trim();
}

function volunteerFindFilterAllDaysNoAction(state) {
  return volunteerFindFilterAllNoAction(state.daysAll, state.daysPrev);
}

function volunteerFindFilterAllJobsNoAction(state) {
  return volunteerFindFilterAllNoAction(state.jobsAll, state.jobsPrev);
}

/** Default filter: all days, all jobs (Home → Find open shifts). */
function volunteerSearchDefaultDaysState() {
  return { daysAll: '1', selectedDays: '' };
}

function volunteerSearchDefaultJobsState() {
  return { jobsAll: '1', selectedJobs: '' };
}

/** Initial search filters: All days + All jobs; no type filter or per-job toggles. */
function volunteerSearchFilterResetState(daysState = volunteerSearchDefaultDaysState()) {
  return {
    daysAll: daysState.daysAll,
    selectedDays: daysState.selectedDays || '',
    daysPrev: '',
    jobsAll: '1',
    selectedJobs: '',
    jobsPrev: '',
    jobType: '',
    typeJobPrefs: '',
    filterReset: '1',
  };
}

function volunteerSearchFilterFromParams(params) {
  if (params.filterReset === '1') {
    return {
      daysAll: '1',
      selectedDays: '',
      daysPrev: '',
      jobsAll: '1',
      selectedJobs: '',
      jobsPrev: '',
    };
  }
  return {
    daysAll: volunteerSearchDaysAllParam(params),
    selectedDays: String(params.selectedDays || ''),
    jobsAll: volunteerSearchJobsAllParam(params),
    selectedJobs: String(params.selectedJobs || ''),
  };
}

function volunteerSearchFilterPayloadFromParams(base, params, returnTo) {
  const f = volunteerSearchFilterFromParams(params);
  return volunteerSearchFilterPayload(
    base,
    { daysAll: f.daysAll, selectedDays: f.selectedDays },
    { jobsAll: f.jobsAll, selectedJobs: f.selectedJobs },
    returnTo,
  );
}

const VOLUNTEER_JOB_TYPE_CODES = ['f', 'v', 'b', 'm'];

function volunteerSearchJobTypeParam(params) {
  const t = String(params.jobType || '').trim().toLowerCase();
  return VOLUNTEER_JOB_TYPE_CODES.includes(t) ? t : '';
}

function volunteerSearchByTypeDefaultState() {
  return { jobType: '', jobsAll: '1', selectedJobs: '', typeJobPrefs: '' };
}

/** typeJobPrefs: deselected job ids per type, e.g. "f:id1,id2;v:id3" */
function parseTypeJobPrefs(str) {
  const map = new Map();
  for (const part of String(str || '').split(';')) {
    if (!part) continue;
    const colon = part.indexOf(':');
    if (colon < 1) continue;
    const code = part.slice(0, colon).trim().toLowerCase();
    if (!VOLUNTEER_JOB_TYPE_CODES.includes(code)) continue;
    map.set(code, parseCsvParam(part.slice(colon + 1)));
  }
  return map;
}

function serializeTypeJobPrefs(map) {
  return [...map.entries()]
    .filter(([, set]) => set.size)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, set]) => `${code}:${[...set].sort().join(',')}`)
    .join(';');
}

function mergeTypeJobPrefs(prefsStr, code, deselectedIds) {
  const map = parseTypeJobPrefs(prefsStr);
  const deselected = deselectedIds.filter(Boolean);
  if (!deselected.length) map.delete(code);
  else map.set(code, new Set(deselected));
  return serializeTypeJobPrefs(map);
}

function volunteerSearchByTypeExcludedForType(prefsStr, code) {
  return parseTypeJobPrefs(prefsStr).get(code) || new Set();
}

function volunteerSearchByTypeSaveTypePrefs(state, ctx) {
  if (!state.jobType || state.jobsAll === '1') return state.typeJobPrefs || '';
  const allIds = volunteerSearchByTypeTypeJobIds(ctx, state.jobType);
  const selected = parseCsvParam(state.selectedJobs);
  const deselected = allIds.filter((id) => !selected.has(id));
  return mergeTypeJobPrefs(state.typeJobPrefs, state.jobType, deselected);
}

function volunteerSearchByTypeSelectedIdsForType(ctx, code, prefsStr) {
  const allIds = volunteerSearchByTypeTypeJobIds(ctx, code);
  const excluded = volunteerSearchByTypeExcludedForType(prefsStr, code);
  return allIds.filter((id) => !excluded.has(id));
}

function volunteerSearchByTypeNormalizeState(params) {
  if (params.filterReset === '1' || params.allJobsTap === '1') {
    return volunteerSearchByTypeDefaultState();
  }
  const jobType = volunteerSearchJobTypeParam(params);
  const selectedJobs = String(params.selectedJobs || '').trim();
  const typeJobPrefs = String(params.typeJobPrefs || '').trim();
  const rawJobsAll = params.jobsAll;
  // Honor job-type selection even when a stale client still sends jobsAll=1.
  if (jobType) {
    return { jobType, jobsAll: '0', selectedJobs, typeJobPrefs };
  }
  if (rawJobsAll === '1' || rawJobsAll === 1) {
    return volunteerSearchByTypeDefaultState();
  }
  let jobsAll = volunteerSearchJobsAllParam(params);
  if (jobsAll === '1') {
    return volunteerSearchByTypeDefaultState();
  }
  if (jobsAll === '0' && !selectedJobs) {
    jobsAll = '1';
  }
  return { jobType: '', jobsAll, selectedJobs, typeJobPrefs };
}

function volunteerSearchByTypeTypeJobIds(ctx, code) {
  return volunteerHomeSearchJobsList(ctx)
    .filter((j) => j.jobType === code)
    .map((j) => j.id);
}

function volunteerSearchByTypeNextOnTypeTap(state, code, ctx) {
  const prefs = volunteerSearchByTypeSaveTypePrefs(state, ctx);
  if (state.jobType === code && state.jobsAll === '0') {
    const allIds = volunteerSearchByTypeTypeJobIds(ctx, code);
    return {
      jobType: code,
      jobsAll: '0',
      selectedJobs: allIds.join(','),
      typeJobPrefs: mergeTypeJobPrefs(prefs, code, []),
    };
  }
  const selectedIds = volunteerSearchByTypeSelectedIdsForType(ctx, code, prefs);
  return {
    jobType: code,
    jobsAll: '0',
    selectedJobs: selectedIds.join(','),
    typeJobPrefs: prefs,
  };
}

function volunteerSearchByTypeNextOnAllJobsTap(state, ctx) {
  return {
    jobType: '',
    jobsAll: '1',
    selectedJobs: '',
    typeJobPrefs: '',
    filterReset: '1',
  };
}

function volunteerSearchByTypeNextOnJobTap(state, jobId, ctx) {
  const prefs = state.typeJobPrefs || '';
  if (state.jobsAll === '1') {
    return { jobType: '', jobsAll: '0', selectedJobs: jobId, typeJobPrefs: prefs };
  }
  const set = parseCsvParam(state.selectedJobs);
  if (set.has(jobId)) set.delete(jobId);
  else set.add(jobId);
  let nextPrefs = prefs;
  if (state.jobType) {
    const allTypeIds = volunteerSearchByTypeTypeJobIds(ctx, state.jobType);
    const deselected = allTypeIds.filter((id) => !set.has(id));
    nextPrefs = mergeTypeJobPrefs(prefs, state.jobType, deselected);
  }
  if (!state.jobType && !set.size) {
    return { jobType: '', jobsAll: '1', selectedJobs: '', typeJobPrefs: nextPrefs };
  }
  return {
    jobType: state.jobType,
    jobsAll: '0',
    selectedJobs: [...set].sort().join(','),
    typeJobPrefs: nextPrefs,
  };
}

function volunteerSearchByTypeFilterPayload(base, daysState, typeState, returnTo) {
  const out = {
    ...base,
    daysAll: daysState.daysAll,
    selectedDays: daysState.selectedDays || '',
    jobsAll: typeState.jobsAll,
    selectedJobs: typeState.selectedJobs || '',
    jobType: typeState.jobType || '',
    typeJobPrefs: typeState.typeJobPrefs || '',
  };
  if (typeState.filterReset === '1') out.filterReset = '1';
  if (typeState.allJobsTap === '1') out.allJobsTap = '1';
  return volunteerHomeWithReturnTo(out, returnTo);
}

function volunteerSearchByTypeJobSelected(typeState, jobId) {
  if (typeState.jobsAll === '1') return false;
  return parseCsvParam(typeState.selectedJobs).has(jobId);
}

function volunteerSearchByTypeJobsVisible(ctx, typeState) {
  const all = volunteerHomeSearchJobsList(ctx);
  if (typeState.jobType) return all.filter((j) => j.jobType === typeState.jobType);
  return all;
}

function volunteerSearchByTypeSearchEnabled(typeState) {
  return typeState.jobsAll === '1' || Boolean(typeState.jobType) || Boolean(String(typeState.selectedJobs || '').trim());
}

function volunteerSearchOpenShiftsPayload(base, params, returnTo = 'jewelheart.home') {
  return volunteerSearchFilterPayloadFromParams(base, params, returnTo);
}

function volunteerSearchResolveTargetDayIsos(params, retreat, todayIso) {
  const dayIsos = volunteerHomeSearchDayIsos(retreat, todayIso);
  if (volunteerSearchJobTypeParam(params)) {
    const daysState = volunteerSearchNormalizeDaysState(params, dayIsos, todayIso);
    if (daysState.daysAll === '1') return dayIsos;
    const picked = parseCsvParam(daysState.selectedDays);
    return dayIsos.filter((iso) => picked.has(iso));
  }
  const findState = volunteerFindFilterFromParams(params, dayIsos);
  return volunteerFindFilterDayIsos(findState, dayIsos);
}

function volunteerSearchResolveTargetJobIds(params, searchJobs) {
  const jobType = volunteerSearchJobTypeParam(params);
  const selectedJobs = String(params.selectedJobs || '').trim();
  const selectedSet = parseCsvParam(selectedJobs);
  if (jobType) {
    const jobsAll = volunteerSearchJobsAllParam(params);
    if (jobsAll === '1') return searchJobs.map((j) => j.id);
    const typeIds = new Set(searchJobs.filter((j) => j.jobType === jobType).map((j) => j.id));
    if (selectedSet.size) return [...selectedSet].filter((id) => typeIds.has(id));
    return [...typeIds];
  }
  const findState = volunteerFindFilterFromParams(params, ['__find__', '__multi__']);
  return volunteerFindFilterJobIds(findState, searchJobs);
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

function volunteerHomeBar(content, backgroundColor, textColor, action = undefined, options = {}) {
  const homeActionPill = options.homeActionPill === true;
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
      ...volunteerHomeBarStyle(backgroundColor),
      homeActionPill,
      fullBleed: !homeActionPill,
      borderRadius: homeActionPill ? VOLUNTEER_HOME_PILL_RADIUS : undefined,
      buttonVariant: homeActionPill ? 'raised' : undefined,
      elevation: homeActionPill ? VOLUNTEER_HOME_BUTTON_ELEVATION_DP : undefined,
    },
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
  'jewelheart.volunteer.searchByType': 'Find open shifts by job type',
  'jewelheart.volunteer.assign': 'Open shifts',
  'jewelheart.volunteer.shift': 'Shift',
  'jewelheart.volunteer.messages': 'Announcements',
  'jewelheart.volunteer.mine': 'My assigned shifts',
  'jewelheart.volunteer.account': 'Account',
  'jewelheart.volunteer.preferences': 'Preferences',
  'jewelheart.volunteer.manage': 'Manage',
  'jewelheart.volunteer.admin': 'Admin',
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
  if (backTarget === 'jewelheart.volunteer.search' || backTarget === 'jewelheart.volunteer.searchByType' || backTarget === 'jewelheart.volunteer.assign') {
    if (backTarget === 'jewelheart.volunteer.search' || backTarget === 'jewelheart.volunteer.searchByType') {
      p.returnTo = 'jewelheart.home';
    }
    if (backTarget === 'jewelheart.volunteer.assign') p.returnTo = 'jewelheart.home';
    if (params.daysAll != null) p.daysAll = String(params.daysAll);
    if (params.selectedDays != null) p.selectedDays = String(params.selectedDays);
    if (params.jobsAll != null) p.jobsAll = String(params.jobsAll);
    if (params.selectedJobs != null) p.selectedJobs = String(params.selectedJobs);
    if (params.jobType != null) p.jobType = String(params.jobType);
    if (params.typeJobPrefs != null) p.typeJobPrefs = String(params.typeJobPrefs);
  }
  return p;
}

/** Bottom nav with ← Home only (Find/Open shifts flows start over from Home). */
function volunteerHomeOnlyHomeNavRow(params = {}) {
  return volunteerHomeStandardFooterNav(params);
}

function volunteerHomeNavIconButton(icon, actionOrTarget, payload) {
  const action =
    typeof actionOrTarget === 'object' && actionOrTarget !== null
      ? actionOrTarget
      : { type: 'navigate', target: actionOrTarget, payload: payload || {} };
  return {
    type: 'button',
    icon,
    label: icon === 'nav_back' ? '←' : icon === 'nav_home' ? '⌂' : '',
    content: icon === 'nav_back' ? '←' : icon === 'nav_home' ? '⌂' : '',
    action,
    textStyle: {
      fontSize: 20,
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#FFFFFF',
    },
    style: {
      backgroundColor: volunteerHomeSummaryBlue,
      borderRadius: VOLUNTEER_HOME_PILL_RADIUS,
      buttonVariant: 'raised',
      elevation: VOLUNTEER_HOME_BUTTON_ELEVATION_DP,
      height: { value: VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP },
      width: { value: 48 },
      padding: { top: 0, bottom: 0, left: 8, right: 8 },
      navIcon: true,
    },
  };
}

function volunteerHomeFooterLabeledButtons(params = {}) {
  const labeledReturnTo = params.labeledReturnTo || params.returnTo;
  if (!labeledReturnTo || labeledReturnTo === 'jewelheart.home') return [];
  const label = volunteerHomeScreenBackLabel(labeledReturnTo);
  return [
    volunteerHomePillButton(
      `← ${label}`,
      labeledReturnTo,
      volunteerHomeBackPayload(params, labeledReturnTo),
      volunteerHomeSummaryBlue,
      '#FFFFFF',
      { hPad: 10 },
    ),
  ];
}

/** Fixed bottom nav: ← (history back), ⌂ (home), optional labeled ← jumps. */
function volunteerHomeStandardFooterNav(params = {}) {
  const homePayload = params.retreatId ? { retreatId: String(params.retreatId) } : {};
  return {
    type: 'container',
    layout: 'row',
    spacing: 8,
    textStyle: { textAlign: 'center' },
    style: { padding: { top: 8, bottom: 8, left: 8, right: 8 }, fixedFooter: true },
    children: [
      volunteerHomeNavIconButton('nav_back', { type: 'navBack' }),
      volunteerHomeNavIconButton('nav_home', 'jewelheart.home', homePayload),
      ...volunteerHomeFooterLabeledButtons(params),
    ],
  };
}

function volunteerHomeCancelPill(target, payload) {
  return volunteerHomePillButton(
    'Cancel',
    target,
    payload,
    volunteerHomeSummaryBlue,
    '#FFFFFF',
    { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
  );
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
  const disabled = options.disabled === true;
  const noAction = options.noAction === true;
  const node = {
    type: 'button',
    content: label,
    label,
    textStyle: {
      fontSize,
      fontWeight: 'bold',
      textAlign: 'center',
      color: textColor,
    },
    style: {
      backgroundColor,
      borderRadius: options.borderRadius ?? VOLUNTEER_HOME_PILL_RADIUS,
      buttonVariant: disabled || noAction ? undefined : 'raised',
      elevation: disabled || noAction ? 0 : (options.elevation ?? VOLUNTEER_HOME_BUTTON_ELEVATION_DP),
      height: { value: VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP },
      padding: { top: 0, bottom: 0, left: hPad, right: hPad },
      parentCentered: options.parentCentered === true,
      homeActionPill: options.homeActionPill === true,
      homeActionPillFullWidth: options.homeActionPillFullWidth === true,
    },
  };
  if (!disabled && !noAction) {
    node.action = options.action || { type: 'navigate', target, payload };
  }
  return node;
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
  return volunteerHomeCenteredPill(label, target, payload, volunteerHomeMaroon, '#FFFFFF', {
    homeActionPill: true,
  });
}

/** Gold home actions — same pill geometry as maroon footer buttons. */
function volunteerHomeCenteredGoldAction(label, target, payload = {}, options = {}) {
  return volunteerHomeCenteredPill(label, target, payload, volunteerHomeGold, '#000000', {
    hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
    homeActionPill: true,
    homeActionPillFullWidth: true,
    ...options,
  });
}

function volunteerHomeAdminWorkspaceButton() {
  return volunteerHomeCenteredPill(
    'Admin',
    'jewelheart.home',
    {},
    volunteerHomeSummaryBlue,
    '#FFFFFF',
    {
      hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
      action: { type: 'adminWorkspace' },
    },
  );
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
function volunteerHomeTopBlueBars(ctx, secondLineText = null, options = {}) {
  const retreatLine = ctx.retreatBannerLine;
  let secondLine;
  if (secondLineText != null) {
    secondLine = options.alreadyFitted
      ? String(secondLineText)
      : volunteerHomeFitLine(
          String(secondLineText),
          VOLUNTEER_HOME_MAX_BAR_CHARS,
          ctx.layoutWarnings,
          options.warnCode || 'header_line',
        );
  } else {
    secondLine = ctx.volunteerHomeLine;
  }
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

function volunteerHomeCenteredInlineRow(children, options = {}) {
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
        spacing: options.spacing ?? 6,
        textStyle: { textAlign: 'center' },
        style: {
          padding: { top: 0, bottom: 0, left: 6, right: 6 },
          noWrap: options.noWrap === true,
        },
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
  return volunteerHomeCenteredGoldAction(
    label,
    'jewelheart.volunteer.messages',
    basePayload,
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
    {
      hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
      homeActionPill: true,
      homeActionPillFullWidth: true,
      parentCentered: true,
    },
  );
}

/** One check-in pill per row — same centered sizing as maroon home actions. */
function volunteerHomeTodayShiftButtons(ctx, checkInPayload) {
  const blocks = [];
  ctx.todayShifts.forEach((row, index) => {
    if (index > 0) blocks.push(volunteerHomeGap());
    const payload = { ...checkInPayload };
    if (row.taskId) payload.taskId = row.taskId;
    blocks.push(
      volunteerHomeCenteredGoldAction(
        row.label,
        'jewelheart.volunteer.checkin',
        volunteerHomeWithReturnTo(payload, 'jewelheart.home'),
      ),
    );
  });
  return blocks;
}

/** Disabled maroon pill (no action) — used for Coming soon / non-admin Manage. */
function volunteerHomeDisabledMaroonPill(label) {
  const pill = volunteerHomePillButton(
    label,
    'jewelheart.home',
    {},
    volunteerHomeLightMaroon,
    '#FFFFFF',
    { hPad: VOLUNTEER_HOME_BUTTON_H_PAD, disabled: true },
  );
  return {
    type: 'container',
    layout: 'column',
    spacing: 0,
    textStyle: { textAlign: 'center' },
    style: { padding: { top: 0, bottom: 0, left: 0, right: 0 } },
    children: [{ ...pill, style: { ...pill.style, parentCentered: true } }],
  };
}

/** Home footer: three maroon actions, Acct/Prefs row, Manage/Admin row. */
function volunteerHomeStationaryActions(ctx, searchPayload, access) {
  const homePayload = volunteerHomeWithReturnTo(searchPayload, 'jewelheart.home');
  const typeSearchPayload = volunteerHomeWithReturnTo(
    {
      ...(ctx.retreatId ? { retreatId: ctx.retreatId } : {}),
      ...volunteerSearchFilterResetState(),
    },
    'jewelheart.home',
  );
  const adminPayload = ctx.retreatId ? { retreatId: ctx.retreatId } : {};
  const items = [
    volunteerHomeCenteredAction(
      'Find and sign up for open shifts',
      'jewelheart.volunteer.search',
      homePayload,
    ),
  ];
  if (!access.testersChannel) {
    items.push(
      volunteerHomeGap(),
      volunteerHomeCenteredAction(
        'Find open shifts by job type',
        'jewelheart.volunteer.searchByType',
        typeSearchPayload,
      ),
    );
  }
  items.push(
    volunteerHomeGap(),
    volunteerHomeCenteredAction(
      'Review / edit my assigned shifts',
      'jewelheart.volunteer.mine',
      homePayload,
    ),
    volunteerHomeGap(),
    volunteerHomeAccountPreferencesRow(ctx),
  );
  const manageAdmin = volunteerHomeManageAdminRow(ctx, access);
  if (manageAdmin) {
    items.push(volunteerHomeGap(), manageAdmin);
  }
  return items;
}

function volunteerHomeManageAdminRow(ctx, access) {
  const basePayload = volunteerHomeWithReturnTo(
    ctx.retreatId ? { retreatId: ctx.retreatId } : {},
    'jewelheart.home',
  );
  const buttons = [];
  if (access.isManager || access.isAdmin) {
    buttons.push(
      volunteerHomeSmallBlueButton('Manage', 'jewelheart.volunteer.manage', basePayload),
    );
  }
  if (access.isAdmin) {
    buttons.push(
      volunteerHomePillButton(
        'Admin',
        'jewelheart.home',
        {},
        volunteerHomeSummaryBlue,
        '#FFFFFF',
        {
          hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          action: { type: 'adminWorkspace' },
        },
      ),
    );
  }
  if (!buttons.length) return null;
  return volunteerHomeCenteredInlineRow(buttons, { noWrap: true, spacing: 8 });
}

/** Yellow summary bar + framed scroll region for today check-in pills. */
function volunteerHomeTodayShiftPanel(ctx, checkInPayload) {
  const todayShiftWord = ctx.todayCount === 1 ? 'shift' : 'shifts';
  const summaryBar = volunteerHomeBar(
    `${ctx.todayCount} ${todayShiftWord} left today${VOLUNTEER_HOME_EN_DASH}tap to check in`,
    volunteerHomeGold,
    '#000000',
  );
  const minScrollHeight = ctx.todayCount >= 2
    ? VOLUNTEER_HOME_TODAY_SCROLL_MIN_HEIGHT_DP
    : VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP;
  return {
    headerBar: summaryBar,
    scroll: {
      type: 'todayShiftScroll',
      layout: 'column',
      spacing: 0,
      style: {
        borderColor: volunteerHomeGold,
        minHeight: { value: minScrollHeight },
        flexGrow: true,
      },
      children: volunteerHomeTodayShiftButtons(ctx, checkInPayload),
    },
  };
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
  const past = options.past === true;
  const disabled = options.disabled === true || past;
  const displayLabel = disabled && !past ? `× ${label}` : label;
  const multiline = options.multiline === true || String(displayLabel).includes('\n');
  let bg;
  if (past) bg = volunteerHomeMediumGray;
  else if (selected && !disabled) bg = volunteerHomeMaroon;
  else bg = volunteerHomeLightMaroon;
  const node = {
    type: 'button',
    label: displayLabel,
    content: displayLabel,
    textStyle: {
      fontSize: options.fontSize ?? 14,
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
      padding: { top: 0, bottom: 0, left: options.hPad ?? 8, right: options.hPad ?? 8 },
      multiline,
    },
  };
  if (!disabled && options.noAction !== true) {
    node.action = { type: 'navigate', target, payload };
  }
  return node;
}

function volunteerHomeWrappedFilterRow(buttons, options = {}) {
  const sidePad = options.sidePad ?? 6;
  const style = { padding: { top: 0, bottom: 0, left: sidePad, right: sidePad }, wrapChildren: true };
  // compactWrap: hint to clients (iOS grid) to pack narrow pills so a full week fits one line.
  if (options.compactWrap === true) style.compactWrap = true;
  return {
    type: 'container',
    layout: 'flowRow',
    spacing: options.spacing ?? 6,
    textStyle: { textAlign: 'center' },
    style,
    children: buttons,
  };
}

function volunteerHomeSearchRunButton(target, payload) {
  return volunteerHomePillButton('Search', target, payload, volunteerHomeMaroon, '#FFFFFF', {
    hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
  });
}

function volunteerHomeSearchRunButtonDisabled() {
  return volunteerHomePillButton(
    'Search',
    'jewelheart.home',
    {},
    volunteerHomeMediumGray,
    '#FFFFFF',
    { hPad: VOLUNTEER_HOME_BUTTON_H_PAD, disabled: true },
  );
}

/** Job button scroll region — plain container so older web renderers still show buttons. */
function volunteerHomeJobListScroll(children) {
  return {
    type: 'container',
    layout: 'column',
    spacing: 0,
    style: {
      jobListFrame: true,
      borderColor: volunteerHomeMaroon,
      flexGrow: true,
      padding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    children,
  };
}

function volunteerHomeTypeFilterRow(buttons) {
  return {
    type: 'container',
    layout: 'flowRow',
    spacing: 4,
    textStyle: { textAlign: 'center' },
    style: { padding: { top: 0, bottom: 0, left: 4, right: 4 }, wrapChildren: true, typeFilterRow: true },
    children: buttons,
  };
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
  'jewelheart.volunteer.searchByType': 'Find open shifts by job type',
  'jewelheart.volunteer.assign': 'Open shifts',
  'jewelheart.volunteer.manage': 'Manage',
  'jewelheart.volunteer.admin': 'Admin',
};

function volunteerHomeBuildStampText() {
  return {
    type: 'text',
    content: `api ${VOLUNTEER_SDUI_BUILD_STAMP}`,
    textStyle: { fontSize: 10, textAlign: 'center', color: '#888888' },
  };
}

function volunteerHomeScreenEnvelope(id, title, children, layoutWarnings = [], extraMeta = {}) {
  const isHome = id === 'jewelheart.home';
  const homeSplit = isHome && extraMeta.homeSplitLayout === true;
  const stickyHeaderComponents = extraMeta.stickyHeaderComponents || [];
  let stickyFooterComponents = extraMeta.stickyFooterComponents || [];
  if (!isHome && extraMeta.includeFooterNav !== false && !stickyFooterComponents.length) {
    stickyFooterComponents = [volunteerHomeStandardFooterNav(extraMeta.navParams || {})];
  }
  const stickyFooter = homeSplit || extraMeta.stickyFooter === true || stickyFooterComponents.length > 0;
  const stickyHeader = homeSplit || extraMeta.stickyHeader === true;
  const layoutFlat = extraMeta.layoutFlat === true || homeSplit;
  if (homeSplit) {
    const flatComponents = layoutFlat
      ? [...stickyHeaderComponents, ...(extraMeta.scrollChildren || []), ...stickyFooterComponents]
      : extraMeta.scrollChildren || [];
    return {
      id,
      title: VOLUNTEER_SCREEN_TITLES[id] || title || 'JewelHeart',
      metadata: {
        app: 'jewelheart',
        buildStamp: VOLUNTEER_SDUI_BUILD_STAMP,
        layoutWarnings,
        minWidthDp: VOLUNTEER_HOME_MIN_WIDTH_DP,
        edgeToEdgeBars: true,
        homeSplitLayout: true,
        layoutFlat,
        stickyFooter: layoutFlat ? false : stickyFooter,
        stickyFooterComponents: layoutFlat ? [] : stickyFooterComponents,
        stickyHeader: layoutFlat ? false : stickyHeader,
        stickyHeaderComponents: layoutFlat ? [] : stickyHeaderComponents,
        filterState: extraMeta.filterState || null,
      },
      components: flatComponents,
    };
  }
  const useFlatSticky = layoutFlat && stickyHeaderComponents.length > 0;
  const bodyChildren = useFlatSticky ? [...stickyHeaderComponents, ...children] : children;
  return {
    id,
    title: VOLUNTEER_SCREEN_TITLES[id] || title || 'JewelHeart',
    metadata: {
      app: 'jewelheart',
      buildStamp: VOLUNTEER_SDUI_BUILD_STAMP,
      layoutWarnings,
      minWidthDp: VOLUNTEER_HOME_MIN_WIDTH_DP,
      edgeToEdgeBars: isHome,
      layoutFlat: useFlatSticky,
      stickyFooter,
      stickyFooterComponents,
      stickyHeader: useFlatSticky ? false : stickyHeader,
      stickyHeaderComponents: useFlatSticky ? [] : stickyHeaderComponents,
      filterState: extraMeta.filterState || null,
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
        children: bodyChildren,
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

/** Global admin? (membership in jewelheart_admins by Firebase UID — e.g. Lewis, Woods.) */
async function volunteerHomeIsAdmin(firebaseUid) {
  if (!firebaseUid) return false;
  try {
    const { rows } = await query('SELECT 1 FROM jewelheart_admins WHERE firebase_uid = $1', [firebaseUid]);
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Retreat manager? (jewelheart_managers — app-internal ops such as poster generation.) */
async function volunteerHomeIsManager(firebaseUid) {
  if (!firebaseUid) return false;
  try {
    const { rows } = await query('SELECT 1 FROM jewelheart_managers WHERE firebase_uid = $1', [firebaseUid]);
    return rows.length > 0;
  } catch {
    return false;
  }
}

function volunteerHomeMapTodayShifts(rawTodayShifts, layoutWarnings) {
  return rawTodayShifts.map((row, index) => {
    const name = volunteerHomeDisplayJobName(row.jobTitle || row.label);
    const label = row.dayIso
      ? volunteerHomeDayJobLabel(name, row.dayIso, VOLUNTEER_HOME_MAX_BAR_CHARS, layoutWarnings, `today_shift_${index}`)
      : volunteerHomeFitLine(name, VOLUNTEER_HOME_MAX_BAR_CHARS, layoutWarnings, `today_shift_${index}`);
    return { taskId: row.taskId, label };
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
    volunteerHomeRetreatBannerLine(effectiveRetreat, todayIso),
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    layoutWarnings,
    'retreat_banner',
  );
  const homeShiftWord = shiftCount === 1 ? 'shift' : 'shifts';
  const volunteerHomeLine = volunteerHomeFitLine(
    `Home${VOLUNTEER_HOME_EN_DASH}signed up for ${shiftCount} ${homeShiftWord}`,
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
export async function gatherVolunteerHomeContext(firebaseUid, authToken = undefined, options = {}) {
  const explicitRetreatId = options.retreatId ? String(options.retreatId).trim() : '';
  const tz = jewelheartDefaultTimeZoneId;
  const todayIso = volunteerHomeDemoTodayIso(tz);

  if (volunteerHomePinSummer2026Demo()) {
    // Use the resolved today (JEWELHEART_VOLUNTEER_HOME_TEST_TODAY override → demo pin → real).
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
      const picked = volunteerHomePickRetreatFromList(retreats, todayIso, explicitRetreatId);
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
          jobs = volunteerHomeSortJobs(jobRes?.items || []);
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
    retreat = volunteerHomePickRetreatFromList(retreats, todayIso, explicitRetreatId);
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
          jobs = volunteerHomeSortJobs(jobRes?.items || []);
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
export async function buildJewelheartHomeScreen(firebaseUid, authToken = undefined, params = {}) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const isManager = await volunteerHomeIsManager(firebaseUid);
  const testersChannel = volunteerHomeIsTestersChannel(params);

  const searchPayload = volunteerHomeWithReturnTo(
    {
      ...(ctx.retreatId ? { retreatId: ctx.retreatId } : {}),
      ...volunteerSearchFilterResetState(),
    },
    'jewelheart.home',
  );
  const checkInPayload = { ...searchPayload };

  const todayPanel = ctx.todayCount > 0
    ? volunteerHomeTodayShiftPanel(ctx, checkInPayload)
    : null;

  const headerChildren = [
    {
      type: 'container',
      layout: 'column',
      spacing: 0,
      style: { padding: { top: 6, bottom: 0, left: 0, right: 0 } },
      children: [
        ...volunteerHomeTopBlueBars(ctx),
      ],
    },
  ];

  const scrollChildren = todayPanel
    ? [
        volunteerHomeGap(),
        todayPanel.headerBar,
        volunteerHomeGap(),
        todayPanel.scroll,
      ]
    : [];

  const footerExtras = [];
  if (ctx.errorNote) {
    footerExtras.push({
      type: 'text',
      content: ctx.errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }
  if (ctx.usingDemo && !volunteerHomePinSummer2026Demo()) {
    footerExtras.push({
      type: 'text',
      content: 'Demo schedule — link volunteer for live data.',
      textStyle: { fontSize: 11, textAlign: 'center', color: '#666666' },
    });
  }
  footerExtras.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  footerExtras.push(volunteerHomeBuildStampText());

  const footerChildren = [
    {
      type: 'container',
      layout: 'column',
      spacing: 0,
      style: { padding: { top: 0, bottom: 6, left: 0, right: 0 } },
      children: [
        volunteerHomeGap(),
        ...volunteerHomeStationaryActions(ctx, searchPayload, { isAdmin, isManager, testersChannel }),
        ...footerExtras,
      ],
    },
  ];

  return volunteerHomeScreenEnvelope('jewelheart.home', 'JewelHeart', [], ctx.layoutWarnings, {
    homeSplitLayout: true,
    stickyHeaderComponents: headerChildren,
    stickyFooterComponents: footerChildren,
    scrollChildren,
  });
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
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const retreatId = params.retreatId || ctx.retreatId || '';
  const retreat = ctx.retreat || VOLUNTEER_HOME_DEFAULT_RETREAT;
  const dayIsos = volunteerHomeSearchDayIsos(retreat, ctx.todayIso);
  const lastDayOnly = dayIsos.length === 1;
  const filter = volunteerFindFilterFromParams(params, dayIsos);
  const selectedDaySet = parseCsvParam(filter.selectedDays);
  const selectedJobSet = parseCsvParam(filter.selectedJobs);

  const navParams = {
    retreatId: retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
    daysAll: filter.daysAll,
    selectedDays: filter.selectedDays,
    daysPrev: filter.daysPrev,
    jobsAll: filter.jobsAll,
    selectedJobs: filter.selectedJobs,
    jobsPrev: filter.jobsPrev,
  };
  const basePayload = retreatId ? { retreatId } : {};
  const searchTarget = 'jewelheart.volunteer.search';
  const assignTarget = 'jewelheart.volunteer.assign';

  const headerChildren = [
    ...volunteerHomeHeaderChildren(ctx, 'Find open shifts by filter'),
    volunteerHomeGap(),
    volunteerHomeCenteredInlineRow([
      volunteerHomeSearchRunButton(
        assignTarget,
        volunteerFindFilterToPayload(basePayload, filter, 'jewelheart.home'),
      ),
      volunteerHomeCancelPill('jewelheart.home', basePayload),
    ]),
    volunteerHomeGap(),
  ];

  // "All days" gets its own row (like "All jobs"); the weekday pills get a tight row of
  // their own so the whole week fits on one line on a phone.
  if (!lastDayOnly) {
    const allSelected = filter.daysAll === '1';
    const allDaysButton = volunteerHomeFilterToggleButton(
      'All days',
      allSelected,
      searchTarget,
      volunteerFindFilterToPayload(
        basePayload,
        volunteerFindFilterNextDaysAllTap(filter, ctx.todayIso, dayIsos),
        navParams.returnTo,
      ),
      { noAction: volunteerFindFilterAllDaysNoAction(filter) },
    );
    headerChildren.push(volunteerHomeWrappedFilterRow([allDaysButton]), volunteerHomeGap());
  }
  const dayPills = [];
  const allDayIsos = volunteerHomeRetreatDates(retreat || VOLUNTEER_HOME_DEFAULT_RETREAT);
  for (const iso of allDayIsos) {
    const label = volunteerHomeWeekdayShort(iso);
    if (iso < ctx.todayIso) {
      dayPills.push(
        volunteerHomeFilterToggleButton(label, false, searchTarget, basePayload, { past: true, hPad: 5 }),
      );
      continue;
    }
    const selected = lastDayOnly || (filter.daysAll === '0' && selectedDaySet.has(iso));
    dayPills.push(
      volunteerHomeFilterToggleButton(
        label,
        selected,
        searchTarget,
        volunteerFindFilterToPayload(
          basePayload,
          volunteerFindFilterNextDaysOnDayTap(filter, iso, dayIsos),
          navParams.returnTo,
        ),
        { disabled: lastDayOnly, noAction: lastDayOnly, hPad: 5 },
      ),
    );
  }
  if (dayPills.length) {
    headerChildren.push(
      volunteerHomeWrappedFilterRow(dayPills, { spacing: 4, sidePad: 4, compactWrap: true }),
      volunteerHomeGap(),
    );
  }

  const allJobsSelected = filter.jobsAll === '1';
  const allJobsButton = volunteerHomeFilterToggleButton(
    'All jobs',
    allJobsSelected,
    searchTarget,
    volunteerFindFilterToPayload(
      basePayload,
      volunteerFindFilterNextJobsAllTap(filter),
      navParams.returnTo,
    ),
    { noAction: volunteerFindFilterAllJobsNoAction(filter) },
  );
  headerChildren.push(volunteerHomeWrappedFilterRow([allJobsButton]), volunteerHomeGap());

  const scrollChildren = [];
  const jobButtons = [];
  const searchJobsList = volunteerHomeSearchJobsList(ctx);
  const jobIdOrder = searchJobsList.map((j) => j.id);
  for (const job of searchJobsList) {
    const selected = filter.jobsAll === '0' && selectedJobSet.has(job.id);
    const abbrev = volunteerHomeJobFilterLabel(job, ctx.layoutWarnings, `job_abbrev_${job.id}`);
    jobButtons.push(
      volunteerHomeFilterToggleButton(
        abbrev,
        selected,
        searchTarget,
        volunteerFindFilterToPayload(
          basePayload,
          volunteerFindFilterNextJobsOnJobTap(filter, job.id, jobIdOrder),
          navParams.returnTo,
        ),
      ),
    );
  }
  scrollChildren.push(
    volunteerHomeJobListScroll([volunteerHomeWrappedFilterRow(jobButtons)]),
  );

  if (ctx.errorNote) {
    headerChildren.push({
      type: 'text',
      content: ctx.errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }
  headerChildren.push(volunteerHomeBuildStampText());

  // System (layout) warnings render at the very bottom, after the nav-back footer.
  const footerComponents = [
    volunteerHomeStandardFooterNav(navParams),
    ...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings),
  ];

  return volunteerHomeScreenEnvelope('jewelheart.volunteer.search', 'JewelHeart', scrollChildren, ctx.layoutWarnings, {
    layoutFlat: true,
    stickyHeaderComponents: headerChildren,
    stickyFooterComponents: footerComponents,
    navParams,
    filterState: filter,
  });
}

const VOLUNTEER_JOB_TYPE_BUTTONS = [
  { code: 'f', label: 'Food\nareas' },
  { code: 'v', label: 'Vac-\nuum' },
  { code: 'b', label: 'Bath-\nrooms' },
  { code: 'm', label: 'Misc' },
];

/**
 * Find open shifts by job type — type radio filters + persistent per-job toggles.
 * @param {object} params - selectedDays, selectedJobs, jobType, jobsAll, daysAll, retreatId
 */
export async function buildJewelheartVolunteerSearchByTypeScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  if (volunteerHomeIsTestersChannel(params)) {
    const homeParams = { ...params };
    delete homeParams.uiChannel;
    return buildJewelheartHomeScreen(firebaseUid, authToken, homeParams);
  }
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const retreatId = params.retreatId || ctx.retreatId || '';
  const retreat = ctx.retreat || VOLUNTEER_HOME_DEFAULT_RETREAT;
  const dayIsos = volunteerHomeSearchDayIsos(retreat, ctx.todayIso);
  const lastDayOnly = dayIsos.length === 1;
  const daysState = volunteerSearchNormalizeDaysState(params, dayIsos, ctx.todayIso);
  const typeState = volunteerSearchByTypeNormalizeState(params);
  const selectedDaySet = parseCsvParam(daysState.selectedDays);

  const navParams = {
    retreatId: retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
    daysAll: daysState.daysAll,
    selectedDays: daysState.selectedDays,
    jobsAll: typeState.jobsAll,
    selectedJobs: typeState.selectedJobs,
    jobType: typeState.jobType,
    typeJobPrefs: typeState.typeJobPrefs,
  };
  const basePayload = retreatId ? { retreatId } : {};
  const searchTarget = 'jewelheart.volunteer.searchByType';
  const assignTarget = 'jewelheart.volunteer.assign';
  const searchEnabled = volunteerSearchByTypeSearchEnabled(typeState);

  const headerChildren = [
    ...volunteerHomeHeaderChildren(ctx, 'Find open shifts by job type'),
    volunteerHomeGap(),
    volunteerHomeCenteredInlineRow([
      searchEnabled
        ? volunteerHomeSearchRunButton(
            assignTarget,
            volunteerSearchByTypeFilterPayload(basePayload, daysState, typeState, 'jewelheart.home'),
          )
        : volunteerHomeSearchRunButtonDisabled(),
      volunteerHomeCancelPill('jewelheart.home', basePayload),
    ]),
    volunteerHomeGap(),
  ];

  const dayButtons = [];
  if (!lastDayOnly) {
    const allSelected = daysState.daysAll === '1';
    dayButtons.push(
      volunteerHomeFilterToggleButton(
        'All days',
        allSelected,
        searchTarget,
        volunteerSearchByTypeFilterPayload(
          basePayload,
          volunteerSearchNextDaysOnAllTap(daysState, ctx.todayIso, dayIsos),
          typeState,
          navParams.returnTo,
        ),
      ),
    );
  }
  const allDayIsos = volunteerHomeRetreatDates(retreat || VOLUNTEER_HOME_DEFAULT_RETREAT);
  for (const iso of allDayIsos) {
    const label = volunteerHomeWeekdayShort(iso);
    if (iso < ctx.todayIso) {
      dayButtons.push(
        volunteerHomeFilterToggleButton(label, false, searchTarget, basePayload, { past: true }),
      );
      continue;
    }
    const selected = lastDayOnly || (daysState.daysAll === '0' && selectedDaySet.has(iso));
    dayButtons.push(
      volunteerHomeFilterToggleButton(
        label,
        selected,
        searchTarget,
        volunteerSearchByTypeFilterPayload(
          basePayload,
          volunteerSearchNextDaysOnDayTap(daysState, iso, dayIsos),
          typeState,
          navParams.returnTo,
        ),
        { disabled: lastDayOnly, noAction: lastDayOnly },
      ),
    );
  }
  if (dayButtons.length) {
    headerChildren.push(volunteerHomeWrappedFilterRow(dayButtons), volunteerHomeGap());
  }

  const allJobsSelected = typeState.jobsAll === '1';
  const typeButtons = VOLUNTEER_JOB_TYPE_BUTTONS.map(({ code, label }) => {
    const typeSelected = typeState.jobType === code && typeState.jobsAll === '0';
    return volunteerHomeFilterToggleButton(
      label,
      typeSelected,
      searchTarget,
      volunteerSearchByTypeFilterPayload(
        basePayload,
        daysState,
        volunteerSearchByTypeNextOnTypeTap(typeState, code, ctx),
        navParams.returnTo,
      ),
      { multiline: true, hPad: 5, fontSize: 12 },
    );
  });
  const allJobsButton = volunteerHomeFilterToggleButton(
    'All jobs',
    allJobsSelected,
    searchTarget,
    volunteerSearchByTypeFilterPayload(
      basePayload,
      daysState,
      volunteerSearchByTypeNextOnAllJobsTap(typeState, ctx),
      navParams.returnTo,
    ),
    { noAction: allJobsSelected && !typeState.jobType && !String(typeState.selectedJobs || '').trim() },
  );
  headerChildren.push(
    volunteerHomeTypeFilterRow([allJobsButton, ...typeButtons]),
    volunteerHomeGap(),
  );

  const scrollChildren = [];
  const visibleJobs = volunteerSearchByTypeJobsVisible(ctx, typeState);
  if (visibleJobs.length) {
    const jobButtons = [];
    for (const job of visibleJobs) {
      const selected = volunteerSearchByTypeJobSelected(typeState, job.id);
      const abbrev = volunteerHomeJobFilterLabel(job, ctx.layoutWarnings, `jobtype_abbrev_${job.id}`);
      jobButtons.push(
        volunteerHomeFilterToggleButton(
          abbrev,
          selected,
          searchTarget,
          volunteerSearchByTypeFilterPayload(
            basePayload,
            daysState,
            volunteerSearchByTypeNextOnJobTap(typeState, job.id, ctx),
            navParams.returnTo,
          ),
        ),
      );
    }
    scrollChildren.push(
      volunteerHomeJobListScroll([volunteerHomeWrappedFilterRow(jobButtons)]),
    );
  }

  if (ctx.errorNote) {
    headerChildren.push({
      type: 'text',
      content: ctx.errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }
  headerChildren.push(volunteerHomeBuildStampText());
  headerChildren.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));

  return volunteerHomeScreenEnvelope(
    'jewelheart.volunteer.searchByType',
    'JewelHeart',
    scrollChildren,
    ctx.layoutWarnings,
    { stickyHeader: true, stickyHeaderComponents: headerChildren, navParams },
  );
}

/** Search results — tap a row to open jewelheart.volunteer.shift. */
export async function buildJewelheartVolunteerAssignScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const retreatId = params.retreatId || ctx.retreatId || '';
  const basePayload = retreatId ? { retreatId } : {};
  const navParams = {
    retreatId: retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
    daysAll: volunteerSearchDaysAllParam(params),
    selectedDays: params.selectedDays || '',
    jobsAll: volunteerSearchJobsAllParam(params),
    selectedJobs: params.selectedJobs || '',
    jobType: volunteerSearchJobTypeParam(params),
    typeJobPrefs: params.typeJobPrefs || '',
  };
  const shiftBase = volunteerSearchFilterPayloadFromParams(basePayload, navParams, 'jewelheart.home');

  const matches = await volunteerSearchMatchingShifts(ctx, params, firebaseUid, authToken);

  const children = [
    ...volunteerHomeHeaderChildren(ctx, `Open shifts -- ${matches.length} shown by day:`),
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
      `${dayRows.length} on ${weekday}${VOLUNTEER_HOME_EN_DASH}Tap to sign up`,
      VOLUNTEER_HOME_MAX_BAR_CHARS,
      ctx.layoutWarnings,
      `open_shifts_day_${dayIso}`,
    );
    children.push(volunteerHomeBar(barText, volunteerHomeMaroon, '#FFFFFF'));
    for (const row of dayRows) {
      const rowLabel = volunteerHomeDayJobLabel(
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
          volunteerHomeLightMaroon,
          '#FFFFFF',
          { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
        ),
      );
    }
    children.push(volunteerHomeGap());
  }

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.assign', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
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
  const posterInstructions = volunteerHomePosterInstructions(ctx, jobId, taskId);
  if (posterInstructions) return posterInstructions;
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

/** Wrapping instruction text (scroll area; centered lines). */
function volunteerHomeInstructionText(content) {
  return {
    type: 'text',
    content,
    textStyle: { fontSize: 15, textAlign: 'center' },
    style: { padding: { top: 4, bottom: 4, left: 12, right: 12 } },
  };
}

/** Blue "How to do • job" bar plus scrollable instruction block (web: framed, bleeds into bar). */
function volunteerHomeInstructionScrollSection(jobName, lines, warnings, codePrefix = 'instr') {
  const bar = volunteerHomeBar(
    volunteerHomeFitLine(
      `How to do${VOLUNTEER_HOME_EN_DASH}${jobName}`,
      VOLUNTEER_HOME_MAX_BAR_CHARS,
      warnings,
      `${codePrefix}_bar`,
    ),
    volunteerHomeSummaryBlue,
    '#FFFFFF',
  );
  bar.style = { ...(bar.style || {}), instructionBarBleed: true };
  return [
    bar,
    {
      type: 'instructionScroll',
      layout: 'column',
      spacing: 0,
      style: {
        borderColor: volunteerHomeSummaryBlue,
        maxHeight: { value: 168 },
      },
      children: (lines || []).map((line, i) =>
        volunteerHomeInstructionText(line),
      ),
    },
  ];
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
  } else if (checkinOp === 'unassign' && taskId && paramRetreatId) {
    const vol = await volunteerResolveSelf(firebaseUid, paramRetreatId);
    if (vol?.id) {
      try {
        await volunteerSelfUnassign(paramRetreatId, taskId, vol.id);
      } catch {
        /* fall through; state re-derived from DB below */
      }
    }
  } else if ((checkinOp === 'start' || checkinOp === 'finish') && taskId) {
    volunteerApplyCheckinOp(firebaseUid, taskId, checkinOp, 'Volunteer');
  }

  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const myShiftForTask = taskId
    ? (ctx.myShifts || []).find((s) => s.taskId === taskId)
    : null;
  if (!jobId && myShiftForTask) jobId = myShiftForTask.jobId;
  const retreatId = paramRetreatId || ctx.retreatId || '';
  const dayIso = String(params.dayIso || myShiftForTask?.dayIso || ctx.todayIso);
  const basePayload = retreatId ? { retreatId } : {};
  const returnTo = params.returnTo || 'jewelheart.home';
  const filterFields = volunteerSearchFilterFromParams(params);
  const navParams = {
    ...basePayload,
    ...filterFields,
    returnTo,
    shiftOp,
    jobId,
    dayIso,
    taskId,
    volunteerId: params.volunteerId || 'me',
  };

  const jobName = volunteerHomeShiftJobName(ctx, jobId, taskId);
  const isToday = dayIso === ctx.todayIso;
  const isMine = volunteerHomeIsMyTask(ctx, taskId);

  const signupTitle = volunteerHomeFitLine(
    `Sign up for: ${volunteerHomeDayJobLabel(
      jobName,
      dayIso,
      VOLUNTEER_HOME_MAX_BAR_CHARS - 'Sign up for: '.length,
      null,
      'shift_title_job',
    )}`,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'shift_title',
  );
  const children = [
    ...volunteerHomeHeaderChildren(ctx, signupTitle, dayIso, { alreadyFitted: true }),
    volunteerHomeGap(),
  ];

  // Toggle assign button: light (initial/fail) ↔ dark (success); gold family if
  // today, maroon family otherwise. Text color: black on gold, white on maroon.
  const darkColor = isToday ? volunteerHomeGold : volunteerHomeMaroon;
  const lightColor = isToday ? volunteerHomeLightGold : volunteerHomeLightMaroon;
  const textColor = isToday ? '#000000' : '#FFFFFF';
  const todaySuffix = isToday ? ' today' : '';
  const shiftPayload = (extra = {}) =>
    volunteerHomeWithReturnTo(
      {
        ...basePayload,
        ...filterFields,
        shiftOp,
        jobId,
        dayIso,
        taskId,
        volunteerId: 'me',
        ...extra,
      },
      returnTo,
    );

  const cancelTarget =
    shiftOp === 'assign_me' ? 'jewelheart.volunteer.assign' : 'jewelheart.volunteer.mine';
  const cancelPayload =
    shiftOp === 'assign_me'
      ? volunteerSearchOpenShiftsPayload(basePayload, params, 'jewelheart.home')
      : volunteerHomeWithReturnTo({ ...basePayload }, 'jewelheart.home');

  children.push(
    volunteerHomeCenteredPill(
      'Cancel',
      cancelTarget,
      cancelPayload,
      volunteerHomeSummaryBlue,
      '#FFFFFF',
      { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
    ),
    volunteerHomeGap(),
  );

  let assignLabel;
  let assignColor;
  let assignOp;
  if (isMine) {
    assignLabel = `Success${VOLUNTEER_HOME_EN_DASH}assigned to me${todaySuffix}`;
    assignColor = darkColor;
    assignOp = 'unassign';
  } else if (assignAttempted) {
    assignLabel = `Fail${VOLUNTEER_HOME_EN_DASH}just taken by someone`;
    assignColor = lightColor;
    assignOp = 'assign';
  } else {
    assignLabel = isToday ? 'Assign shift today to me' : 'Assign this shift to me';
    assignColor = lightColor;
    assignOp = 'assign';
  }
  children.push(
    volunteerHomeCenteredPill(
      volunteerHomeFitLine(assignLabel, VOLUNTEER_HOME_MAX_BAR_CHARS, ctx.layoutWarnings, 'shift_assign_btn'),
      'jewelheart.volunteer.shift',
      shiftPayload({ checkinOp: assignOp }),
      assignColor,
      textColor,
      { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
    ),
  );

  // "How to do • job" bar + scrolling instructions.
  children.push(
    volunteerHomeSpacer(VOLUNTEER_HOME_ACTION_SECTION_SPACER),
    ...volunteerHomeInstructionScrollSection(
      jobName,
      volunteerHomeJobInstructionLines(ctx, jobId, taskId),
      ctx.layoutWarnings,
      'shift_instr',
    ),
  );

  children.push(volunteerHomeGap());
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.shift', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
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

  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
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
    const isToday = shift.dayIso === ctx.todayIso;
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
    const rowButtons = [trashButton];
    if (isToday) {
      rowButtons.push(
        volunteerHomePillButton(
          '✓',
          'jewelheart.volunteer.checkin',
          volunteerHomeWithReturnTo(
            { ...basePayload, taskId: shift.taskId },
            'jewelheart.volunteer.mine',
          ),
          volunteerHomeGold,
          '#000000',
          { hPad: 10 },
        ),
      );
    }
    rowButtons.push(
      volunteerHomePillButton(
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
        isToday ? volunteerHomeGold : volunteerHomeMaroon,
        isToday ? '#000000' : '#FFFFFF',
        { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
      ),
    );
    if (index > 0) children.push(volunteerHomeGap());
    children.push(volunteerHomeCenteredRow(rowButtons, 6));
  });

  children.push(volunteerHomeGap());
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.mine', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
}

export async function buildJewelheartVolunteerCheckinScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
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
  const todayShift =
    (taskId && (ctx.todayShifts || []).find((s) => s.taskId === taskId)) ||
    (ctx.myShifts || []).find((s) => s.taskId === taskId);
  const jobId = todayShift?.jobId || demoTask?.jobId || taskId;

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

  // Header: retreat top bar + YELLOW second bar "Check in • job".
  const checkinTitleBar = volunteerHomeFitLine(
    `Check in${VOLUNTEER_HOME_EN_DASH}${jobName}`,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'checkin_title',
  );
  const children = [
    volunteerHomeBar(ctx.retreatBannerLine, volunteerHomeSummaryBlue, volunteerHomeGold),
    volunteerHomeGap(),
    volunteerHomeBar(checkinTitleBar, volunteerHomeGold, '#000000'),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Cancel',
      'jewelheart.home',
      navParams.retreatId ? { retreatId: navParams.retreatId } : {},
      volunteerHomeSummaryBlue,
      '#FFFFFF',
      { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
    ),
    volunteerHomeGap(),
  ];

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
    ...volunteerHomeInstructionScrollSection(
      jobName,
      volunteerHomeJobInstructionLines(ctx, jobId, taskId),
      ctx.layoutWarnings,
      'checkin_instr',
    ),
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
  );

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.checkin', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
}

export async function buildJewelheartVolunteerMessagesScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
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
  );
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.messages', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
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
  ];
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope(screenId, 'JewelHeart', children, ctx.layoutWarnings, { navParams });
}

export async function buildJewelheartVolunteerAccountScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
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
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  return volunteerHomeSimplePlaceholderScreen(
    ctx,
    'Preferences',
    'Placeholder screen — notifications, display, and other settings will go here.',
    params,
    'jewelheart.volunteer.preferences',
  );
}

/**
 * Manage home (gated on jewelheart_managers or jewelheart_admins).
 * App-internal ops: poster generation, volunteer/assignment tools (TBD).
 */
export async function buildJewelheartVolunteerManageScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const isManager = await volunteerHomeIsManager(firebaseUid);
  const navParams = {
    retreatId: ctx.retreatId || params.retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
  };

  if (!isManager && !isAdmin) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Manage',
      'Manager access required. Ask an admin to add your Firebase UID to jewelheart_managers.',
      params,
      'jewelheart.volunteer.manage',
    );
  }

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx, 'Manage'),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Generate Poster',
      '',
      {},
      volunteerHomeMaroon,
      '#FFFFFF',
      {
        action: {
          type: 'download',
          target: `jewelheart/retreats/${navParams.retreatId || ctx.retreatId}/reports/poster-master`,
          payload: {},
        },
      },
    ),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      'Generate Poster builds an .xlsx copy of the Master tab populated with current assignees (named P-mmdd-hhmm) and downloads it. Open it in Google Sheets.',
      ctx.layoutWarnings,
      'manage_poster_hint',
    ),
    volunteerHomeGap(),
  ];
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.manage', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
}

/**
 * Admin home (gated on jewelheart_admins). Generate Poster is a dark-maroon
 * button; the web client turns posterOp=generate into an .xlsx download via the
 * poster REST endpoint (poster builder wired separately).
 */
export async function buildJewelheartVolunteerAdminScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const navParams = {
    retreatId: ctx.retreatId || params.retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
  };

  if (!isAdmin) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Admin',
      'Admin access required. Ask an admin to add your Firebase UID to jewelheart_admins.',
      params,
      'jewelheart.volunteer.admin',
    );
  }

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx, 'Admin'),
    ...volunteerHomeGoldPageTitleBar('Admin', ctx.layoutWarnings),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Generate Poster',
      '',
      {},
      volunteerHomeMaroon,
      '#FFFFFF',
      {
        action: {
          type: 'download',
          target: `jewelheart/retreats/${navParams.retreatId || ctx.retreatId}/reports/poster-master`,
          payload: {},
        },
      },
    ),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      'Generate Poster builds an .xlsx copy of the Master tab populated with current assignees (named P-mmdd-hhmm) and downloads it. Open it in Google Sheets.',
      ctx.layoutWarnings,
      'admin_poster_hint',
    ),
    volunteerHomeGap(),
  ];
  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.admin', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
}
