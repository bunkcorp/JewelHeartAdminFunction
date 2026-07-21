/**
 * Volunteer SDUI home + search (jewelheart.home, jewelheart.volunteer.search).
 * Canonical copy in JewelHeartAdminFunction; apply script copies beside sduiScreens.js.
 */

import { query } from '../db.js';
import { listRetreats, getScheduleByDay, listJobs } from './service.js';
import {
  identityFromAuthToken,
  normalizeEmail,
  normalizePhoneE164,
  phoneDigitsLast10,
  rosterIdentityMatches,
} from './jewelheart-auth-identity.js';
import {
  volunteerApplyCheckinOpDb,
  volunteerApplyManualCheckinDoneDb,
  volunteerCheckinDoneDb,
  volunteerValidateClockPairLabels,
  volunteerEnrichShiftsWithCheckins,
  volunteerListRetreatCheckins,
  volunteerLoadCheckinRows,
  volunteerResolveAssignment,
  volunteerShiftIsFulfilled,
} from './jewelheart-shift-checkins.js';
import {
  buildVolunteerTimeContext,
  loadVolunteerTestingSettings,
  VOLUNTEER_API_BUILD_STAMP,
} from './jewelheart-volunteer-time-context.js';
import { countRetreatAssignments } from './jewelheart-volunteer-admin-tools.js';
import {
  getPosterSearchJobs,
  getPosterJobInstructions,
  posterJobMetaByTitle,
  posterJobOrderIndex,
  posterCheckinsRequired,
  getPosterDataStatus,
  stripLeadingTitleFragments,
} from './jewelheart-poster-data.js';

/** karmadots.org/testerslogin sends uiChannel=testers for roster access checks. */
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
  const oboClear = String(params.oboClear || '') === '1';
  const oboVolunteerId = oboClear ? '' : String(params.oboVolunteerId || '').trim();
  return gatherVolunteerHomeContext(firebaseUid, authToken, {
    ...(retreatId ? { retreatId } : {}),
    ...(oboVolunteerId ? { oboVolunteerId } : {}),
  });
}

const jewelheartDefaultTimeZoneId = 'America/New_York';
const volunteerHomeGold = '#FFCA10';
const volunteerHomeLightGold = '#FFE9A3';
const volunteerHomeSummaryBlue = '#7A95CA';
/** Manager on-behalf-of mode — top header bar (tap to exit). */
const volunteerHomeOboBarColor = '#E97665';
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
/** Formerly ~38 (single-line clamp at 360dp). Raised so full labels are sent and
 * clients wrap them to multiple lines instead of the server chopping with "…". */
const VOLUNTEER_HOME_MAX_BAR_CHARS = 200;
const VOLUNTEER_HOME_MAX_HINT_CHARS = 200;
const VOLUNTEER_HOME_BAR_FONT_SP = 17;
const VOLUNTEER_HOME_BAR_V_PAD = 10;
const VOLUNTEER_HOME_BAR_H_PAD = 12;
/** Bar + home button row height — text centered vertically in clients. */
const VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP = 44;
const VOLUNTEER_HOME_BUTTON_H_PAD = 12;
/** Gold pills need slightly more inset — black text reads tighter than white on maroon. */
const VOLUNTEER_HOME_GOLD_BUTTON_H_PAD = 14;
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
function volunteerHomeDayJobLabel(jobName, dayIso, maxChars, warnings, code, jobTitleForAbbrev, options = {}) {
  let weekday = volunteerHomeWeekdayShort(dayIso);
  if (options.weekdayUpper) weekday = weekday.toUpperCase();
  const prefix = `${weekday}${VOLUNTEER_HOME_EN_DASH}`;
  const fitted = volunteerHomeFitLine(jobName, maxChars - prefix.length, warnings, code);
  return `${prefix}${fitted}`;
}

/** “Wd • Job” for home gold pills: full job name, then abbrev, then ellipsis + warning. */
function volunteerHomeJobAbbrevForTitle(jobTitle) {
  const meta = volunteerHomePosterJobMetaByTitle(jobTitle);
  return volunteerHomePosterJobAbbrev(meta || { title: jobTitle });
}

function volunteerHomeJobPillLabel(jobName, maxChars, warnings, code, jobTitleForAbbrev) {
  const fullJob = volunteerHomeCompactJobPhrase(volunteerHomeDisplayJobName(jobName));
  if (fullJob.length <= maxChars) return fullJob;
  const abbrev = volunteerHomeJobAbbrevForTitle(jobTitleForAbbrev || jobName);
  if (abbrev.length <= maxChars) return abbrev;
  if (warnings) volunteerHomeLayoutWarn(warnings, code, `${abbrev} (${abbrev.length} chars)`);
  return `${abbrev.slice(0, maxChars - 1)}…`;
}

function volunteerHomeDayJobPillLabel(jobName, dayIso, maxChars, warnings, code, jobTitleForAbbrev, options = {}) {
  let weekday = volunteerHomeWeekdayShort(dayIso);
  if (options.weekdayUpper) weekday = weekday.toUpperCase();
  const prefix = `${weekday}${VOLUNTEER_HOME_EN_DASH}`;
  const jobRoom = maxChars - prefix.length;
  const fullJob = volunteerHomeCompactJobPhrase(volunteerHomeDisplayJobName(jobName));
  if (prefix.length + fullJob.length <= maxChars) return `${prefix}${fullJob}`;
  const abbrev = volunteerHomeJobAbbrevForTitle(jobTitleForAbbrev || jobName);
  if (prefix.length + abbrev.length <= maxChars) return `${prefix}${abbrev}`;
  if (warnings) volunteerHomeLayoutWarn(warnings, code, `${prefix}${abbrev}`);
  const fitted =
    abbrev.length <= jobRoom ? abbrev : `${abbrev.slice(0, Math.max(0, jobRoom - 1))}…`;
  return `${prefix}${fitted}`;
}

function volunteerHomeFitLine(text, maxChars, warnings, code) {
  // Return the full compacted label; no ellipsis truncation. Clients wrap long
  // labels to multiple lines. (maxChars/warnings/code kept for call-site compat.)
  return volunteerHomeCompactJobPhrase(String(text || '').trim());
}

/** Instruction bar: job title (• separators) + time estimate; ellipsis before " • NNm". */
function volunteerHomeInstructionBarLabel(jobTitle, estMinutes, warnings, code) {
  const mins = Number(estMinutes) > 0 ? Number(estMinutes) : 15;
  const suffix = `${VOLUNTEER_HOME_DOT_SEP}${mins}m`;
  const fitted = volunteerHomeFitLine(
    jobTitle,
    VOLUNTEER_HOME_MAX_BAR_CHARS - suffix.length,
    warnings,
    code,
  );
  return `${fitted}${suffix}`;
}

function volunteerHomePosterJobForShift(ctx, jobId, taskId) {
  let posterJob = getPosterSearchJobs().find((j) => j.id === jobId || j.id === taskId);
  if (!posterJob) {
    const job = (ctx?.jobs || []).find((j) => String(j.id) === String(jobId));
    if (job?.title) posterJob = posterJobMetaByTitle(job.title);
  }
  return posterJob || null;
}

function volunteerHomeInstructionMeta(ctx, jobId, taskId) {
  const job = (ctx?.jobs || []).find((j) => String(j.id) === String(jobId));
  const posterJob = volunteerHomePosterJobForShift(ctx, jobId, taskId);
  return {
    title: posterJob?.title || job?.title || 'Shift',
    dbTitle: posterJob?.dbTitle || job?.title,
    estMinutes: posterJob?.estMinutes ?? job?.estimatedMinutes ?? job?.estimated_minutes ?? 15,
  };
}

/** Fit abbrev text without compactJobPhrase (Master abbrev col M as-is except " - " → •). */
function volunteerHomeFitAbbrevLine(text, maxChars, warnings, code) {
  // Return the full abbrev text; no ellipsis truncation. Clients wrap.
  return String(text || '').trim();
}

function volunteerHomeFitRetreatTitle(name, warnings) {
  let s = volunteerHomeRetreatShortName(name);
  s = s.replace(/\b(20(\d{2}))\b/g, "'$2");
  s = s.replace(/\s+/g, ' ').trim();
  return volunteerHomeFitLine(s, VOLUNTEER_HOME_MAX_BAR_CHARS, warnings, 'retreat_title');
}

function volunteerHomeLayoutWarningComponents(_warnings) {
  return [];
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

/** Check-ins required to fulfill a shift (v4 Jobs col J; default 1). */
function volunteerHomeCheckinsRequired(posterJobOrTitle) {
  return posterCheckinsRequired(posterJobOrTitle);
}

/** Resolve poster job instructions for a shift, by id or by DB job title. */
function volunteerHomePosterInstructions(ctx, jobId, taskId) {
  const jobs = getPosterSearchJobs();
  let posterJob = jobs.find((j) => j.id === jobId || j.id === taskId);
  if (!posterJob) {
    const job = (ctx?.jobs || []).find((j) => String(j.id) === String(jobId));
    if (job?.title) {
      posterJob = posterJobMetaByTitle(job.title);
    }
  }
  const lines = posterJob ? getPosterJobInstructions(posterJob.id) : null;
  return Array.isArray(lines) && lines.length ? lines : null;
}

function volunteerHomeNormalizeJobTitle(title) {
  return String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function volunteerHomeJobOrderIndex(title) {
  return posterJobOrderIndex(title);
}

function volunteerHomeJobSortKey(job) {
  const byPoster = volunteerHomeJobOrderIndex(job?.title);
  if (byPoster < Number.MAX_SAFE_INTEGER) return byPoster;
  const sortOrder = job?.sort_order ?? job?.sortOrder;
  if (sortOrder != null && Number.isFinite(Number(sortOrder))) {
    return Number(sortOrder);
  }
  return Number.MAX_SAFE_INTEGER;
}

/** Sort jobs: DB sort_order when set, else Master-tab poster order, then title. */
function volunteerHomeSortJobs(items) {
  return (items || []).slice().sort(
    (a, b) =>
      volunteerHomeJobSortKey(a) - volunteerHomeJobSortKey(b) ||
      String(a.title).localeCompare(String(b.title)),
  );
}

function volunteerHomeJobIdOrderMap(ctx) {
  const list = volunteerHomeDbSearchAvailable(ctx)
    ? volunteerHomeSortJobs(ctx.jobs)
    : getPosterSearchJobs().map((j, i) => ({ id: j.id, title: j.title, sort_order: i }));
  return new Map(list.map((j, i) => [String(j.id), i]));
}

function volunteerHomeJobOrderForId(jobId, ctx) {
  const map = volunteerHomeJobIdOrderMap(ctx);
  const key = String(jobId);
  if (map.has(key)) return map.get(key);
  const job = (ctx?.jobs || []).find((j) => String(j.id) === key);
  if (job) return volunteerHomeJobSortKey(job);
  const posterIdx = posterJobOrderIndex(jobId);
  if (posterIdx < Number.MAX_SAFE_INTEGER) return posterIdx;
  return 9999;
}

function volunteerHomeCompareJobIds(jobIdA, jobIdB, ctx) {
  return volunteerHomeJobOrderForId(jobIdA, ctx) - volunteerHomeJobOrderForId(jobIdB, ctx);
}

function volunteerHomeSortShiftsByDayThenJob(shifts, ctx) {
  return (shifts || []).slice().sort((a, b) => {
    const byDay = String(a.dayIso || '').localeCompare(String(b.dayIso || ''));
    if (byDay !== 0) return byDay;
    return volunteerHomeCompareJobIds(a.jobId, b.jobId, ctx);
  });
}

function volunteerHomeSortShiftsByJobOrder(shifts, ctx) {
  return (shifts || []).slice().sort((a, b) => {
    const byJob = volunteerHomeCompareJobIds(a.jobId, b.jobId, ctx);
    if (byJob !== 0) return byJob;
    return String(a.dayIso || '').localeCompare(String(b.dayIso || ''));
  });
}

function volunteerHomeShiftEarlyAlert(ctx, shift) {
  if (shift?.jobTitle) {
    const byTitle = posterJobMetaByTitle(shift.jobTitle);
    if (byTitle?.earlyAlert) return true;
  }
  const meta = volunteerHomePosterJobForShift(ctx, shift?.jobId, shift?.taskId);
  return meta?.earlyAlert === true;
}

/** Jobs-v4 column L ("e"): show as todo on the day before the shift, weekday in ALL CAPS. */
function volunteerHomeShiftEarlyAlertPreview(shift, todayIso, ctx) {
  if (!shift?.dayIso || !todayIso || shift.dayIso <= todayIso) return false;
  if (!volunteerHomeShiftEarlyAlert(ctx, shift)) return false;
  return addDaysIsoYmd(shift.dayIso, -1) === todayIso;
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

/** 24-hour hh:mm for manager check-in list prefixes. */
function volunteerHomeFormatTimeHm(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: jewelheartDefaultTimeZoneId,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/** ET date + time for manager shift inspection. */
function volunteerHomeFormatDateTimeEt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: jewelheartDefaultTimeZoneId,
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

function volunteerHomeFormatAssignmentByLabel(row) {
  const source = String(row.assignmentSource || '').trim();
  const byName = String(row.assignedByName || '').trim();
  if (!source) return 'legacy (not recorded)';
  if (source === 'self') return 'self sign-up';
  if (byName) return byName;
  return source;
}

function volunteerHomeManageCheckinLine(row, warnings, code) {
  const day = volunteerHomeWeekdayShort(row.dayIso);
  const stamp = volunteerHomeFormatTimeHm(row.startedAt);
  const start = volunteerHomeFormatTimeAm(row.startedAt);
  const fin = row.finishedAt ? volunteerHomeFormatTimeAm(row.finishedAt) : '—';
  return volunteerHomeFitLine(
    `${stamp}${VOLUNTEER_HOME_EN_DASH}${day}${VOLUNTEER_HOME_EN_DASH}${volunteerHomeDisplayJobName(row.jobTitle)}${VOLUNTEER_HOME_EN_DASH}${row.volunteerName}${VOLUNTEER_HOME_EN_DASH}${start}${fin !== '—' ? ` – ${fin}` : ''}`,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    warnings,
    code,
  );
}

function volunteerHomeCountLabel(n, singular, plural) {
  const count = Number(n) || 0;
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/** Blue summary bar on My assigned shifts — proper English, no “altogether”. */
function volunteerAssignedShiftsSummary(n) {
  const count = Number(n) || 0;
  if (count === 0) return 'No assigned shifts';
  if (count === 1) return '1 assigned shift';
  return `${count} assigned shifts`;
}

function volunteerFutureShiftsBar(n) {
  const count = Number(n) || 0;
  const word = count === 1 ? 'shift' : 'shifts';
  return `${count} future ${word} – tap info – ✎ edit`;
}

function volunteerDoneTodayBar(n) {
  const count = Number(n) || 0;
  if (count === 1) return '1 shift today is done – tap info';
  return `${count} shifts today are done – tap info`;
}

function splitPersonName(displayName) {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

async function loadVolunteerProfileByUid(firebaseUid) {
  const { rows } = await query(
    `SELECT id,
            display_name AS "displayName",
            email,
            phone,
            notify_email AS "notifyEmail",
            notify_sms AS "notifySms"
     FROM jewelheart_volunteers
     WHERE firebase_uid = $1
     LIMIT 1`,
    [firebaseUid],
  );
  return rows[0] || null;
}

async function findVolunteerProfileByRosterContact(auth) {
  const email = normalizeEmail(auth?.email);
  if (email) {
    const { rows } = await query(
      `SELECT id,
              display_name AS "displayName",
              email,
              phone,
              notify_email AS "notifyEmail",
              notify_sms AS "notifySms"
       FROM jewelheart_volunteers
       WHERE email IS NOT NULL AND lower(trim(email)) = lower(trim($1))
       LIMIT 1`,
      [email],
    );
    if (rows[0]) return rows[0];
  }
  const phone10 =
    phoneDigitsLast10(auth?.phone) || phoneDigitsLast10(normalizePhoneE164(auth?.phone));
  if (phone10) {
    const { rows } = await query(
      `SELECT id,
              display_name AS "displayName",
              email,
              phone,
              notify_email AS "notifyEmail",
              notify_sms AS "notifySms"
       FROM jewelheart_volunteers
       WHERE phone IS NOT NULL
         AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = $1
       LIMIT 1`,
      [phone10],
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

/** Profile for Account / Prefs — firebase uid, then roster email/phone from auth token. */
async function loadVolunteerProfileForSelf(firebaseUid, authToken) {
  const byUid = await loadVolunteerProfileByUid(firebaseUid);
  if (byUid) return byUid;
  const auth = identityFromAuthToken(authToken, firebaseUid);
  const candidate = await findVolunteerProfileByRosterContact(auth);
  if (candidate && rosterIdentityMatches(candidate, auth)) return candidate;
  return null;
}

function volunteerProfileField(label, value, options = {}) {
  return {
    type: 'profileField',
    label,
    value: value || '',
    editable: options.editable === true,
    fieldKey: options.fieldKey || '',
    placeholder: options.placeholder || '',
  };
}

function volunteerPrefCheckbox(label, checked, fieldKey, options = {}) {
  return {
    type: 'prefCheckbox',
    label,
    checked: checked !== false,
    fieldKey,
    disabled: options.disabled === true,
  };
}

function volunteerProfilePanel(children) {
  return {
    type: 'profilePanel',
    children: children || [],
  };
}

function volunteerProfilePanelIntro(content) {
  return {
    type: 'profileIntro',
    content: String(content || '').trim(),
  };
}

function volunteerAccountPrefsHeader(ctx, prefix, displayName, warnings, code) {
  const line = volunteerHomeFitLine(
    `${prefix} - ${String(displayName || 'Volunteer').trim()}`,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    warnings,
    code,
  );
  return volunteerHomeBlueHeaderChildren(ctx, line, undefined, { alreadyFitted: true });
}

function volunteerPrefNotifyLabel(kind, contact) {
  const c = String(contact || '').trim();
  if (kind === 'email') return c ? `by email (${c})` : 'by email (no address on file)';
  return c ? `by text (${c})` : 'by text (no number on file)';
}

function volunteerPrivilegeLine(isAdmin, isManager) {
  if (isAdmin && isManager) return 'You have administrator and manager access.';
  if (isAdmin) return 'You have administrator access.';
  if (isManager) return 'You have manager access.';
  return '';
}

function volunteerTaskCheckinState(_firebaseUid, _taskId) {
  return { sessions: [], open: null };
}

async function volunteerTaskCheckinStateFromDb(assignment) {
  if (!assignment?.assignmentId) return { sessions: [], open: null };
  const rows = await volunteerLoadCheckinRows(assignment.assignmentId);
  const sessions = rows.map((r) => ({
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  }));
  const openRow = [...rows].reverse().find((r) => !r.finishedAt);
  const open = openRow
    ? { startedAt: openRow.startedAt, finishedAt: null }
    : null;
  return { sessions, open };
}

function volunteerCheckinBaselineIdsFromRows(rows) {
  return (rows || []).map((r) => String(r.id)).filter(Boolean);
}

function volunteerCheckinBaselineIdsParam(ids) {
  return (ids || []).filter(Boolean).join(',');
}

function volunteerParseCheckinBaselineIds(raw) {
  if (!raw) return [];
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

async function volunteerResolveCheckinAssignment(ctx, shift, taskId) {
  if (!taskId) return null;
  if (shift?.assignmentId) return shift;
  if (!ctx?.volunteerId) return null;
  return volunteerResolveAssignment(ctx.volunteerId, taskId);
}

async function volunteerResolveCheckinBaselineIds(params, assignment, checkinOp) {
  if (checkinOp === 'undo') return [];
  if (params.checkinBaselineIds) {
    return volunteerParseCheckinBaselineIds(params.checkinBaselineIds);
  }
  if (!assignment?.assignmentId) return [];
  const rows = await volunteerLoadCheckinRows(assignment.assignmentId);
  return volunteerCheckinBaselineIdsFromRows(rows);
}

async function volunteerHomeCheckinPerformedBy(firebaseUid, ctx) {
  if (ctx?.oboMode) {
    const actor = await volunteerResolveSelf(firebaseUid, ctx.retreatId || '');
    return actor?.id || ctx.volunteerId || null;
  }
  return ctx?.volunteerId || null;
}

async function volunteerApplyCheckinOp(firebaseUid, taskId, op, _volunteerName, ctx) {
  if (!taskId || !op) return { ok: false };
  const volunteerId = ctx?.volunteerId;
  if (!volunteerId) return { ok: false, error: 'no_volunteer' };
  const assignment =
    (ctx?.myShifts || []).find((s) => s.taskId === String(taskId)) ||
    (await volunteerResolveAssignment(volunteerId, taskId));
  if (!assignment?.assignmentId) return { ok: false, error: 'not_assigned' };
  if (op === 'undo') {
    return volunteerApplyCheckinOpDb(assignment, ctx?.todayIso, 'undo');
  }
  const performedByVolunteerId = await volunteerHomeCheckinPerformedBy(firebaseUid, ctx);
  return volunteerApplyCheckinOpDb(assignment, ctx?.todayIso, op, {
    performedByVolunteerId,
  });
}

function volunteerPreviousCheckinLabel(firebaseUid, taskId) {
  const tc = volunteerTaskCheckinState(firebaseUid, taskId);
  const last = tc.sessions[tc.sessions.length - 1];
  if (!last) return '';
  const t = last.finishedAt || last.startedAt;
  return t ? ` · prev: ${volunteerHomeFormatTimeAm(t)}` : '';
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
  const barOpts = { alreadyFitted: true };
  if (options.secondBarColor) barOpts.secondBarColor = options.secondBarColor;
  if (options.secondBarTextColor) barOpts.secondBarTextColor = options.secondBarTextColor;
  if (options.warnCode) barOpts.warnCode = options.warnCode;
  return [...volunteerHomeTopBlueBars(ctx, line, barOpts), volunteerHomeGap()];
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
  return posterJobMetaByTitle(title);
}

/** Live DB jobs that match the current v4 poster / jobs-v4.xlsx catalog. */
function volunteerHomeJobsInPosterCatalog(jobs) {
  return volunteerHomeSortJobs(jobs).filter((j) => volunteerHomePosterJobMetaByTitle(j.title));
}

function volunteerHomeDbJobByPosterId(ctx) {
  const map = new Map();
  for (const j of volunteerHomeJobsInPosterCatalog(ctx.jobs || [])) {
    const meta = volunteerHomePosterJobMetaByTitle(j.title);
    if (meta) map.set(meta.id, j);
  }
  return map;
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
  return getPosterSearchJobs();
}

/** True when live retreat jobs/tasks are available (search + assignments hit the DB). */
function volunteerHomeDbSearchAvailable(ctx) {
  return Boolean(ctx.retreatId && ctx.volunteerId && (ctx.jobs || []).length);
}

/** Job list driving the search filter buttons: live DB jobs in poster catalog, else poster fallback. */
function volunteerHomeSearchJobsList(ctx) {
  if (volunteerHomeDbSearchAvailable(ctx)) {
    return volunteerHomeJobsInPosterCatalog(ctx.jobs).map((j) => {
      const meta = volunteerHomePosterJobMetaByTitle(j.title);
      return {
        id: String(j.id),
        title: String(j.title || 'Job'),
        abbrev: meta?.abbrev || String(j.title || 'Job').replace(/\s*—\s*/g, ' · '),
        jobType: meta?.jobType || '',
        posterId: meta?.id || '',
      };
    });
  }
  return getPosterSearchJobs().map((j) => ({
    id: j.id,
    title: j.title,
    abbrev: j.abbrev,
    jobType: j.jobType || '',
    posterId: j.id,
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

const VOLUNTEER_JOB_TYPE_CODES = ['f', 'v', 'b'];
/** Wire param for Find-by-type "All jobs" (not a spreadsheet type code). */
const VOLUNTEER_JOB_TYPE_ALL = 'all';

function volunteerSearchJobTypeParam(params) {
  const t = String(params.jobType || '').trim().toLowerCase();
  if (t === VOLUNTEER_JOB_TYPE_ALL) return VOLUNTEER_JOB_TYPE_ALL;
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
  if (jobType === VOLUNTEER_JOB_TYPE_ALL) {
    return { jobType: VOLUNTEER_JOB_TYPE_ALL, jobsAll: '1', selectedJobs: '', typeJobPrefs: '' };
  }
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

/** Find by day — exactly one future/today day selected (radio). */
function volunteerSearchByDaySelectedIso(params, allDayIsos, todayIso) {
  let picked = String(params.selectedDay || '').trim();
  if (!picked && params.daysAll === '0') {
    picked = String(params.selectedDays || '').split(',')[0].trim();
  }
  const searchable = allDayIsos.filter((iso) => iso >= todayIso);
  if (picked && allDayIsos.includes(picked) && picked >= todayIso) return picked;
  if (searchable.includes(todayIso)) return todayIso;
  return searchable[0] || allDayIsos[allDayIsos.length - 1] || todayIso;
}

function volunteerSearchByDayNavPayload(base, selectedDay, returnTo, extra = {}) {
  return volunteerHomeWithReturnTo(
    {
      ...base,
      daysAll: '0',
      selectedDays: selectedDay,
      selectedDay,
      jobsAll: '1',
      selectedJobs: '',
      ...extra,
    },
    returnTo,
  );
}

function volunteerSearchByDaySearchParams(selectedDay) {
  return {
    daysAll: '0',
    selectedDays: selectedDay,
    jobsAll: '1',
    selectedJobs: '',
  };
}

/** Find by type — one type selected, or all jobs in type order. */
function volunteerSearchByTypeIsAllMode(params) {
  if (volunteerSearchJobTypeParam(params) === VOLUNTEER_JOB_TYPE_ALL) return true;
  return volunteerSearchJobsAllParam(params) === '1' && !volunteerSearchJobTypeParam(params);
}

function volunteerSearchByTypeSelectedMode(params) {
  if (volunteerSearchByTypeIsAllMode(params)) return VOLUNTEER_JOB_TYPE_ALL;
  const t = volunteerSearchJobTypeParam(params);
  if (t) return t;
  return VOLUNTEER_JOB_TYPE_CODES[0];
}

function volunteerSearchByTypeJobOrder(ctx, mode) {
  if (mode === VOLUNTEER_JOB_TYPE_ALL) {
    return VOLUNTEER_JOB_TYPE_CODES.flatMap((code) => volunteerSearchByTypeTypeJobIds(ctx, code));
  }
  return volunteerSearchByTypeTypeJobIds(ctx, mode);
}

function volunteerSearchByTypeNavPayload(base, jobType, returnTo, extra = {}) {
  return volunteerHomeWithReturnTo(
    {
      ...base,
      daysAll: '1',
      selectedDays: '',
      jobsAll: '0',
      selectedJobs: '',
      jobType,
      typeJobPrefs: '',
      ...extra,
    },
    returnTo,
  );
}

function volunteerSearchByTypeAllJobsNavPayload(base, returnTo, extra = {}) {
  return volunteerHomeWithReturnTo(
    {
      ...base,
      daysAll: '1',
      selectedDays: '',
      jobsAll: '1',
      selectedJobs: '',
      jobType: VOLUNTEER_JOB_TYPE_ALL,
      typeJobPrefs: '',
      ...extra,
    },
    returnTo,
  );
}

function volunteerSearchByTypeSearchParams(mode) {
  if (mode === VOLUNTEER_JOB_TYPE_ALL) {
    return {
      daysAll: '1',
      selectedDays: '',
      jobsAll: '1',
      selectedJobs: '',
      jobType: VOLUNTEER_JOB_TYPE_ALL,
      typeJobPrefs: '',
    };
  }
  return {
    daysAll: '1',
    selectedDays: '',
    jobsAll: '0',
    selectedJobs: '',
    jobType: mode,
    typeJobPrefs: '',
  };
}

/** Job order (master list), then day within each job. Today+ only. */
function volunteerSearchByTypeGroupedMatches(matches, ctx, mode) {
  const jobOrder = volunteerSearchByTypeJobOrder(ctx, mode);
  const orderIdx = new Map(jobOrder.map((id, i) => [id, i]));
  return [...matches]
    .filter((row) => row.dayIso >= ctx.todayIso)
    .sort((a, b) => {
      const oa = orderIdx.get(a.jobId) ?? 9999;
      const ob = orderIdx.get(b.jobId) ?? 9999;
      if (oa !== ob) return oa - ob;
      return a.dayIso.localeCompare(b.dayIso);
    });
}

/** Open shifts grouped by job (master order); each job lists day rows sorted by day. */
function volunteerSearchByTypeMatchesByJob(matches, ctx, mode) {
  const sorted = volunteerSearchByTypeGroupedMatches(matches, ctx, mode);
  const buckets = new Map();
  for (const row of sorted) {
    if (!buckets.has(row.jobId)) buckets.set(row.jobId, []);
    buckets.get(row.jobId).push(row);
  }
  return volunteerSearchByTypeJobOrder(ctx, mode)
    .filter((id) => buckets.has(id))
    .map((jobId) => ({
      jobId,
      jobName: volunteerHomeShiftJobName(ctx, jobId, buckets.get(jobId)[0]?.taskId),
      days: buckets.get(jobId),
    }));
}

function volunteerHomeOpenShiftJobHeaderBar(jobName, warnings, code) {
  return volunteerHomeBar(
    volunteerHomeFitLine(jobName, VOLUNTEER_HOME_MAX_BAR_CHARS, warnings, code),
    volunteerHomeMaroon,
    '#FFFFFF',
  );
}

function volunteerHomeOpenShiftDayPill(dayIso, row, shiftBase) {
  return volunteerHomeFilterToggleButton(
    volunteerHomeWeekdayShort(dayIso),
    false,
    'jewelheart.volunteer.shift',
    {
      ...shiftBase,
      shiftOp: 'assign_me',
      jobId: row.jobId,
      dayIso: row.dayIso,
      taskId: row.taskId || row.jobId,
    },
    { hPad: 5 },
  );
}

function volunteerHomeOpenShiftDayButtonsRow(dayButtons) {
  return volunteerHomeWrappedFilterRow(dayButtons, { spacing: 4, sidePad: 4, compactWrap: true });
}

/** Real DOM gap row (Safari ignores flex ::after spacers). Height from CSS var. */
function volunteerHomeOpenShiftJobGroupGap() {
  return {
    type: 'text',
    content: '\u00a0',
    textStyle: { fontSize: 1, lineHeight: 1, textAlign: 'center', color: 'transparent' },
    style: { openShiftJobGroupGap: true },
  };
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
  if (jobType === VOLUNTEER_JOB_TYPE_ALL) {
    return searchJobs.map((j) => j.id);
  }
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

function volunteerSearchPosterShifts(targetDayIsos, targetJobIds, todayIso, ctx) {
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
    (a, b) =>
      a.dayIso.localeCompare(b.dayIso) || volunteerHomeCompareJobIds(a.jobId, b.jobId, ctx),
  );
  return rows;
}

/**
 * Open shifts matching the day/job filters. A shift is one (job, day); it is
 * open when at least one of its tasks still has capacity and I'm not on it.
 * Schedule days come from the poster catalog; capacity from the live DB.
 */
async function volunteerSearchMatchingShifts(ctx, params, firebaseUid, authToken) {
  const retreat = ctx.retreat || VOLUNTEER_HOME_DEFAULT_RETREAT;
  const searchJobs = volunteerHomeSearchJobsList(ctx);
  const targetDayIsos = volunteerSearchResolveTargetDayIsos(params, retreat, ctx.todayIso);
  const targetJobIds = new Set(volunteerSearchResolveTargetJobIds(params, searchJobs));

  const dbByPoster = volunteerHomeDbJobByPosterId(ctx);
  const posterJobs = getPosterSearchJobs().filter((pj) => {
    const dbJob = dbByPoster.get(pj.id);
    return dbJob && targetJobIds.has(String(dbJob.id));
  });

  const candidates = [];
  for (const posterJob of posterJobs) {
    const dbJob = dbByPoster.get(posterJob.id);
    if (!dbJob) continue;
    for (const dayIso of posterJob.scheduledDayIsos || []) {
      if (!targetDayIsos.includes(dayIso) || dayIso < ctx.todayIso) continue;
      candidates.push({ posterJob, dbJob, dayIso });
    }
  }

  if (!volunteerHomeDbSearchAvailable(ctx)) {
    const rows = candidates.map(({ posterJob, dayIso }) => ({
      jobId: posterJob.id,
      dayIso,
      taskId: posterJob.id,
      label: volunteerHomePosterJobDisplayName(posterJob),
    }));
    rows.sort(
      (a, b) =>
        a.dayIso.localeCompare(b.dayIso) || volunteerHomeCompareJobIds(a.jobId, b.jobId, ctx),
    );
    return rows;
  }

  const myJobDays = new Set((ctx.myShifts || []).map((s) => `${s.jobId}|${s.dayIso}`));
  const scheduleByDay = new Map();
  const rows = [];

  for (const { posterJob, dbJob, dayIso } of candidates) {
    const jobId = String(dbJob.id);
    if (myJobDays.has(`${jobId}|${dayIso}`)) continue;

    if (!scheduleByDay.has(dayIso)) {
      scheduleByDay.set(
        dayIso,
        await getScheduleByDay(firebaseUid, ctx.retreatId, dayIso, authToken),
      );
    }
    const day = scheduleByDay.get(dayIso);
    const item = (day?.items || []).find((it) => {
      const jid = String((it.task && it.task.jobId) || (it.job && it.job.id) || '');
      return jid === jobId;
    });
    if (!item) continue;

    const assigns = item.assignments || [];
    const needed = item.task?.volunteersNeeded ?? item.job?.volunteersNeeded ?? 1;
    const count = item.task?.assignmentCount ?? assigns.length;
    if (count >= needed) continue;

    rows.push({
      jobId,
      dayIso,
      taskId: item.task?.id ? String(item.task.id) : jobId,
      label: volunteerHomeDisplayJobName(posterJob.title),
    });
  }

  rows.sort(
    (a, b) =>
      a.dayIso.localeCompare(b.dayIso) || volunteerHomeCompareJobIds(a.jobId, b.jobId, ctx),
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
      barWrap: options.barWrap === true,
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
  'jewelheart.volunteer.search': 'Find open shifts',
  'jewelheart.volunteer.searchByType': 'Find open shifts by job type',
  'jewelheart.volunteer.searchByDay': 'Find open shifts by day',
  'jewelheart.volunteer.assign': 'Open shifts',
  'jewelheart.volunteer.shiftDetail': 'Shift',
  'jewelheart.volunteer.shift': 'Shift',
  'jewelheart.volunteer.shiftEdit': 'Edit shift',
  'jewelheart.volunteer.shiftInfo': 'Shift info',
  'jewelheart.volunteer.checkin': 'Check in',
  'jewelheart.volunteer.messages': 'Announcements',
  'jewelheart.volunteer.mine': 'My assigned shifts',
  'jewelheart.volunteer.account': 'Account',
  'jewelheart.volunteer.preferences': 'Preferences',
  'jewelheart.volunteer.manage': 'Manage',
  'jewelheart.volunteer.manageCheckins': 'Check-ins',
  'jewelheart.volunteer.jobFinder': 'Job finder',
  'jewelheart.volunteer.userManage': 'User management',
  'jewelheart.volunteer.testing': 'Testing',
  'jewelheart.volunteer.admin': 'Admin',
  'jewelheart.volunteer.adminPrivileges': 'Privileges',
};

function volunteerHomeScreenBackLabel(screenId) {
  return VOLUNTEER_SCREEN_BACK_LABELS[screenId] || 'Back';
}

function volunteerHomeBackPayload(params, backTarget) {
  const p = {};
  if (params.retreatId) p.retreatId = String(params.retreatId);
  if (backTarget === 'jewelheart.volunteer.shiftDetail' || backTarget === 'jewelheart.volunteer.checkin'
    || backTarget === 'jewelheart.volunteer.shiftEdit' || backTarget === 'jewelheart.volunteer.shiftInfo') {
    if (params.taskId) p.taskId = String(params.taskId);
    if (params.shiftMode) p.shiftMode = String(params.shiftMode);
    if (params.dayIso) p.dayIso = String(params.dayIso);
    if (params.jobId) p.jobId = String(params.jobId);
    if (params.editOutcome) p.editOutcome = String(params.editOutcome);
    if (params.reassignedName) p.reassignedName = String(params.reassignedName);
    p.returnTo = params.returnTo ? String(params.returnTo) : 'jewelheart.home';
  }
  if (backTarget === 'jewelheart.volunteer.shift') {
    if (params.taskId) p.taskId = String(params.taskId);
    if (params.jobId) p.jobId = String(params.jobId);
    if (params.dayIso) p.dayIso = String(params.dayIso);
    p.shiftOp = params.shiftOp ? String(params.shiftOp) : 'mine';
    p.returnTo = 'jewelheart.volunteer.mine';
  }
  if (backTarget === 'jewelheart.volunteer.search' || backTarget === 'jewelheart.volunteer.searchByType'
    || backTarget === 'jewelheart.volunteer.searchByDay' || backTarget === 'jewelheart.volunteer.assign') {
    if (backTarget === 'jewelheart.volunteer.search' || backTarget === 'jewelheart.volunteer.searchByType'
      || backTarget === 'jewelheart.volunteer.searchByDay') {
      p.returnTo = 'jewelheart.home';
    }
    if (backTarget === 'jewelheart.volunteer.assign') p.returnTo = 'jewelheart.home';
    if (params.daysAll != null) p.daysAll = String(params.daysAll);
    if (params.selectedDays != null) p.selectedDays = String(params.selectedDays);
    if (params.selectedDay != null) p.selectedDay = String(params.selectedDay);
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

function volunteerHomeNavIconButton(icon, actionOrTarget, payload, options = {}) {
  const defaultLabel = icon === 'nav_back' ? 'Done' : icon === 'nav_home' ? '⌂' : '';
  const label = options.label != null ? String(options.label) : defaultLabel;
  const navBackText = icon === 'nav_back' && !!label && label !== '←';
  const action =
    typeof actionOrTarget === 'object' && actionOrTarget !== null
      ? actionOrTarget
      : { type: 'navigate', target: actionOrTarget, payload: payload || {} };
  const style = {
    backgroundColor: volunteerHomeSummaryBlue,
    borderRadius: VOLUNTEER_HOME_PILL_RADIUS,
    buttonVariant: 'raised',
    elevation: VOLUNTEER_HOME_BUTTON_ELEVATION_DP,
    height: { value: VOLUNTEER_HOME_BAR_MIN_HEIGHT_DP },
    width: navBackText ? undefined : { value: 48 },
    padding: { top: 0, bottom: 0, left: navBackText ? 12 : 8, right: navBackText ? 12 : 8 },
    navIcon: true,
    navBackText: navBackText || undefined,
  };
  return {
    type: 'button',
    icon,
    label,
    content: label,
    action,
    textStyle: {
      fontSize: navBackText ? 16 : 20,
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#FFFFFF',
    },
    style,
  };
}

function volunteerHomeFooterLabeledButtons(params = {}) {
  const labeledReturnTo = params.labeledReturnTo || params.returnTo;
  if (!labeledReturnTo || labeledReturnTo === 'jewelheart.home') return [];
  if (params.currentScreenId && labeledReturnTo === params.currentScreenId) return [];
  return [
    volunteerHomePillButton(
      'Done',
      labeledReturnTo,
      volunteerHomeBackPayload(params, labeledReturnTo),
      volunteerHomeSummaryBlue,
      '#FFFFFF',
      { hPad: 10 },
    ),
  ];
}

function volunteerHomeFooterNavRowChildren(params, backAction, backBtnOpts, homePayload, extraChildren = []) {
  const children = [
    volunteerHomeNavIconButton('nav_back', backAction, undefined, backBtnOpts),
    volunteerHomeNavIconButton('nav_home', 'jewelheart.home', homePayload),
  ];
  children.push(...extraChildren);
  return children;
}

/** Fixed bottom nav for Manage subtree: ←, ⌂, M (manage home). */
function volunteerHomeManageFooterNav(params = {}) {
  const homePayload = params.retreatId ? { retreatId: String(params.retreatId) } : {};
  const managePayload = volunteerHomeWithReturnTo(
    params.retreatId ? { retreatId: String(params.retreatId) } : {},
    'jewelheart.home',
  );
  const backAction = { type: 'navBack' };
  return {
    type: 'container',
    layout: 'row',
    spacing: 8,
    textStyle: { textAlign: 'center' },
    style: { padding: { top: 8, bottom: 8, left: 8, right: 8 }, fixedFooter: true },
    children: volunteerHomeFooterNavRowChildren(
      params,
      backAction,
      { label: 'Done' },
      homePayload,
      [
        volunteerHomeNavIconButton(
          'nav_back',
          'jewelheart.volunteer.manage',
          managePayload,
          { label: 'M' },
        ),
      ],
    ),
  };
}

/** Fixed bottom nav: ← (history back), ⌂ (home), optional labeled ← jumps. */
function volunteerHomeStandardFooterNav(params = {}) {
  if (params.footerNavManage === true) {
    return volunteerHomeManageFooterNav(params);
  }
  const homePayload = params.retreatId ? { retreatId: String(params.retreatId) } : {};
  const simple = params.footerNavSimple === true;
  const backLabel = params.navBackLabel != null ? String(params.navBackLabel) : 'Done';
  const backBtnOpts = { label: backLabel };
  const backAction =
    params.navBackTarget
      ? {
          type: 'navigate',
          target: String(params.navBackTarget),
          payload: params.navBackPayload && typeof params.navBackPayload === 'object'
            ? params.navBackPayload
            : {},
        }
      : { type: 'navBack' };
  return {
    type: 'container',
    layout: 'row',
    spacing: 8,
    textStyle: { textAlign: 'center' },
    style: { padding: { top: 8, bottom: 8, left: 8, right: 8 }, fixedFooter: true },
    children: volunteerHomeFooterNavRowChildren(
      params,
      backAction,
      backBtnOpts,
      homePayload,
      simple ? [] : volunteerHomeFooterLabeledButtons(params),
    ),
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
    children.push(
      volunteerHomePillButton(
        'Done',
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
      'Done',
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

function volunteerHomeBoldBodyText(content, warnings, code = 'hint_bold') {
  const fitted = volunteerHomeFitLine(content, VOLUNTEER_HOME_MAX_HINT_CHARS, warnings, code);
  return {
    type: 'text',
    content: fitted,
    textStyle: { fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
    style: { padding: { top: 8, bottom: 8, left: 8, right: 8 } },
  };
}

function volunteerHomeBoldColoredBodyText(content, color, warnings, code = 'hint_bold') {
  const fitted = volunteerHomeFitLine(content, VOLUNTEER_HOME_MAX_HINT_CHARS, warnings, code);
  return {
    type: 'text',
    content: fitted,
    textStyle: {
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'center',
      color: color || '#000000',
    },
    style: { padding: { top: 8, bottom: 8, left: 8, right: 8 } },
  };
}

/** Assign-to-me / assign-to-obo-target hint line. */
function volunteerAssignMeHintComponent(ctx, { isMine, isToday, checkinOp }) {
  const obo = Boolean(ctx.oboMode);
  const first = obo ? volunteerOboTargetFirstName(ctx) : '';
  const justReleased = checkinOp === 'unassign' && !isMine;
  if (justReleased) {
    return volunteerHomeBoldColoredBodyText(
      'Shift released / not assigned',
      '#000000',
      ctx.layoutWarnings,
      'shift_assign_released',
    );
  }
  if (isMine) {
    const msg = obo
      ? (isToday ? `Shift assigned to ${first} for today!` : `Shift assigned to ${first}!`)
      : (isToday ? 'Shift assigned for today!' : 'Shift assigned!');
    const color = isToday ? '#000000' : volunteerHomeMaroon;
    return volunteerHomeBoldColoredBodyText(
      msg,
      color,
      ctx.layoutWarnings,
      isToday ? 'shift_assign_today_ok' : 'shift_assign_ok',
    );
  }
  return volunteerHomeBoldColoredBodyText(
    obo ? `Tap to assign to ${first}. Again to undo.` : 'Tap to assign. Again to undo.',
    '#000000',
    ctx.layoutWarnings,
    'shift_assign_hint',
  );
}

/** Assign action button — self-service or OBO target. */
function volunteerAssignMeActionButton(ctx, {
  isMine,
  isToday,
  assignAttempted,
  shiftPayload,
  darkColor,
  lightColor,
  textColor,
}) {
  const obo = Boolean(ctx.oboMode);
  const first = obo ? volunteerOboTargetFirstName(ctx) : '';
  let assignLabel;
  let assignColor;
  let assignOp;
  if (isMine) {
    assignLabel = 'Undo - release shift';
    assignColor = lightColor;
    assignOp = 'unassign';
  } else if (assignAttempted) {
    assignLabel = `Fail${VOLUNTEER_HOME_EN_DASH}just taken by someone`;
    assignColor = lightColor;
    assignOp = 'assign';
  } else {
    assignLabel = obo
      ? (isToday ? `Assign shift today to ${first}` : `Assign this shift to ${first}`)
      : (isToday ? 'Assign shift today to me' : 'Assign this shift to me');
    assignColor = darkColor;
    assignOp = 'assign';
  }
  return volunteerHomeCenteredPill(
    volunteerHomeFitLine(assignLabel, VOLUNTEER_HOME_MAX_BAR_CHARS, ctx.layoutWarnings, 'shift_assign_btn'),
    'jewelheart.volunteer.shift',
    shiftPayload({ checkinOp: assignOp }),
    assignColor,
    textColor,
    { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
  );
}

/** Edit-shift status line(s) under Release / Undo buttons. */
function volunteerShiftEditStatusComponents(ctx, dayIso, editOutcome, layoutWarnings, options = {}) {
  const outcome = editOutcome === 'open' ? 'released' : editOutcome;
  const obo = Boolean(ctx.oboMode);
  const first = obo ? volunteerOboTargetFirstName(ctx) : '';
  if (outcome === 'reassigned') {
    const name = String(options.reassignedName || 'someone else').trim() || 'someone else';
    return [
      volunteerHomeEmphasisText(`Shift reassigned to ${name}!`, layoutWarnings, 'shift_edit_reassigned'),
    ];
  }
  if (outcome === 'released') {
    const items = [
      volunteerHomeEmphasisText('Shift released!', layoutWarnings, 'shift_edit_released_hdr'),
    ];
    if (dayIso === ctx.todayIso) {
      items.push(
        volunteerHomeBoldBodyText('Shift was today', layoutWarnings, 'shift_edit_today_line'),
        volunteerHomeBoldBodyText('Please find someone else', layoutWarnings, 'shift_edit_find_someone'),
      );
    }
    return items;
  }
  if (outcome === 'kept') {
    return [
      volunteerHomeEmphasisText(
        obo ? `Shift still assigned to ${first}` : 'Shift still assigned to you',
        layoutWarnings,
        'shift_edit_kept',
      ),
    ];
  }
  return [];
}

function volunteerShiftEditActionRow(options) {
  const {
    editTarget,
    releasePayload,
    undoPayload,
    releaseEnabled,
    undoEnabled,
  } = options;
  return volunteerHomeCenteredInlineRow(
    [
      volunteerHomePillButton(
        'Release shift',
        editTarget,
        releasePayload,
        releaseEnabled ? volunteerHomeMaroon : volunteerHomeMediumGray,
        '#FFFFFF',
        {
          hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          disabled: !releaseEnabled,
          noAction: !releaseEnabled,
        },
      ),
      volunteerHomePillButton(
        'Undo (keep shift)',
        editTarget,
        undoPayload,
        undoEnabled ? volunteerHomeSummaryBlue : volunteerHomeMediumGray,
        '#FFFFFF',
        {
          hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          disabled: !undoEnabled,
          noAction: !undoEnabled,
        },
      ),
    ],
    { spacing: 8 },
  );
}

/** Dark maroon bold emphasis — same size as body, stands out on edit-shift screens. */
function volunteerHomeEmphasisText(content, warnings, code = 'emphasis') {
  const fitted = volunteerHomeFitLine(content, VOLUNTEER_HOME_MAX_HINT_CHARS, warnings, code);
  return {
    type: 'text',
    content: fitted,
    textStyle: {
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'center',
      color: volunteerHomeMaroon,
    },
    style: { padding: { top: 8, bottom: 8, left: 8, right: 8 } },
  };
}

/** Home pill — same height as bars; raised styling in clients. */
function volunteerHomePillHPad(backgroundColor, options = {}) {
  if (options.hPad != null) return options.hPad;
  return String(backgroundColor || '').toUpperCase() === volunteerHomeGold
    ? VOLUNTEER_HOME_GOLD_BUTTON_H_PAD
    : VOLUNTEER_HOME_BUTTON_H_PAD;
}

function volunteerHomePillButton(
  label,
  target,
  payload,
  backgroundColor,
  textColor,
  options = {},
) {
  const fontSize = options.fontSize ?? VOLUNTEER_HOME_BAR_FONT_SP;
  const hPad = volunteerHomePillHPad(backgroundColor, options);
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
      earlyAlertPreviewPill: options.earlyAlertPreviewPill === true,
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
    homeActionPill: true,
    ...options,
  });
}

function volunteerHomeAdminWorkspaceButton(ctx) {
  const basePayload = volunteerHomeWithReturnTo(
    ctx?.retreatId ? { retreatId: ctx.retreatId } : {},
    'jewelheart.home',
  );
  return volunteerHomeCenteredPill(
    'Admin',
    'jewelheart.volunteer.admin',
    basePayload,
    volunteerHomeSummaryBlue,
    '#FFFFFF',
    { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
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

/** Retreat banner only (no second blue screen-title line). */
function volunteerHomeRetreatHeaderOnly(ctx) {
  return [
    volunteerHomeBar(ctx.retreatBannerLine, volunteerHomeSummaryBlue, volunteerHomeGold),
    volunteerHomeGap(),
  ];
}

/** Home header in obo mode: coral bar (tap to exit) + volunteer home line. */
function volunteerHomeOboBannerLine(ctx) {
  const retreat = ctx.retreat || VOLUNTEER_HOME_DEFAULT_RETREAT;
  const iso = ctx.todayIso || VOLUNTEER_HOME_DEMO_DAY_ISO;
  const dayNum = volunteerHomeDayNumber(retreat, iso);
  const weekday = volunteerHomeWeekdayShort(iso);
  const oboName = ctx.oboMode?.displayName || ctx.volunteerName || 'Volunteer';
  return `Day ${dayNum} ${weekday}${VOLUNTEER_HOME_EN_DASH}${oboName}`;
}

function volunteerHomeOboPayload(ctx, base = {}) {
  if (!ctx.oboMode?.volunteerId) return base;
  return {
    ...base,
    oboVolunteerId: ctx.oboMode.volunteerId,
    oboVolunteerName: ctx.oboMode.displayName || '',
  };
}

function volunteerOboTargetFirstName(ctx) {
  const name = ctx.oboMode?.displayName || ctx.volunteerName || 'them';
  return splitPersonName(name).firstName || name;
}

/** Find-screen header: retreat banner, or OBO coral bar + screen title. */
function volunteerHomeFindTitleHeader(ctx, titleText, warnCode = 'find_hdr') {
  const fitted = volunteerHomeFitLine(
    titleText,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    warnCode,
  );
  if (ctx.oboMode) {
    return [
      {
        type: 'container',
        layout: 'column',
        spacing: 0,
        style: { padding: { top: 6, bottom: 0, left: 0, right: 0 } },
        children: volunteerHomeTopBarsWithObo(ctx, {
          secondLine: fitted,
          secondLineFitted: true,
          secondLineWarnCode: warnCode,
        }),
      },
      volunteerHomeGap(),
    ];
  }
  return [
    ...volunteerHomeRetreatHeaderOnly(ctx),
    volunteerHomeBar(fitted, volunteerHomeSummaryBlue, '#FFFFFF'),
    volunteerHomeGap(),
  ];
}

function volunteerHomeFindSignupBarText(ctx, selfServeText) {
  if (!ctx.oboMode) return selfServeText;
  const first = volunteerOboTargetFirstName(ctx);
  if (selfServeText.includes('sign up for job')) {
    return `Tap day to assign job to ${first}`;
  }
  if (selfServeText.includes('sign up')) {
    return `Tap open shift to assign to ${first}`;
  }
  return selfServeText;
}

async function volunteerHomePerformShiftAssign(firebaseUid, retreatId, taskId, params = {}) {
  const oboVolunteerId = String(params.oboVolunteerId || '').trim();
  if (oboVolunteerId) {
    const oboTarget = await volunteerHomeResolveOboTarget(firebaseUid, retreatId, oboVolunteerId);
    if (!oboTarget) return false;
    const actor = await volunteerResolveSelf(firebaseUid, retreatId);
    return volunteerAssignVolunteerToTask(retreatId, taskId, oboTarget.volunteerId, {
      assignmentSource: 'obo',
      assignedByVolunteerId: actor?.id || null,
    });
  }
  const vol = await volunteerResolveSelf(firebaseUid, retreatId);
  if (!vol?.id) return false;
  return volunteerSelfAssign(retreatId, taskId, vol.id);
}

async function volunteerHomePerformShiftReassign(
  firebaseUid,
  retreatId,
  taskId,
  fromVolunteerId,
  toVolunteerId,
) {
  if (!retreatId || !taskId || !fromVolunteerId || !toVolunteerId) return false;
  if (String(fromVolunteerId) === String(toVolunteerId)) return false;
  await volunteerSelfUnassign(retreatId, taskId, fromVolunteerId);
  const actor = await volunteerResolveSelf(firebaseUid, retreatId);
  return volunteerAssignVolunteerToTask(retreatId, taskId, toVolunteerId, {
    assignmentSource: 'obo',
    assignedByVolunteerId: actor?.id || null,
  });
}

async function volunteerHomePerformShiftUnassign(firebaseUid, retreatId, taskId, params = {}) {
  const oboVolunteerId = String(params.oboVolunteerId || '').trim();
  let volunteerId;
  if (oboVolunteerId) {
    const oboTarget = await volunteerHomeResolveOboTarget(firebaseUid, retreatId, oboVolunteerId);
    if (!oboTarget) return false;
    volunteerId = oboTarget.volunteerId;
  } else {
    const vol = await volunteerResolveSelf(firebaseUid, retreatId);
    if (!vol?.id) return false;
    volunteerId = vol.id;
  }
  return volunteerSelfUnassign(retreatId, taskId, volunteerId);
}

function volunteerHomeTopBarsWithObo(ctx, options = {}) {
  const oboLine = volunteerHomeFitLine(
    volunteerHomeOboBannerLine(ctx),
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'obo_banner',
  );
  const secondLine = options.secondLine != null
    ? (options.secondLineFitted
      ? String(options.secondLine)
      : volunteerHomeFitLine(
          String(options.secondLine),
          VOLUNTEER_HOME_MAX_BAR_CHARS,
          ctx.layoutWarnings,
          options.secondLineWarnCode || 'obo_second_line',
        ))
    : ctx.volunteerHomeLine;
  return [
    volunteerHomeBar(oboLine, volunteerHomeOboBarColor, '#FFFFFF', { type: 'oboExit' }),
    volunteerHomeGap(),
    volunteerHomeBar(secondLine, volunteerHomeSummaryBlue, '#FFFFFF'),
  ];
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
    volunteerHomeBar(
      secondLine,
      options.secondBarColor || volunteerHomeSummaryBlue,
      options.secondBarTextColor || '#FFFFFF',
    ),
  ];
}

function volunteerHomeCompactTimeBar(text, slot = '') {
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
      ...(slot ? { checkinTimeBox: slot } : {}),
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

/** Status line under Start | times | End on the check-in screen. */
function volunteerHomeCheckinStatusMessage(checkinOp, tc, checkinCount, checkinsRequired) {
  const op = String(checkinOp || '').trim();
  if (op === 'undo') return 'Check-in canceled';
  if (op === 'start') return 'You are checked IN';
  if (op === 'finish') return 'You are checked in & OUT';
  if (tc?.open) return 'You are checked IN';
  const lastSession = tc?.sessions?.length ? tc.sessions[tc.sessions.length - 1] : null;
  const needMore = checkinCount < checkinsRequired;
  if (lastSession?.finishedAt && !needMore) return 'You are checked in & OUT';
  if (lastSession?.startedAt && !lastSession?.finishedAt) return 'You are checked IN';
  return '';
}

function volunteerHomeEarlyPreviewPillOptions(extra = {}) {
  return {
    homeActionPill: true,
    disabled: true,
    noAction: true,
    earlyAlertPreviewPill: true,
    ...extra,
  };
}

function volunteerHomeEarlyPreviewGoldPill(label) {
  return volunteerHomeCenteredPill(
    label,
    '',
    {},
    volunteerHomeGold,
    '#000000',
    volunteerHomeEarlyPreviewPillOptions(),
  );
}

/** Check-in screen: Start | times | End, then Undo (blue). Footer Done commits the visit. */
function volunteerHomeCheckinControlRows(options) {
  const {
    startEnabled,
    endEnabled,
    startTime,
    endTime,
    checkinTarget,
    checkinPayload,
    checkinStatusMessage = '',
    checkinWarning = '',
  } = options;
  const startBg = startEnabled ? volunteerHomeMaroon : volunteerHomeMediumGray;
  const endBg = endEnabled ? volunteerHomeMaroon : volunteerHomeMediumGray;
  const actionRow = volunteerHomeCenteredInlineRow(
    [
      volunteerHomePillButton(
        'Start',
        checkinTarget,
        { ...checkinPayload, checkinOp: 'start' },
        startBg,
        '#FFFFFF',
        {
          hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          disabled: !startEnabled,
          noAction: !startEnabled,
        },
      ),
      volunteerHomeCompactTimeBar(startTime || '', 'start'),
      {
        type: 'text',
        content: '–',
        textStyle: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', color: '#333333' },
        style: { padding: { top: 0, bottom: 0, left: 4, right: 4 } },
      },
      volunteerHomeCompactTimeBar(endTime || '', 'end'),
      volunteerHomePillButton(
        'End',
        checkinTarget,
        { ...checkinPayload, checkinOp: 'finish' },
        endBg,
        '#FFFFFF',
        {
          hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          disabled: !endEnabled,
          noAction: !endEnabled,
        },
      ),
    ],
    { spacing: 6, noWrap: true },
  );
  const commitRow = volunteerHomeCenteredInlineRow(
    [
      volunteerHomePillButton(
        'Undo',
        checkinTarget,
        { ...checkinPayload, checkinOp: 'undo' },
        volunteerHomeSummaryBlue,
        '#FFFFFF',
        { hPad: 10 },
      ),
    ],
    { spacing: 8 },
  );
  const rows = [actionRow];
  if (checkinStatusMessage) {
    rows.push(
      volunteerHomeGap(),
      volunteerHomeBoldBodyText(checkinStatusMessage, [], 'checkin_status'),
    );
  }
  if (checkinWarning) {
    rows.push(
      volunteerHomeGap(),
      volunteerHomeBoldColoredBodyText(
        checkinWarning,
        '#CC0000',
        [],
        'checkin_time_warn',
      ),
    );
  }
  rows.push(volunteerHomeGap(), volunteerHomeGap(), commitRow);
  return rows;
}

async function volunteerHomeRedirectScreen(returnTo, firebaseUid, authToken, params) {
  const dest = returnTo || 'jewelheart.home';
  if (dest === 'jewelheart.volunteer.mine') {
    return buildJewelheartVolunteerMineScreen(firebaseUid, authToken, params);
  }
  return buildJewelheartHomeScreen(firebaseUid, authToken, params);
}

function volunteerHomePersonPickerComponent(id, roster, options = {}) {
  return {
    type: 'personPicker',
    id: id || 'personPicker',
    placeholder: options.placeholder || 'Start typing a name here...',
    disabled: options.disabled === true,
    searchApi: options.searchApi || 'sdui',
    searchScope: options.searchScope || 'retreat+global',
    retreatId: options.retreatId ? String(options.retreatId) : '',
    excludeVolunteerId: options.excludeVolunteerId ? String(options.excludeVolunteerId) : '',
    roster: (roster || []).map((r) => ({
      id: String(r.id),
      displayName: r.displayName || r.display_name || '',
      email: r.email || '',
    })),
    maxVisible: options.maxVisible ?? 12,
    selectedId: options.selectedId ? String(options.selectedId) : '',
    selectedName: options.selectedName ? String(options.selectedName) : '',
    selectedHint: options.selectedHint ? String(options.selectedHint) : '',
  };
}

function volunteerHomeJobPickerComponent(id, jobs, options = {}) {
  return {
    type: 'jobPicker',
    id: id || 'jobPicker',
    placeholder: options.placeholder || 'Start typing a job name...',
    disabled: options.disabled === true,
    jobs: (jobs || []).map((j) => ({
      id: String(j.id || j.jobId || ''),
      title: j.title || '',
    })).filter((j) => j.id && j.title),
    maxVisible: options.maxVisible ?? 12,
    selectedId: options.selectedId ? String(options.selectedId) : '',
    selectedName: options.selectedName ? String(options.selectedName) : '',
    selectedHint: options.selectedHint ? String(options.selectedHint) : '',
  };
}

function volunteerHomeEditIconButton(target, payload) {
  return volunteerHomePillButton(
    '✎',
    target,
    payload,
    volunteerHomeSummaryBlue,
    '#FFFFFF',
    { hPad: 10, borderRadius: VOLUNTEER_HOME_PILL_RADIUS },
  );
}

function volunteerHomeMineShiftLabel(shift, index, ctx, code) {
  const jobName = volunteerHomeDisplayJobName(shift.jobTitle || shift.label);
  const earlyPreview = volunteerHomeShiftEarlyAlertPreview(shift, ctx.todayIso, ctx);
  return volunteerHomeDayJobLabel(
    jobName,
    shift.dayIso,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    code || `mine_${index}`,
    shift.jobTitle,
    { weekdayUpper: earlyPreview },
  );
}

function volunteerHomeMineShiftRow(
  shift,
  index,
  ctx,
  basePayload,
  returnTo,
  pillBg,
  pillFg,
  mainTarget,
  editTarget,
  code,
  showEditIcon = true,
  readOnly = false,
) {
  const label = volunteerHomeMineShiftLabel(shift, index, ctx, code);
  const earlyPreview = volunteerHomeShiftEarlyAlertPreview(shift, ctx.todayIso, ctx);
  const checkinEarlyPreview = earlyPreview && mainTarget === 'jewelheart.volunteer.checkin';
  if (readOnly) {
    return volunteerHomeCenteredInlineRow([
      volunteerHomePillButton(label, '', {}, pillBg, pillFg, {
        homeActionPill: true,
        disabled: true,
      }),
    ], { spacing: 8, noWrap: true });
  }
  const core = {
    ...basePayload,
    taskId: shift.taskId,
    jobId: shift.jobId,
    dayIso: shift.dayIso,
  };
  const mainPayload = volunteerHomeWithReturnTo(core, returnTo);
  const buttons = [
    checkinEarlyPreview
      ? volunteerHomePillButton(label, '', {}, pillBg, pillFg, volunteerHomeEarlyPreviewPillOptions())
      : volunteerHomePillButton(label, mainTarget, mainPayload, pillBg, pillFg, {
          homeActionPill: true,
        }),
  ];
  if (showEditIcon && editTarget) {
    buttons.push(volunteerHomeEditIconButton(editTarget, volunteerHomeWithReturnTo(core, returnTo)));
  }
  return volunteerHomeCenteredInlineRow(buttons, { spacing: 8, noWrap: true });
}

function volunteerHomeMineShiftMainPill(
  shift,
  index,
  ctx,
  basePayload,
  returnTo,
  pillBg,
  pillFg,
  mainTarget,
  code,
  readOnly = false,
) {
  const label = volunteerHomeMineShiftLabel(shift, index, ctx, code);
  const earlyPreview = volunteerHomeShiftEarlyAlertPreview(shift, ctx.todayIso, ctx);
  const checkinEarlyPreview = earlyPreview && mainTarget === 'jewelheart.volunteer.checkin';
  if (readOnly) {
    return volunteerHomeCenteredPill(
      label,
      '',
      {},
      pillBg,
      pillFg,
      { homeActionPill: true, disabled: true, noAction: true },
    );
  }
  if (checkinEarlyPreview) {
    return volunteerHomeCenteredPill(
      label,
      '',
      {},
      pillBg,
      pillFg,
      volunteerHomeEarlyPreviewPillOptions(),
    );
  }
  const core = {
    ...basePayload,
    taskId: shift.taskId,
    jobId: shift.jobId,
    dayIso: shift.dayIso,
  };
  return volunteerHomeCenteredPill(
    label,
    mainTarget,
    volunteerHomeWithReturnTo(core, returnTo),
    pillBg,
    pillFg,
    { homeActionPill: true },
  );
}

function volunteerHomeMineSectionRows(
  titleBar,
  barBg,
  barFg,
  shifts,
  ctx,
  basePayload,
  returnTo,
  pillBg,
  pillFg,
  mainTarget,
  editTarget,
  codePrefix,
  showEditIcon = true,
  readOnly = false,
) {
  if (!shifts.length) return [];
  const items = [
    volunteerHomeBar(titleBar, barBg, barFg),
    volunteerHomeGap(),
  ];
  shifts.forEach((shift, index) => {
    if (index > 0) items.push(volunteerHomeGap());
    items.push(
      volunteerHomeMineShiftRow(
        shift,
        index,
        ctx,
        basePayload,
        returnTo,
        pillBg,
        pillFg,
        mainTarget,
        editTarget,
        `${codePrefix}_${index}`,
        readOnly ? false : showEditIcon,
        readOnly,
      ),
    );
  });
  items.push(volunteerHomeGap());
  return items;
}

async function volunteerResolveShiftContext(firebaseUid, authToken, params, taskId) {
  let ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const paramRetreatId = params.retreatId ? String(params.retreatId) : '';
  const retreatId = ctx.retreatId || paramRetreatId || '';
  let shift = taskId ? (ctx.myShifts || []).find((s) => s.taskId === String(taskId)) : null;
  let meta = null;
  if (!shift && taskId && retreatId) {
    meta = await volunteerLoadTaskShiftMeta(retreatId, taskId);
  }
  return { ctx, shift, meta, retreatId, taskId: taskId ? String(taskId) : '' };
}

function volunteerShiftJobNameFromCtx(ctx, shift, meta, jobId, taskId) {
  return volunteerHomeDisplayJobName(
    shift?.jobTitle || shift?.label || meta?.jobTitle || volunteerHomeShiftJobName(ctx, jobId, taskId),
  );
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
      homeActionPill: true,
      parentCentered: true,
    },
  );
}

/** One check-in pill per row — same centered sizing as maroon home actions. */
function volunteerHomeTodayShiftButtons(ctx, checkInPayload) {
  const blocks = [];
  ctx.todayShifts.forEach((row, index) => {
    if (index > 0) blocks.push(volunteerHomeGap());
    if (row.earlyPreview) {
      blocks.push(volunteerHomeEarlyPreviewGoldPill(row.label));
      return;
    }
    const payload = { ...checkInPayload };
    if (row.taskId) payload.taskId = row.taskId;
    blocks.push(
      volunteerHomeCenteredGoldAction(
        row.label,
        'jewelheart.volunteer.checkin',
        volunteerHomeWithReturnTo(
          { ...payload, taskId: row.taskId },
          'jewelheart.home',
        ),
      ),
    );
  });
  return blocks;
}

/** Obo home: today shifts as inert gold pills (read-only). */
function volunteerHomeTodayShiftDisplayOnly(ctx) {
  const blocks = [];
  ctx.todayShifts.forEach((row, index) => {
    if (index > 0) blocks.push(volunteerHomeGap());
    const label = volunteerHomeDisplayJobName(row.label);
    const pill = volunteerHomePillButton(
      label,
      '',
      {},
      volunteerHomeGold,
      '#000000',
      { homeActionPill: true, parentCentered: true, disabled: true },
    );
    blocks.push({
      type: 'container',
      layout: 'column',
      spacing: 0,
      textStyle: { textAlign: 'center' },
      style: { padding: { top: 0, bottom: 0, left: 0, right: 0 } },
      children: [pill],
    });
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

function volunteerHomeCompactMaroonNavPill(label, target, payload, options = {}) {
  return volunteerHomePillButton(label, target, payload, volunteerHomeMaroon, '#FFFFFF', {
    hPad: 10,
    borderRadius: VOLUNTEER_HOME_PILL_RADIUS,
    ...options,
  });
}

/** Home find row: By day | By job & type. (All-at-once screen code kept; button removed.) */
function volunteerHomeFindOpenShiftsButtons(dayPayload, typePayload, _allPayloadUnused = null) {
  return {
    type: 'container',
    layout: 'flowRow',
    spacing: 8,
    textStyle: { textAlign: 'center' },
    style: {
      padding: { top: 0, bottom: 0, left: 6, right: 6 },
      homeFindShiftRow: true,
    },
    children: [
      volunteerHomeCompactMaroonNavPill('By day', 'jewelheart.volunteer.searchByDay', dayPayload),
      volunteerHomeCompactMaroonNavPill('By job & type', 'jewelheart.volunteer.searchByType', typePayload),
    ],
  };
}

/** OBO home footer: mine link, find & assign, exit hint. */
function volunteerHomeOboStationaryActions(ctx, searchPayload) {
  const homePayload = volunteerHomeOboPayload(ctx, volunteerHomeWithReturnTo(searchPayload, 'jewelheart.home'));
  const typeSearchPayload = volunteerHomeOboPayload(
    ctx,
    volunteerSearchByTypeNavPayload(
      ctx.retreatId ? { retreatId: ctx.retreatId } : {},
      'f',
      'jewelheart.home',
    ),
  );
  const daySearchPayload = volunteerHomeOboPayload(
    ctx,
    volunteerHomeWithReturnTo(
      ctx.retreatId ? { retreatId: ctx.retreatId } : {},
      'jewelheart.home',
    ),
  );
  const items = [];
  if ((ctx.shiftCount || 0) > 0) {
    items.push(
      volunteerHomeCenteredAction(
        'See all assigned shifts',
        'jewelheart.volunteer.mine',
        homePayload,
      ),
      volunteerHomeGap(),
    );
  }
  items.push(
    volunteerHomeInlineSectionLabel('Find & sign up for open shifts:'),
    volunteerHomeGap(),
    volunteerHomeFindOpenShiftsButtons(daySearchPayload, typeSearchPayload, homePayload),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      'On behalf of — find, assign, check-in & edit. Tap the coral bar above to exit.',
      ctx.layoutWarnings,
      'obo_exit_hint',
    ),
  );
  return items;
}

/** Home footer: maroon actions, Manage/Admin row. */
function volunteerHomeStationaryActions(ctx, searchPayload, access) {
  const homePayload = volunteerHomeWithReturnTo(searchPayload, 'jewelheart.home');
  const typeSearchPayload = volunteerSearchByTypeNavPayload(
    ctx.retreatId ? { retreatId: ctx.retreatId } : {},
    'f',
    'jewelheart.home',
  );
  const daySearchPayload = volunteerHomeWithReturnTo(
    ctx.retreatId ? { retreatId: ctx.retreatId } : {},
    'jewelheart.home',
  );
  const items = [];
  if ((ctx.shiftCount || 0) > 0) {
    items.push(
      volunteerHomeCenteredAction(
        'See all my assigned shifts',
        'jewelheart.volunteer.mine',
        homePayload,
      ),
      volunteerHomeGap(),
    );
  }
  items.push(
    volunteerHomeInlineSectionLabel('Find & sign up for open shifts:'),
    volunteerHomeGap(),
    volunteerHomeFindOpenShiftsButtons(daySearchPayload, typeSearchPayload, homePayload),
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
      volunteerHomeSmallBlueButton(
        'Admin',
        'jewelheart.volunteer.admin',
        basePayload,
      ),
    );
  }
  if (!buttons.length) return null;
  return volunteerHomeCenteredInlineRow(buttons, { noWrap: true, spacing: 8 });
}

/** Yellow summary bar + framed scroll region for today check-in pills. */
function volunteerHomeTodayShiftPanel(ctx, checkInPayload, options = {}) {
  const readOnly = options.readOnly === true;
  const todayShiftWord = ctx.todayCount === 1 ? 'shift' : 'shifts';
  const summaryBar = volunteerHomeBar(
    readOnly
      ? `${ctx.todayCount} ${todayShiftWord} today`
      : `${ctx.todayCount} ${todayShiftWord} left today${VOLUNTEER_HOME_EN_DASH}tap to check in`,
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
      },
      children: readOnly
        ? volunteerHomeTodayShiftDisplayOnly(ctx)
        : volunteerHomeTodayShiftButtons(ctx, checkInPayload),
    },
  };
}

/** Gold summary + framed pills in sticky header (bleeds below blue bars). */
function volunteerHomeTodayShiftPanelInHeader(todayPanel) {
  const summaryBar = {
    ...todayPanel.headerBar,
    style: {
      ...(todayPanel.headerBar.style || {}),
      instructionBarBleed: true,
    },
  };
  return {
    type: 'container',
    layout: 'column',
    spacing: 0,
    style: { todayShiftPanelInHeader: true, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
    children: [summaryBar, todayPanel.scroll],
  };
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
      padding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    children,
  };
}

/** Find-by-day open-shift list — blue frame bleeding into the blue header bar above. */
function volunteerHomeDayShiftListScroll(children) {
  return {
    type: 'container',
    layout: 'column',
    spacing: 0,
    style: {
      dayShiftListFrame: true,
      padding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    children,
  };
}

function volunteerHomeTypeFilterRow(buttons) {
  return {
    type: 'container',
    layout: 'flowRow',
    spacing: 10,
    textStyle: { textAlign: 'center' },
    style: {
      padding: { top: 0, bottom: 0, left: 8, right: 8 },
      wrapChildren: true,
      typeFilterRow: true,
      typeFilterRowSpread: true,
    },
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
  'jewelheart.volunteer.searchByDay': 'Find open shifts by day',
  'jewelheart.volunteer.assign': 'Open shifts',
  'jewelheart.volunteer.checkin': 'Check in',
  'jewelheart.volunteer.shiftInfo': 'Shift info',
  'jewelheart.volunteer.shiftEdit': 'Edit shift',
  'jewelheart.volunteer.mine': 'My assigned shifts',
  'jewelheart.volunteer.account': 'Account',
  'jewelheart.volunteer.preferences': 'Preferences',
  'jewelheart.volunteer.manage': 'Manage',
  'jewelheart.volunteer.manageCheckins': 'Check-ins',
  'jewelheart.volunteer.jobFinder': 'Job finder',
  'jewelheart.volunteer.userManage': 'User management',
  'jewelheart.volunteer.testing': 'Testing',
  'jewelheart.volunteer.admin': 'Admin',
  'jewelheart.volunteer.adminPrivileges': 'Privileges',
};

function volunteerHomeScreenEnvelope(id, title, children, layoutWarnings = [], extraMeta = {}) {
  const isHome = id === 'jewelheart.home';
  const homeSplit = isHome && extraMeta.homeSplitLayout === true;
  const shiftAssignFlex = extraMeta.shiftAssignFlexLayout === true;
  const searchByDayFlex = extraMeta.searchByDayFlexLayout === true;
  const searchByTypeFlex = extraMeta.searchByTypeFlexLayout === true;
  const manageCheckinsFlex = extraMeta.manageCheckinsFlexLayout === true;
  const findFlexLayout = shiftAssignFlex || searchByDayFlex || searchByTypeFlex || manageCheckinsFlex;
  const stickyHeaderComponents = extraMeta.stickyHeaderComponents || [];
  let stickyFooterComponents = extraMeta.stickyFooterComponents || [];
  if (!isHome && extraMeta.includeFooterNav !== false && !stickyFooterComponents.length) {
    stickyFooterComponents = [
      volunteerHomeStandardFooterNav({ ...(extraMeta.navParams || {}), currentScreenId: id }),
    ];
  }
  const stickyFooter = homeSplit || extraMeta.stickyFooter === true || stickyFooterComponents.length > 0;
  const stickyHeader = homeSplit || extraMeta.stickyHeader === true;
  const layoutFlat = extraMeta.layoutFlat === true && !homeSplit;
  if (homeSplit) {
    const flatComponents = layoutFlat
      ? [...stickyHeaderComponents, ...(extraMeta.scrollChildren || []), ...stickyFooterComponents]
      : extraMeta.scrollChildren || [];
    return {
      id,
      title: VOLUNTEER_SCREEN_TITLES[id] || title || 'JewelHeart',
      metadata: {
        app: 'jewelheart',
        buildStamp: VOLUNTEER_API_BUILD_STAMP,
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
        shiftEditState: extraMeta.shiftEditState || null,
        layoutWarningsBelowBuildStamp:
          layoutWarnings.length > 0 && extraMeta.hideBottomLayoutWarnings !== true,
        volunteerProfile: extraMeta.volunteerProfile || null,
      },
      components: flatComponents,
    };
  }
  const useFlatSticky = layoutFlat && stickyHeaderComponents.length > 0;
  const bodyChildren = useFlatSticky ? [...stickyHeaderComponents, ...children] : children;
  const bodyWrapStyle = {
    padding: isHome
      ? { top: 6, bottom: 6, left: 0, right: 0 }
      : findFlexLayout
        ? { top: 0, bottom: 0, left: 0, right: 0 }
        : { all: 12 },
  };
  if (shiftAssignFlex) {
    bodyWrapStyle.shiftAssignBody = true;
  }
  if (searchByDayFlex || searchByTypeFlex || manageCheckinsFlex) {
    bodyWrapStyle.searchByDayBody = true;
  }
  return {
    id,
    title: VOLUNTEER_SCREEN_TITLES[id] || title || 'JewelHeart',
    metadata: {
      app: 'jewelheart',
      buildStamp: VOLUNTEER_API_BUILD_STAMP,
      layoutWarnings,
      minWidthDp: VOLUNTEER_HOME_MIN_WIDTH_DP,
      edgeToEdgeBars: isHome,
      layoutFlat: useFlatSticky,
      shiftAssignFlexLayout: shiftAssignFlex,
      searchByDayFlexLayout: searchByDayFlex,
      searchByTypeFlexLayout: searchByTypeFlex,
      manageCheckinsFlexLayout: manageCheckinsFlex,
      stickyFooter,
      stickyFooterComponents,
      stickyHeader: useFlatSticky ? false : stickyHeader,
      stickyHeaderComponents: useFlatSticky ? [] : stickyHeaderComponents,
      filterState: extraMeta.filterState || null,
      shiftEditState: extraMeta.shiftEditState || null,
      layoutWarningsBelowBuildStamp:
        layoutWarnings.length > 0 && extraMeta.hideBottomLayoutWarnings !== true,
      volunteerProfile: extraMeta.volunteerProfile || null,
    },
    components: [
      {
        type: 'container',
        layout: 'column',
        spacing: 0,
        style: bodyWrapStyle,
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
  const enriched = await volunteerEnrichShiftsWithCheckins(volunteerId, mine);
  return {
    shiftCount: enriched.length,
    myShifts: enriched,
  };
}

/** Today’s shifts that still need check-in(s) — same rule as My shifts “todo today”. */
function volunteerHomeTodoTodayShifts(shifts, todayIso, ctx = null) {
  const filtered = (shifts || []).filter((s) => {
    if (volunteerShiftIsFulfilled(s)) return false;
    if (s.dayIso === todayIso) return true;
    if (ctx && volunteerHomeShiftEarlyAlertPreview(s, todayIso, ctx)) return true;
    return false;
  });
  return ctx ? volunteerHomeSortShiftsByDayThenJob(filtered, ctx) : filtered;
}

/** Volunteer record for the signed-in user (firebase uid match, else first linked). */
async function volunteerResolveSelf(firebaseUid, retreatId) {
  return resolveVolunteerIdForHome(firebaseUid, retreatId);
}

/**
 * Self-service assignment writes — direct SQL (volunteer action, not admin),
 * so anonymous Firebase sessions are not blocked by the admin retreat ACL.
 */
async function volunteerSelfAssign(retreatId, taskId, volunteerId, options = {}) {
  const source = options.assignmentSource || 'self';
  const assignedBy = options.assignedByVolunteerId ?? volunteerId;
  const { rows } = await query(
    `INSERT INTO jewelheart_assignments (task_id, volunteer_id, assigned_by_volunteer_id, assignment_source)
     SELECT t.id, $3, $4, $5
     FROM jewelheart_tasks t
     JOIN jewelheart_jobs j ON j.id = t.job_id
     WHERE t.id = $2 AND t.retreat_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM jewelheart_assignments a WHERE a.task_id = t.id AND a.volunteer_id = $3
       )
       AND (SELECT count(*) FROM jewelheart_assignments a WHERE a.task_id = t.id) < j.volunteers_needed
     RETURNING id`,
    [retreatId, taskId, volunteerId, assignedBy, source],
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

async function volunteerEnsureRetreatVolunteerLink(retreatId, volunteerId) {
  if (!retreatId || !volunteerId) return false;
  try {
    await query(
      `INSERT INTO jewelheart_retreat_volunteers (retreat_id, volunteer_id)
       VALUES ($1, $2)
       ON CONFLICT (retreat_id, volunteer_id) DO NOTHING`,
      [retreatId, volunteerId],
    );
    return true;
  } catch {
    return false;
  }
}

async function volunteerClearTaskAssignments(taskId) {
  if (!taskId) return;
  await query('DELETE FROM jewelheart_assignments WHERE task_id = $1', [taskId]);
}

async function volunteerAssignVolunteerToTask(retreatId, taskId, volunteerId, options = {}) {
  await volunteerEnsureRetreatVolunteerLink(retreatId, volunteerId);
  const source = options.assignmentSource || 'manager';
  const assignedBy = options.assignedByVolunteerId || null;
  const { rows } = await query(
    `INSERT INTO jewelheart_assignments (task_id, volunteer_id, assigned_by_volunteer_id, assignment_source)
     SELECT t.id, $3, $4, $5
     FROM jewelheart_tasks t
     JOIN jewelheart_jobs j ON j.id = t.job_id
     WHERE t.id = $2 AND t.retreat_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM jewelheart_assignments a WHERE a.task_id = t.id AND a.volunteer_id = $3
       )
       AND (SELECT count(*) FROM jewelheart_assignments a WHERE a.task_id = t.id) < j.volunteers_needed
     RETURNING id`,
    [retreatId, taskId, volunteerId, assignedBy, source],
  );
  return rows.length > 0;
}

async function volunteerLoadTaskShiftMeta(retreatId, taskId) {
  if (!retreatId || !taskId) return null;
  try {
    const { rows } = await query(
      `SELECT t.id AS "taskId",
              t.job_id AS "jobId",
              s.slot_date::text AS "dayIso",
              j.title AS "jobTitle"
       FROM jewelheart_tasks t
       JOIN jewelheart_slots s ON s.id = t.slot_id
       JOIN jewelheart_jobs j ON j.id = t.job_id
       WHERE t.retreat_id = $1 AND t.id = $2
       LIMIT 1`,
      [retreatId, taskId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      taskId: String(r.taskId),
      jobId: String(r.jobId),
      dayIso: String(r.dayIso).slice(0, 10),
      jobTitle: r.jobTitle || '',
    };
  } catch {
    return null;
  }
}

async function volunteerListRetreatRoster(retreatId, excludeVolunteerId = '') {
  if (!retreatId) return [];
  try {
    const { rows } = await query(
      `SELECT v.id, v.display_name AS "displayName", v.email
       FROM jewelheart_retreat_volunteers rv
       JOIN jewelheart_volunteers v ON v.id = rv.volunteer_id
       WHERE rv.retreat_id = $1
       ORDER BY v.display_name`,
      [retreatId],
    );
    const ex = String(excludeVolunteerId || '');
    return rows.filter((r) => String(r.id) !== ex);
  } catch {
    return [];
  }
}

function volunteerPersonSearchNormalizeQuery(q) {
  return String(q || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function volunteerPersonSearchWords(displayName) {
  return String(displayName || '')
    .toLowerCase()
    .split(/[\s\-']+/)
    .filter(Boolean);
}

function volunteerPersonSearchTokensMatchInOrder(tokens, words) {
  if (!tokens.length || !words.length) return false;
  let wi = 0;
  for (const token of tokens) {
    let matched = false;
    for (let i = wi; i < words.length; i++) {
      if (words[i].startsWith(token)) {
        matched = true;
        wi = i + 1;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

function volunteerPersonSearchScore(displayName, email, query) {
  const q = volunteerPersonSearchNormalizeQuery(query);
  if (!q) return -1;
  const name = String(displayName || '');
  const nameLc = name.toLowerCase();
  const words = volunteerPersonSearchWords(name);
  const tokens = q.split(' ').filter(Boolean);
  if (!tokens.length) return -1;
  if (tokens.length > 1) {
    if (!volunteerPersonSearchTokensMatchInOrder(tokens, words)) return -1;
  } else {
    const token = tokens[0];
    const emailLocal = email ? String(email).toLowerCase().split('@')[0] : '';
    const emailHit = token.length >= 2 && emailLocal && emailLocal.startsWith(token);
    const nameHit = words.some((w) => w.startsWith(token));
    if (!nameHit && !emailHit) return -1;
  }
  let score = tokens.length * 100;
  if (nameLc.startsWith(tokens[0])) score += 40;
  if (tokens.length > 1 && words.length > 1 && words[words.length - 1].startsWith(tokens[1])) {
    score += 30;
  }
  if (nameLc === q) score += 50;
  score -= name.length * 0.01;
  return score;
}

function volunteerFilterPersonRoster(roster, query, maxVisible = 12) {
  const list = Array.isArray(roster) ? roster : [];
  const q = volunteerPersonSearchNormalizeQuery(query);
  if (!q) return { items: [], total: 0, capped: false };
  const scored = [];
  for (const row of list) {
    const displayName = row.displayName || row.display_name || '';
    const email = row.email || '';
    const s = volunteerPersonSearchScore(displayName, email, q);
    if (s >= 0) scored.push({ row, score: s });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      String(a.row.displayName || a.row.display_name).localeCompare(
        String(b.row.displayName || b.row.display_name),
      ),
  );
  const total = scored.length;
  return {
    items: scored.slice(0, maxVisible).map((x) => x.row),
    total,
    capped: total > maxVisible,
  };
}

async function volunteerSearchPeopleGlobalDb(q, fetchLimit = 240) {
  const tokens = volunteerPersonSearchNormalizeQuery(q).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const first = tokens[0].replace(/[%_\\]/g, '');
  if (!first) return [];
  try {
    const { rows } = await query(
      `SELECT id, display_name AS "displayName", email
       FROM jewelheart_volunteers
       WHERE display_name ILIKE $1
          OR display_name ILIKE $2
          OR display_name ILIKE $3
          OR split_part(email, '@', 1) ILIKE $4
       ORDER BY display_name
       LIMIT $5`,
      [`${first}%`, `% ${first}%`, `%-${first}%`, `${first}%`, fetchLimit],
    );
    return rows;
  } catch {
    return [];
  }
}

/** Authenticated person search for SDUI picker (global directory + optional retreat roster). */
export async function searchJewelheartPeople(firebaseUid, authToken, params = {}) {
  if (!firebaseUid) return { items: [], total: 0, capped: false };
  const q = String(params.q || '').trim();
  if (!q) return { items: [], total: 0, capped: false };
  const maxVisible = Math.min(Math.max(parseInt(params.limit, 10) || 80, 1), 100);
  const exclude = String(params.excludeVolunteerId || '');
  const retreatId = params.retreatId ? String(params.retreatId) : '';
  const scope = String(params.scope || (retreatId ? 'retreat+global' : 'global')).toLowerCase();

  const byId = new Map();
  if (scope.includes('retreat') && retreatId) {
    for (const row of await volunteerListRetreatRoster(retreatId, exclude)) {
      byId.set(String(row.id), row);
    }
  }
  if (scope.includes('global')) {
    for (const row of await volunteerSearchPeopleGlobalDb(q, maxVisible * 8)) {
      if (String(row.id) !== exclude) byId.set(String(row.id), row);
    }
  }
  return volunteerFilterPersonRoster([...byId.values()], q, maxVisible);
}

async function volunteerResolveVolunteerDisplayName(volunteerId) {
  if (!volunteerId) return '';
  try {
    const { rows } = await query(
      'SELECT display_name AS "displayName" FROM jewelheart_volunteers WHERE id = $1',
      [volunteerId],
    );
    return rows[0]?.displayName || '';
  } catch {
    return '';
  }
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

function volunteerHomeMapTodayShifts(rawTodayShifts, layoutWarnings, ctx = null, todayIso = null) {
  const effectiveToday = todayIso || ctx?.todayIso || '';
  return rawTodayShifts.map((row, index) => {
    const jobTitle = row.jobTitle || row.label || '';
    const name = volunteerHomeDisplayJobName(jobTitle);
    const earlyPreview = ctx && effectiveToday
      ? volunteerHomeShiftEarlyAlertPreview(row, effectiveToday, ctx)
      : false;
    const labelOpts = { weekdayUpper: earlyPreview };
    const label = row.dayIso
      ? volunteerHomeDayJobPillLabel(
          name,
          row.dayIso,
          VOLUNTEER_HOME_MAX_BAR_CHARS,
          layoutWarnings,
          `today_shift_${index}`,
          jobTitle,
          labelOpts,
        )
      : volunteerHomeJobPillLabel(
          name,
          VOLUNTEER_HOME_MAX_BAR_CHARS,
          layoutWarnings,
          `today_shift_${index}`,
          jobTitle,
        );
    return { taskId: row.taskId, label, earlyPreview };
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
    todayShifts: volunteerHomeMapTodayShifts(
      rawTodayShifts,
      layoutWarnings,
      { jobs: extras.jobs, todayIso },
      todayIso,
    ),
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

async function volunteerHomeResolveOboTarget(firebaseUid, retreatId, oboVolunteerId) {
  if (!firebaseUid || !retreatId || !oboVolunteerId) return null;
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const isManager = await volunteerHomeIsManager(firebaseUid);
  if (!isAdmin && !isManager) return null;
  const target = await volunteerLoadUserManageTarget(retreatId, oboVolunteerId);
  if (!target?.id) return null;
  return {
    volunteerId: target.id,
    displayName: target.displayName || 'Volunteer',
  };
}

/** Shared header data for home and volunteer search screens. */
export async function gatherVolunteerHomeContext(firebaseUid, authToken = undefined, options = {}) {
  const explicitRetreatId = options.retreatId ? String(options.retreatId).trim() : '';
  const timeCtx = await buildVolunteerTimeContext(query);
  const todayIso = timeCtx.todayIso;

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
  let oboMode = null;

  try {
    const { items: retreats } = await listRetreats(firebaseUid, authToken);
    retreat = volunteerHomePickRetreatFromList(retreats, todayIso, explicitRetreatId);
    if (retreat && timeCtx.retreatDateOverride) {
      retreat = {
        ...retreat,
        startDate: timeCtx.retreat.startDate,
        endDate: timeCtx.retreat.endDate,
      };
    }
    if (!retreat) {
      usingDemo = true;
      errorNote = 'No retreat found.';
    } else {
      searchableDayIsos = volunteerHomeSearchableDates(retreat, todayIso);

      const oboVolunteerIdOpt = options.oboVolunteerId
        ? String(options.oboVolunteerId).trim()
        : '';
      if (oboVolunteerIdOpt) {
        oboMode = await volunteerHomeResolveOboTarget(
          firebaseUid,
          retreat.id,
          oboVolunteerIdOpt,
        );
      }

      if (oboMode) {
        volunteerId = oboMode.volunteerId;
        volunteerName = oboMode.displayName;
      } else {
        const volunteerRow = await resolveVolunteerIdForHome(firebaseUid, retreat.id);
        volunteerId = (volunteerRow && volunteerRow.id) || null;
        if (volunteerRow?.displayName) volunteerName = volunteerRow.displayName;
      }

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
        myShifts = loaded.myShifts;
        try {
          const jobRes = await listJobs(firebaseUid, retreat.id, authToken);
          jobs = volunteerHomeSortJobs(jobRes?.items || []);
        } catch {
          jobs = [];
        }
        const todoCtx = { jobs };
        const todoToday = volunteerHomeTodoTodayShifts(myShifts, todayIso, todoCtx);
        todayCount = todoToday.length;
        rawTodayShifts = todoToday;
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
      {
        jobs,
        usingDemo,
        errorNote,
        volunteerId,
        myShifts,
        testingEnabled: timeCtx.testingEnabled,
        liveTodayIso: timeCtx.liveTodayIso,
        pinnedTodayIso: timeCtx.pinnedTodayIso,
        retreatDateOverride: timeCtx.retreatDateOverride,
        testingNote: timeCtx.testingNote,
      },
    ),
    searchableDayIsos: usingDemo
      ? [todayIso, addDaysIsoYmd(todayIso, 1), addDaysIsoYmd(todayIso, 2)]
      : searchableDayIsos,
    hasAnnouncements: volunteerHasUnreadAnnouncements(firebaseUid),
    firebaseUid,
    volunteerName,
    oboMode: oboMode
      ? { volunteerId: oboMode.volunteerId, displayName: oboMode.displayName }
      : null,
  };
}

/** @returns screen object for buildSduiResponse wrap() */
export async function buildJewelheartHomeScreen(firebaseUid, authToken = undefined, params = {}) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const isManager = await volunteerHomeIsManager(firebaseUid);
  const testersChannel = volunteerHomeIsTestersChannel(params);

  const todoToday = volunteerHomeTodoTodayShifts(ctx.myShifts, ctx.todayIso, ctx);
  const homeCtx = {
    ...ctx,
    todayCount: todoToday.length,
    todayShifts: volunteerHomeMapTodayShifts(
      todoToday,
      ctx.layoutWarnings,
      ctx,
      ctx.todayIso,
    ),
    shiftsSummaryLine: volunteerHomeFitLine(
      volunteerHomeShiftsSummaryLine(ctx.shiftCount, todoToday.length),
      VOLUNTEER_HOME_MAX_BAR_CHARS,
      ctx.layoutWarnings,
      'shifts_summary',
    ),
  };

  const searchPayload = volunteerHomeWithReturnTo(
    {
      ...(ctx.retreatId ? { retreatId: ctx.retreatId } : {}),
      ...volunteerSearchFilterResetState(),
    },
    'jewelheart.home',
  );
  const checkInPayload = volunteerHomeOboPayload(ctx, { ...searchPayload });

  const inOboMode = Boolean(ctx.oboMode);
  const todayPanel = homeCtx.todayCount > 0
    ? volunteerHomeTodayShiftPanel(homeCtx, checkInPayload, { readOnly: false })
    : null;

  const headerChildren = [
    {
      type: 'container',
      layout: 'column',
      spacing: 0,
      style: { padding: { top: 6, bottom: 0, left: 0, right: 0 } },
      children: [
        ...(inOboMode ? volunteerHomeTopBarsWithObo(ctx) : volunteerHomeTopBlueBars(homeCtx)),
        ...(todayPanel ? [volunteerHomeTodayShiftPanelInHeader(todayPanel)] : []),
      ],
    },
  ];

  const scrollChildren = [];

  const footerExtras = [];
  if (ctx.errorNote) {
    footerExtras.push({
      type: 'text',
      content: ctx.errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }
  if (ctx.usingDemo) {
    footerExtras.push({
      type: 'text',
      content: 'Demo schedule — link volunteer for live data.',
      textStyle: { fontSize: 11, textAlign: 'center', color: '#666666' },
    });
  }
  footerExtras.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));

  const footerChildren = [
    {
      type: 'container',
      layout: 'column',
      spacing: 0,
      style: { padding: { top: 0, bottom: 6, left: 0, right: 0 } },
      children: [
        volunteerHomeGap(),
        ...(inOboMode
          ? volunteerHomeOboStationaryActions(ctx, searchPayload)
          : volunteerHomeStationaryActions(ctx, searchPayload, { isAdmin, isManager, testersChannel })),
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
    footerNavSimple: Boolean(ctx.oboMode),
  };
  const basePayload = volunteerHomeOboPayload(ctx, retreatId ? { retreatId } : {});
  const searchTarget = 'jewelheart.volunteer.search';
  const assignTarget = 'jewelheart.volunteer.assign';

  const headerChildren = [
    ...volunteerHomeFindTitleHeader(ctx, 'Find open shifts by filter', 'search_filter_hdr'),
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
  { code: VOLUNTEER_JOB_TYPE_ALL, label: 'All\njobs', allJobs: true },
];

/**
 * Find open shifts by job type — one type selected; open shifts grouped by job then day.
 */
export async function buildJewelheartVolunteerSearchByTypeScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const retreatId = params.retreatId || ctx.retreatId || '';
  const returnTo = params.returnTo || 'jewelheart.home';
  const basePayload = volunteerHomeOboPayload(ctx, retreatId ? { retreatId } : {});
  const searchTarget = 'jewelheart.volunteer.searchByType';
  const selectedMode = volunteerSearchByTypeSelectedMode(params);
  const allJobsMode = selectedMode === VOLUNTEER_JOB_TYPE_ALL;
  const navParams = {
    retreatId: retreatId || '',
    returnTo,
    daysAll: '1',
    selectedDays: '',
    jobsAll: allJobsMode ? '1' : '0',
    selectedJobs: '',
    jobType: allJobsMode ? VOLUNTEER_JOB_TYPE_ALL : selectedMode,
    typeJobPrefs: '',
    navBackLabel: 'Done',
    footerNavSimple: Boolean(ctx.oboMode),
  };

  const typeButtons = VOLUNTEER_JOB_TYPE_BUTTONS.map(({ code, label, allJobs }) => {
    const selected = code === selectedMode;
    const typePayload = allJobs
      ? volunteerSearchByTypeAllJobsNavPayload(basePayload, returnTo, selected ? { scrollTop: '1' } : {})
      : volunteerSearchByTypeNavPayload(basePayload, code, returnTo, selected ? { scrollTop: '1' } : {});
    return volunteerHomeFilterToggleButton(label, selected, searchTarget, typePayload, {
      multiline: true,
      hPad: 10,
      fontSize: 12,
    });
  });

  const headerChildren = [
    ...volunteerHomeFindTitleHeader(
      ctx,
      'Select job type - Open shifts below',
      'search_by_type_select_hdr',
    ),
    volunteerHomeTypeFilterRow(typeButtons),
    volunteerHomeSpacer(10),
  ];
  const signupBar = volunteerHomeBar(
    volunteerHomeFindSignupBarText(ctx, 'Tap day to sign up for job'),
    volunteerHomeSummaryBlue,
    '#FFFFFF',
  );
  signupBar.style = { ...(signupBar.style || {}), instructionBarBleed: true };
  headerChildren.push(signupBar);

  const matches = await volunteerSearchMatchingShifts(
    ctx,
    volunteerSearchByTypeSearchParams(selectedMode),
    firebaseUid,
    authToken,
  );
  const typeMatches = volunteerSearchByTypeGroupedMatches(matches, ctx, selectedMode);
  const jobsWithDays = volunteerSearchByTypeMatchesByJob(matches, ctx, selectedMode);
  const shiftBase = allJobsMode
    ? volunteerSearchByTypeAllJobsNavPayload(basePayload, returnTo)
    : volunteerSearchByTypeNavPayload(basePayload, selectedMode, returnTo);

  const scrollInner = [];
  if (!typeMatches.length) {
    scrollInner.push(
      volunteerHomeBodyText(
        allJobsMode ? 'No open shifts.' : 'No open shifts for this job type.',
        ctx.layoutWarnings,
        'search_by_type_empty',
      ),
    );
  } else {
    for (let i = 0; i < jobsWithDays.length; i++) {
      const job = jobsWithDays[i];
      const isLast = i === jobsWithDays.length - 1;
      scrollInner.push(
        volunteerHomeOpenShiftJobHeaderBar(
          job.jobName,
          ctx.layoutWarnings,
          `search_by_type_job_${job.jobId}`,
        ),
        volunteerHomeOpenShiftDayButtonsRow(
          job.days.map((row) => volunteerHomeOpenShiftDayPill(row.dayIso, row, shiftBase)),
        ),
      );
      if (!isLast) scrollInner.push(volunteerHomeOpenShiftJobGroupGap());
    }
  }

  const scrollChildren = [volunteerHomeDayShiftListScroll(scrollInner)];

  if (ctx.errorNote) {
    headerChildren.push({
      type: 'text',
      content: ctx.errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }

  const footerComponents = [
    volunteerHomeStandardFooterNav(navParams),
    ...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings),
  ];

  return volunteerHomeScreenEnvelope(
    'jewelheart.volunteer.searchByType',
    'JewelHeart',
    scrollChildren,
    ctx.layoutWarnings,
    {
      layoutFlat: true,
      searchByTypeFlexLayout: true,
      stickyHeaderComponents: headerChildren,
      stickyFooterComponents: footerComponents,
      navParams,
    },
  );
}

/** Find open shifts by day — one day selected; open shifts scroll below blue header. */
export async function buildJewelheartVolunteerSearchByDayScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const retreatId = params.retreatId || ctx.retreatId || '';
  const retreat = ctx.retreat || VOLUNTEER_HOME_DEFAULT_RETREAT;
  const allDayIsos = volunteerHomeRetreatDates(retreat);
  const selectedDay = volunteerSearchByDaySelectedIso(params, allDayIsos, ctx.todayIso);
  const returnTo = params.returnTo || 'jewelheart.home';
  const basePayload = volunteerHomeOboPayload(ctx, retreatId ? { retreatId } : {});
  const searchTarget = 'jewelheart.volunteer.searchByDay';
  const navParams = {
    retreatId: retreatId || '',
    returnTo,
    daysAll: '0',
    selectedDays: selectedDay,
    selectedDay,
    jobsAll: '1',
    selectedJobs: '',
    navBackLabel: 'Done',
    footerNavSimple: Boolean(ctx.oboMode),
  };

  const dayButtons = [];
  for (const iso of allDayIsos) {
    const label = volunteerHomeWeekdayShort(iso);
    if (iso < ctx.todayIso) {
      dayButtons.push(
        volunteerHomeFilterToggleButton(label, false, searchTarget, basePayload, { past: true, hPad: 5 }),
      );
      continue;
    }
    const selected = iso === selectedDay;
    const dayPayload = volunteerSearchByDayNavPayload(
      basePayload,
      iso,
      returnTo,
      selected ? { scrollTop: '1' } : {},
    );
    dayButtons.push(
      volunteerHomeFilterToggleButton(label, selected, searchTarget, dayPayload, { hPad: 5 }),
    );
  }

  const headerChildren = [
    ...volunteerHomeFindTitleHeader(
      ctx,
      'Select day - Open shifts shown below',
      'search_by_day_select_hdr',
    ),
    volunteerHomeWrappedFilterRow(dayButtons, { spacing: 4, sidePad: 4, compactWrap: true }),
    volunteerHomeSpacer(10),
  ];
  const signupBar = volunteerHomeBar(
    volunteerHomeFindSignupBarText(ctx, 'Tap open shift to sign up'),
    volunteerHomeSummaryBlue,
    '#FFFFFF',
  );
  signupBar.style = { ...(signupBar.style || {}), instructionBarBleed: true };
  headerChildren.push(signupBar);

  const matches = await volunteerSearchMatchingShifts(
    ctx,
    volunteerSearchByDaySearchParams(selectedDay),
    firebaseUid,
    authToken,
  );
  const dayMatches = matches
    .filter((row) => row.dayIso === selectedDay)
    .sort((a, b) => volunteerHomeCompareJobIds(a.jobId, b.jobId, ctx));
  const shiftBase = volunteerSearchByDayNavPayload(basePayload, selectedDay, returnTo);

  const scrollInner = [];
  if (!dayMatches.length) {
    scrollInner.push(
      volunteerHomeBodyText('No open shifts for this day.', ctx.layoutWarnings, 'search_by_day_empty'),
    );
  } else {
    for (const row of dayMatches) {
      const rowLabel = volunteerHomeDayJobLabel(
        row.label,
        row.dayIso,
        VOLUNTEER_HOME_MAX_BAR_CHARS,
        ctx.layoutWarnings,
        `search_by_day_${row.jobId}_${row.dayIso}`,
      );
      scrollInner.push(
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
          },
          volunteerHomeLightMaroon,
          '#FFFFFF',
          { homeActionPill: true },
        ),
      );
    }
  }

  const scrollChildren = [volunteerHomeDayShiftListScroll(scrollInner)];

  if (ctx.errorNote) {
    headerChildren.push({
      type: 'text',
      content: ctx.errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }

  const footerComponents = [
    volunteerHomeStandardFooterNav(navParams),
    ...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings),
  ];

  return volunteerHomeScreenEnvelope(
    'jewelheart.volunteer.searchByDay',
    'JewelHeart',
    scrollChildren,
    ctx.layoutWarnings,
    {
      layoutFlat: true,
      searchByDayFlexLayout: true,
      stickyHeaderComponents: headerChildren,
      stickyFooterComponents: footerComponents,
      navParams,
    },
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
  const basePayload = volunteerHomeOboPayload(ctx, retreatId ? { retreatId } : {});
  const navParams = {
    retreatId: retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
    daysAll: volunteerSearchDaysAllParam(params),
    selectedDays: params.selectedDays || '',
    jobsAll: volunteerSearchJobsAllParam(params),
    selectedJobs: params.selectedJobs || '',
    jobType: volunteerSearchJobTypeParam(params),
    typeJobPrefs: params.typeJobPrefs || '',
    footerNavSimple: Boolean(ctx.oboMode),
  };
  const shiftBase = volunteerSearchFilterPayloadFromParams(basePayload, navParams, 'jewelheart.home');

  const matches = await volunteerSearchMatchingShifts(ctx, params, firebaseUid, authToken);

  const children = [
    ...volunteerHomeFindTitleHeader(
      ctx,
      `Open shifts -- ${matches.length} shown by day:`,
      'assign_results_hdr',
    ),
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

/** Instruction lines for a job: DB subjobs, else poster lines, else demo task lines, else placeholder. */
function volunteerHomeJobInstructionLines(ctx, jobId, taskId) {
  const meta = volunteerHomeInstructionMeta(ctx, jobId, taskId);
  const job = (ctx.jobs || []).find((j) => String(j.id) === String(jobId));
  const subjobs = (job?.subjobs || [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((s) => String(s.text || '').trim())
    .filter(Boolean);
  if (subjobs.length) {
    const stripped = stripLeadingTitleFragments(subjobs, meta.title, meta.dbTitle);
    if (stripped.length) return stripped;
  }
  const posterInstructions = volunteerHomePosterInstructions(ctx, jobId, taskId);
  if (posterInstructions) {
    return stripLeadingTitleFragments(posterInstructions, meta.title, meta.dbTitle);
  }
  const demoTask = VOLUNTEER_HOME_DEMO_TASKS[taskId] || VOLUNTEER_HOME_DEMO_TASKS[jobId];
  if (demoTask?.instructions?.length) {
    return stripLeadingTitleFragments(demoTask.instructions, meta.title, meta.dbTitle);
  }
  return ['No instructions on file for this job.'];
}

function volunteerHomeShiftJobName(ctx, jobId, taskId) {
  const job = (ctx.jobs || []).find((j) => String(j.id) === String(jobId));
  if (job?.title) return volunteerHomeDisplayJobName(job.title);
  const posterJob = getPosterSearchJobs().find((j) => j.id === jobId || j.id === taskId);
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

/** Wrap instruction bar + scroll so the scroll region can flex-fill the viewport. */
function volunteerHomeInstructionFlexWrap(children) {
  return {
    type: 'container',
    layout: 'column',
    spacing: 0,
    style: {
      instructionFlexWrap: true,
      flexGrow: true,
    },
    children,
  };
}

/** Blue job title + time bar plus scrollable instruction block (web: framed, bleeds into bar). */
function volunteerHomeInstructionScrollSection(jobTitle, lines, warnings, codePrefix = 'instr', options = {}) {
  const flexFill = options.flexFill === true;
  const scrollStyle = {
    borderColor: volunteerHomeSummaryBlue,
  };
  if (flexFill) {
    scrollStyle.instructionScrollFlex = true;
    scrollStyle.flexGrow = true;
  } else if (options.maxHeight != null) {
    scrollStyle.maxHeight = { value: options.maxHeight };
  }
  const scrollBlock = {
    type: 'instructionScroll',
    layout: 'column',
    spacing: 0,
    style: scrollStyle,
    children: (lines || []).map((line) => volunteerHomeInstructionText(line)),
  };
  if (options.titleBar === false) {
    return flexFill ? [volunteerHomeInstructionFlexWrap([scrollBlock])] : [scrollBlock];
  }
  const bar = volunteerHomeBar(
    volunteerHomeInstructionBarLabel(
      jobTitle,
      options.estMinutes,
      warnings,
      `${codePrefix}_bar`,
    ),
    volunteerHomeSummaryBlue,
    '#FFFFFF',
  );
  bar.style = { ...(bar.style || {}), instructionBarBleed: true };
  const parts = [bar, scrollBlock];
  return flexFill ? [volunteerHomeInstructionFlexWrap(parts)] : parts;
}

/**
 * Shift page — `jewelheart.volunteer.shift`.
 * Params: shiftOp ('assign_me' from Open shifts, 'mine' from My assigned shifts),
 * jobId, dayIso, taskId, checkinOp ('assign' performs the DB assignment).
 *
 * Shows day+job bar (gold if today, blue otherwise), assign or check-in button,
 * then the job instructions (scrolling). Instruction bar shows title + est. minutes.
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
    try {
      await volunteerHomePerformShiftAssign(firebaseUid, paramRetreatId, taskId, params);
    } catch {
      /* surfaced below via assignment state */
    }
  } else if (checkinOp === 'unassign' && taskId && paramRetreatId) {
    try {
      await volunteerHomePerformShiftUnassign(firebaseUid, paramRetreatId, taskId, params);
    } catch {
      /* fall through; state re-derived from DB below */
    }
  }

  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const inOboMode = Boolean(ctx.oboMode);
  const myShiftForTask = taskId
    ? (ctx.myShifts || []).find((s) => s.taskId === taskId)
    : null;
  if (!jobId && myShiftForTask) jobId = myShiftForTask.jobId;
  const retreatId = paramRetreatId || ctx.retreatId || '';
  const dayIso = String(params.dayIso || myShiftForTask?.dayIso || ctx.todayIso);
  const basePayload = volunteerHomeOboPayload(ctx, retreatId ? { retreatId } : {});
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
    footerNavSimple: inOboMode,
  };

  const jobName = volunteerHomeShiftJobName(ctx, jobId, taskId);
  const isToday = dayIso === ctx.todayIso;
  const isMine = volunteerHomeIsMyTask(ctx, taskId);
  const isAssignMe = shiftOp === 'assign_me';
  const instrMeta = volunteerHomeInstructionMeta(ctx, jobId, taskId);
  const instructionLines = volunteerHomeJobInstructionLines(ctx, jobId, taskId);

  // Toggle assign button: light (initial/fail) ↔ dark (success); gold family if
  // today, maroon family otherwise. Text color: black on gold, white on maroon.
  const darkColor = isToday ? volunteerHomeGold : volunteerHomeMaroon;
  const lightColor = isToday ? volunteerHomeLightGold : volunteerHomeLightMaroon;
  const textColor = isToday ? '#000000' : '#FFFFFF';
  const todaySuffix = isToday ? ' today' : '';
  const shiftPayload = (extra = {}) =>
    volunteerHomeOboPayload(
      ctx,
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
      ),
    );

  if (isAssignMe) {
    navParams.navBackLabel = 'Done';
    const titleLine = volunteerHomeFitLine(
      volunteerHomeDayJobLabel(jobName, dayIso, VOLUNTEER_HOME_MAX_BAR_CHARS, ctx.layoutWarnings, 'shift_title_job'),
      VOLUNTEER_HOME_MAX_BAR_CHARS,
      ctx.layoutWarnings,
      'shift_title',
    );
    let secondBarColor = volunteerHomeSummaryBlue;
    let secondBarTextColor = '#FFFFFF';
    if (isMine) {
      secondBarColor = isToday ? volunteerHomeGold : volunteerHomeMaroon;
      secondBarTextColor = isToday ? '#000000' : '#FFFFFF';
    }
    const headerChildren = inOboMode
      ? [
          {
            type: 'container',
            layout: 'column',
            spacing: 0,
            style: { padding: { top: 6, bottom: 0, left: 0, right: 0 } },
            children: volunteerHomeTopBarsWithObo(ctx, {
              secondLine: titleLine,
              secondLineFitted: true,
              secondLineWarnCode: 'shift_title',
            }),
          },
          volunteerHomeGap(),
        ]
      : [
          ...volunteerHomeHeaderChildren(ctx, titleLine, dayIso, {
            alreadyFitted: true,
            secondBarColor,
            secondBarTextColor,
          }),
        ];
    headerChildren.push(
      volunteerAssignMeHintComponent(ctx, { isMine, isToday, checkinOp }),
      volunteerHomeGap(),
      volunteerAssignMeActionButton(ctx, {
        isMine,
        isToday,
        assignAttempted,
        shiftPayload,
        darkColor,
        lightColor,
        textColor,
      }),
    );
    const scrollChildren = [
      volunteerHomeSpacer(VOLUNTEER_HOME_ACTION_SECTION_SPACER),
      ...volunteerHomeInstructionScrollSection(
        instrMeta.title,
        instructionLines,
        ctx.layoutWarnings,
        'shift_instr',
        { estMinutes: instrMeta.estMinutes },
      ),
    ];
    const footerComponents = [
      volunteerHomeStandardFooterNav(navParams),
      ...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings),
    ];
    return volunteerHomeScreenEnvelope(
      'jewelheart.volunteer.shift',
      'JewelHeart',
      scrollChildren,
      ctx.layoutWarnings,
      {
        layoutFlat: true,
        shiftAssignFlexLayout: true,
        stickyHeaderComponents: headerChildren,
        stickyFooterComponents: footerComponents,
        navParams,
      },
    );
  }

  let assignLabel;
  let assignColor;
  let assignOp;
  if (isMine) {
    assignLabel = `Success${VOLUNTEER_HOME_EN_DASH}assigned to me${todaySuffix}`;
    assignColor = lightColor;
    assignOp = 'unassign';
  } else if (assignAttempted) {
    assignLabel = `Fail${VOLUNTEER_HOME_EN_DASH}just taken by someone`;
    assignColor = lightColor;
    assignOp = 'assign';
  } else {
    assignLabel = isToday ? 'Assign shift today to me' : 'Assign this shift to me';
    assignColor = darkColor;
    assignOp = 'assign';
  }
  const assignButton = volunteerHomeCenteredPill(
    volunteerHomeFitLine(assignLabel, VOLUNTEER_HOME_MAX_BAR_CHARS, ctx.layoutWarnings, 'shift_assign_btn'),
    'jewelheart.volunteer.shift',
    shiftPayload({ checkinOp: assignOp }),
    assignColor,
    textColor,
    { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
  );

  const children = [];
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
  children.push(...volunteerHomeHeaderChildren(ctx, signupTitle, dayIso, { alreadyFitted: true }), volunteerHomeGap());

  const cancelTarget = 'jewelheart.volunteer.mine';
  const cancelPayload = volunteerHomeWithReturnTo({ ...basePayload }, 'jewelheart.home');
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
  children.push(assignButton);

  // Job title + time bar + scrolling instructions.
  children.push(
    volunteerHomeSpacer(VOLUNTEER_HOME_ACTION_SECTION_SPACER),
    ...volunteerHomeInstructionScrollSection(
      instrMeta.title,
      instructionLines,
      ctx.layoutWarnings,
      'shift_instr',
      { estMinutes: instrMeta.estMinutes },
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
  // Full hint text; no ellipsis truncation. Clients wrap.
  return raw;
}

/**
 * My assignments — four scrolling sections per docs/sdui/my-assignments.md.
 */
export async function buildJewelheartVolunteerMineScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const inOboMode = Boolean(ctx.oboMode);
  const retreatId = ctx.retreatId || (params.retreatId ? String(params.retreatId) : '');
  const basePayload = volunteerHomeOboPayload(ctx, retreatId ? { retreatId } : {});
  const returnTo = params.returnTo || 'jewelheart.home';
  const navParams = {
    retreatId,
    returnTo: returnTo === 'jewelheart.volunteer.mine' ? 'jewelheart.home' : returnTo,
    currentScreenId: 'jewelheart.volunteer.mine',
    footerNavSimple: inOboMode,
  };
  const todayIso = ctx.todayIso;
  const shifts = (ctx.myShifts || []).slice();

  const totalText = volunteerHomeFitLine(
    volunteerAssignedShiftsSummary(shifts.length),
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'mine_title',
  );

  const headerChildren = inOboMode
    ? [
        {
          type: 'container',
          layout: 'column',
          spacing: 0,
          style: { padding: { top: 6, bottom: 0, left: 0, right: 0 } },
          children: [
            ...volunteerHomeTopBarsWithObo(ctx, { secondLine: totalText, secondLineFitted: true }),
            volunteerHomeGap(),
          ],
        },
      ]
    : [
        ...volunteerHomeRetreatHeaderOnly(ctx),
        volunteerHomeBar(totalText, volunteerHomeSummaryBlue, '#FFFFFF'),
        volunteerHomeGap(),
      ];

  const scrollChildren = [];

  const todoToday = volunteerHomeTodoTodayShifts(shifts, todayIso, ctx);
  const doneToday = volunteerHomeSortShiftsByDayThenJob(
    shifts.filter((s) => s.dayIso === todayIso && volunteerShiftIsFulfilled(s)),
    ctx,
  );
  const future = volunteerHomeSortShiftsByDayThenJob(
    shifts.filter((s) => s.dayIso > todayIso),
    ctx,
  );
  const past = volunteerHomeSortShiftsByDayThenJob(
    shifts.filter((s) => s.dayIso < todayIso),
    ctx,
  );

  const scrollSections = [];

  if (todoToday.length) {
    const title = volunteerHomeFitLine(
      `${volunteerHomeCountLabel(todoToday.length, 'todo today', 'todo today')} – tap chk-in – ✎ edit`,
      VOLUNTEER_HOME_MAX_BAR_CHARS,
      ctx.layoutWarnings,
      'mine_todo_today',
    );
    scrollSections.push(
      ...volunteerHomeMineSectionRows(
        title,
        volunteerHomeGold,
        '#000000',
        todoToday,
        ctx,
        basePayload,
        'jewelheart.volunteer.mine',
        volunteerHomeGold,
        '#000000',
        'jewelheart.volunteer.checkin',
        'jewelheart.volunteer.shiftEdit',
        'mine_todo',
        true,
        false,
      ),
    );
  }

  if (future.length) {
    const futureTitle = inOboMode
      ? `${volunteerHomeCountLabel(future.length, 'future shift', 'future shifts')} – tap info – ✎ edit`
      : volunteerFutureShiftsBar(future.length);
    const title = volunteerHomeFitLine(
      futureTitle,
      VOLUNTEER_HOME_MAX_BAR_CHARS,
      ctx.layoutWarnings,
      'mine_future',
    );
    scrollSections.push(
      ...volunteerHomeMineSectionRows(
        title,
        volunteerHomeMaroon,
        '#FFFFFF',
        future,
        ctx,
        basePayload,
        'jewelheart.volunteer.mine',
        volunteerHomeMaroon,
        '#FFFFFF',
        'jewelheart.volunteer.shiftInfo',
        'jewelheart.volunteer.shiftEdit',
        'mine_future',
        true,
        false,
      ),
    );
  }

  if (doneToday.length) {
    const doneTitle = inOboMode
      ? `${volunteerHomeCountLabel(doneToday.length, 'shift today is done', 'shifts today are done')}`
      : volunteerDoneTodayBar(doneToday.length);
    const title = volunteerHomeFitLine(
      doneTitle,
      VOLUNTEER_HOME_MAX_BAR_CHARS,
      ctx.layoutWarnings,
      'mine_done_today',
    );
    scrollSections.push(
      volunteerHomeBar(title, volunteerHomeLightMaroon, '#FFFFFF'),
      volunteerHomeGap(),
    );
    doneToday.forEach((shift, index) => {
      if (index > 0) scrollSections.push(volunteerHomeGap());
      scrollSections.push(
        volunteerHomeMineShiftMainPill(
          shift,
          index,
          ctx,
          basePayload,
          'jewelheart.volunteer.mine',
          volunteerHomeLightMaroon,
          '#FFFFFF',
          'jewelheart.volunteer.shiftInfo',
          `mine_done_${index}`,
          inOboMode,
        ),
      );
    });
    scrollSections.push(volunteerHomeGap());
  }

  if (past.length) {
    const pastTitle = `${volunteerHomeCountLabel(past.length, 'on past days', 'on past days')} – tap for info`;
    const title = volunteerHomeFitLine(
      pastTitle,
      VOLUNTEER_HOME_MAX_BAR_CHARS,
      ctx.layoutWarnings,
      'mine_past',
    );
    scrollSections.push(
      volunteerHomeBar(title, volunteerHomeLightMaroon, '#FFFFFF'),
      volunteerHomeGap(),
    );
    past.forEach((shift, index) => {
      if (index > 0) scrollSections.push(volunteerHomeGap());
      scrollSections.push(
        volunteerHomeMineShiftRow(
          shift,
          index,
          ctx,
          basePayload,
          'jewelheart.volunteer.mine',
          volunteerHomeLightMaroon,
          '#FFFFFF',
          'jewelheart.volunteer.shiftInfo',
          null,
          `mine_past_${index}`,
          false,
          false,
        ),
      );
    });
    scrollSections.push(volunteerHomeGap());
  }

  if (!scrollSections.length) {
    scrollChildren.push(
      volunteerHomeCenteredPill(
        'No shifts assigned for retreat',
        'jewelheart.volunteer.mine',
        volunteerHomeWithReturnTo(basePayload, returnTo),
        volunteerHomeMaroon,
        '#FFFFFF',
        { hPad: VOLUNTEER_HOME_BUTTON_H_PAD, disabled: true, noAction: true },
      ),
      volunteerHomeGap(),
    );
  } else {
    scrollChildren.push({
      type: 'container',
      layout: 'column',
      spacing: 0,
      style: { flexGrow: true, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
      children: scrollSections,
    });
  }

  const mineExtras = {
    navParams,
    stickyHeader: true,
    stickyHeaderComponents: headerChildren,
    layoutWarningsBelowBuildStamp: true,
  };
  if (inOboMode) {
    mineExtras.stickyFooter = true;
    mineExtras.includeFooterNav = false;
    mineExtras.stickyFooterComponents = [
      {
        type: 'container',
        layout: 'column',
        spacing: 0,
        style: { padding: { top: 0, bottom: 0, left: 0, right: 0 } },
        children: [
          volunteerHomeGap(),
          volunteerHomeBodyText(
            'On behalf of — find, assign, check-in & edit. Tap the coral bar above to exit.',
            ctx.layoutWarnings,
            'obo_mine_hint',
          ),
        ],
      },
      volunteerHomeStandardFooterNav(navParams),
    ];
  }

  return volunteerHomeScreenEnvelope(
    'jewelheart.volunteer.mine',
    'JewelHeart',
    scrollChildren,
    ctx.layoutWarnings,
    mineExtras,
  );
}

/** Check-in for shift — docs/sdui/shift-check-in.md */
export async function buildJewelheartVolunteerCheckinScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const taskId = params.taskId ? String(params.taskId) : '';
  const checkinOp = params.checkinOp ? String(params.checkinOp) : '';
  const returnTo = params.returnTo || 'jewelheart.home';
  let { ctx, shift, meta, retreatId } = await volunteerResolveShiftContext(firebaseUid, authToken, params, taskId);

  if (checkinOp === 'done') {
    if (taskId && shift) {
      const assignment = await volunteerResolveCheckinAssignment(ctx, shift, taskId);
      const baselineIds = volunteerParseCheckinBaselineIds(params.checkinBaselineIds);
      const manualStart = String(params.checkinManualStart || '') === '1';
      const manualEnd = String(params.checkinManualEnd || '') === '1';
      const startLabel = String(params.checkinStartTime || '').trim();
      const finishLabel = String(params.checkinFinishTime || '').trim();
      if ((manualStart || manualEnd) && startLabel && finishLabel) {
        const valid = volunteerValidateClockPairLabels(startLabel, finishLabel);
        if (!valid.ok) {
          return buildJewelheartVolunteerCheckinScreen(firebaseUid, authToken, {
            ...params,
            checkinOp: '',
            checkinTimeError: valid.error || 'Invalid times.',
          });
        }
        if (assignment) {
          const performedBy = await volunteerHomeCheckinPerformedBy(firebaseUid, ctx);
          await volunteerApplyManualCheckinDoneDb(
            assignment,
            ctx.todayIso,
            startLabel,
            finishLabel,
            baselineIds,
            undefined,
            performedBy,
          );
        }
      } else if (assignment) {
        await volunteerCheckinDoneDb(assignment, baselineIds);
      }
    }
    return volunteerHomeRedirectScreen(returnTo, firebaseUid, authToken, params);
  }

  if (checkinOp && taskId && shift) {
    await volunteerApplyCheckinOp(firebaseUid, taskId, checkinOp, ctx.volunteerName, ctx);
    ({ ctx, shift, meta, retreatId } = await volunteerResolveShiftContext(firebaseUid, authToken, params, taskId));
  }

  if (!shift) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Check in',
      'Shift not found or not assigned to you.',
      params,
      'jewelheart.volunteer.checkin',
    );
  }

  const inOboMode = Boolean(ctx.oboMode);
  const basePayload = volunteerHomeOboPayload(ctx, retreatId ? { retreatId } : {});
  const dayIso = shift.dayIso || String(params.dayIso || ctx.todayIso);
  const jobId = shift.jobId || String(params.jobId || '');
  const jobName = volunteerShiftJobNameFromCtx(ctx, shift, meta, jobId, taskId);
  const checkinTarget = 'jewelheart.volunteer.checkin';
  const assignment = await volunteerResolveCheckinAssignment(ctx, shift, taskId);
  const baselineIds = await volunteerResolveCheckinBaselineIds(params, assignment, checkinOp);
  const baselineParam = volunteerCheckinBaselineIdsParam(baselineIds);
  const detailPayload = volunteerHomeOboPayload(
    ctx,
    volunteerHomeWithReturnTo(
      { ...basePayload, taskId, jobId, dayIso, checkinBaselineIds: baselineParam },
      returnTo,
    ),
  );
  const donePayload = { ...detailPayload, checkinOp: 'done' };
  const navParams = {
    ...detailPayload,
    returnTo,
    footerNavSimple: true,
    navBackLabel: 'Done',
    navBackTarget: checkinTarget,
    navBackPayload: donePayload,
  };
  const tc = await volunteerTaskCheckinStateFromDb(assignment);
  const checkinsRequired = assignment?.checkinsRequired ?? shift.checkinsRequired ?? 1;
  const checkinCount = assignment?.checkinCount ?? shift.checkinCount ?? tc.sessions.length;

  const isToday = dayIso === ctx.todayIso;
  let displayStart = '';
  let displayEnd = '';
  let startEnabled = isToday;
  let endEnabled = false;

  if (tc.open) {
    displayStart = volunteerHomeFormatTimeAm(tc.open.startedAt);
    startEnabled = false;
    endEnabled = isToday;
  } else {
    const lastSession = tc.sessions.length ? tc.sessions[tc.sessions.length - 1] : null;
    const needMore = checkinCount < checkinsRequired;
    if (lastSession?.finishedAt && !needMore) {
      displayStart = volunteerHomeFormatTimeAm(lastSession.startedAt);
      displayEnd = volunteerHomeFormatTimeAm(lastSession.finishedAt);
      startEnabled = false;
      endEnabled = false;
    } else if (lastSession?.startedAt && !lastSession?.finishedAt) {
      displayStart = volunteerHomeFormatTimeAm(lastSession.startedAt);
      startEnabled = false;
      endEnabled = isToday;
    } else {
      displayStart = '';
      displayEnd = '';
      startEnabled = isToday;
      endEnabled = false;
    }
  }

  const titleBar = volunteerHomeFitLine(
    `Check in${VOLUNTEER_HOME_EN_DASH}${jobName}`,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'checkin_title',
  );

  const children = [
    ...volunteerHomeFindTitleHeader(ctx, titleBar, 'checkin_title'),
  ];

  if (inOboMode) {
    children.push(
      volunteerHomeBodyText(
        `Checking in on behalf of ${volunteerOboTargetFirstName(ctx)}.`,
        ctx.layoutWarnings,
        'checkin_obo_hint',
      ),
      volunteerHomeGap(),
    );
  }

  if (!isToday) {
    children.push(
      volunteerHomeBodyText('Check-in is only available for today\'s shifts.', ctx.layoutWarnings, 'checkin_not_today'),
      volunteerHomeGap(),
    );
    displayStart = '';
    displayEnd = '';
    startEnabled = false;
    endEnabled = false;
  }

  const checkinStatusMessage = volunteerHomeCheckinStatusMessage(
    checkinOp,
    tc,
    checkinCount,
    checkinsRequired,
  );

  children.push(
    ...volunteerHomeCheckinControlRows({
      startEnabled,
      endEnabled,
      startTime: displayStart,
      endTime: displayEnd,
      checkinTarget,
      checkinPayload: detailPayload,
      checkinStatusMessage,
      checkinWarning: params.checkinTimeError ? String(params.checkinTimeError) : '',
    }),
    volunteerHomeGap(),
    ...volunteerHomeInstructionScrollSection(
      jobName,
      volunteerHomeJobInstructionLines(ctx, jobId, taskId),
      ctx.layoutWarnings,
      'checkin_instr',
      { flexFill: true },
    ),
    volunteerHomeGap(),
  );

  return volunteerHomeScreenEnvelope('jewelheart.volunteer.checkin', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
    layoutWarningsBelowBuildStamp: true,
  });
}

/** Shift info — docs/sdui/shift-info.md */
export async function buildJewelheartVolunteerShiftInfoScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const taskId = params.taskId ? String(params.taskId) : '';
  const returnTo = params.returnTo || 'jewelheart.home';
  const { ctx, shift, meta, retreatId } = await volunteerResolveShiftContext(firebaseUid, authToken, params, taskId);

  if (!shift && !meta) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Shift info',
      'Shift not found or not assigned to you.',
      params,
      'jewelheart.volunteer.shiftInfo',
    );
  }

  const dayIso = shift?.dayIso || meta?.dayIso || String(params.dayIso || ctx.todayIso);
  const jobId = shift?.jobId || meta?.jobId || String(params.jobId || '');
  const jobName = volunteerShiftJobNameFromCtx(ctx, shift, meta, jobId, taskId);
  const basePayload = retreatId ? { retreatId } : {};
  const navParams = { ...volunteerHomeWithReturnTo({ ...basePayload, taskId, jobId, dayIso }, returnTo), footerNavSimple: true };

  const titleBar = volunteerHomeFitLine(
    `Info${VOLUNTEER_HOME_EN_DASH}${jobName}`,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'shift_info_title',
  );

  const children = [
    ...volunteerHomeRetreatHeaderOnly(ctx),
    volunteerHomeBar(titleBar, volunteerHomeSummaryBlue, '#FFFFFF'),
    volunteerHomeGap(),
    ...volunteerHomeInstructionScrollSection(
      jobName,
      volunteerHomeJobInstructionLines(ctx, jobId, taskId),
      ctx.layoutWarnings,
      'shift_info_instr',
      { titleBar: false, flexFill: true },
    ),
    volunteerHomeGap(),
  ];

  return volunteerHomeScreenEnvelope('jewelheart.volunteer.shiftInfo', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
    layoutWarningsBelowBuildStamp: true,
  });
}

/** Edit shift — release; OBO adds reassign to another volunteer. */
export async function buildJewelheartVolunteerShiftEditScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const taskId = params.taskId ? String(params.taskId) : '';
  const shiftEditOp = params.shiftEditOp ? String(params.shiftEditOp) : '';
  const returnTo = params.returnTo || 'jewelheart.home';
  let editOutcome = params.editOutcome ? String(params.editOutcome) : '';
  let reassignedName = params.reassignedName ? String(params.reassignedName) : '';
  if (editOutcome === 'open') editOutcome = 'released';

  let { ctx, shift, meta, retreatId } = await volunteerResolveShiftContext(firebaseUid, authToken, params, taskId);
  const inOboMode = Boolean(ctx.oboMode);
  const vol = ctx.volunteerId || (await volunteerResolveSelf(firebaseUid, retreatId))?.id;

  if (shiftEditOp === 'release' && shift && retreatId && vol) {
    if (await volunteerHomePerformShiftUnassign(firebaseUid, retreatId, taskId, params)) {
      editOutcome = 'released';
    }
    ({ ctx, shift, meta, retreatId } = await volunteerResolveShiftContext(firebaseUid, authToken, params, taskId));
  } else if (shiftEditOp === 'undo' && retreatId && vol && taskId) {
    if (await volunteerHomePerformShiftAssign(firebaseUid, retreatId, taskId, params)) {
      editOutcome = 'kept';
    }
    ({ ctx, shift, meta, retreatId } = await volunteerResolveShiftContext(firebaseUid, authToken, params, taskId));
  } else if (shiftEditOp === 'reassign' && retreatId && vol && taskId) {
    const pickId = String(params.pickVolunteerId || '').trim();
    const pickName = String(params.reassignedName || '').trim();
    if (pickId) {
      const ok = await volunteerHomePerformShiftReassign(firebaseUid, retreatId, taskId, vol, pickId);
      if (ok) {
        editOutcome = 'reassigned';
        reassignedName = pickName || reassignedName;
      }
    }
    ({ ctx, shift, meta, retreatId } = await volunteerResolveShiftContext(firebaseUid, authToken, params, taskId));
  }

  const assigned = Boolean(shift);
  const isReleasedState = editOutcome === 'released';
  const isReassignedState = editOutcome === 'reassigned';
  const releaseEnabled = assigned && !isReleasedState && !isReassignedState;
  const undoEnabled = isReleasedState;

  if (!taskId || (!shift && !meta && !isReassignedState)) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Edit shift',
      'Shift not found.',
      params,
      'jewelheart.volunteer.shiftEdit',
    );
  }

  const dayIso = shift?.dayIso || meta?.dayIso || String(params.dayIso || ctx.todayIso);
  const jobId = shift?.jobId || meta?.jobId || String(params.jobId || '');
  const jobName = volunteerShiftJobNameFromCtx(ctx, shift, meta, jobId, taskId);
  const dayLabel = volunteerHomeWeekdayShort(dayIso);
  const basePayload = volunteerHomeOboPayload(ctx, retreatId ? { retreatId } : {});
  const corePayload = { ...basePayload, taskId, jobId, dayIso };
  const editTarget = 'jewelheart.volunteer.shiftEdit';
  const editPayloadBase = volunteerHomeOboPayload(
    ctx,
    volunteerHomeWithReturnTo(
      {
        ...corePayload,
        ...(editOutcome ? { editOutcome } : {}),
        ...(reassignedName ? { reassignedName } : {}),
      },
      returnTo,
    ),
  );
  const releasePayload = { ...editPayloadBase, shiftEditOp: 'release' };
  const undoPayload = { ...editPayloadBase, shiftEditOp: 'undo' };
  const navParams = {
    ...editPayloadBase,
    returnTo,
    footerNavSimple: true,
  };

  const titleText = volunteerHomeFitLine(
    `Edit${VOLUNTEER_HOME_EN_DASH}${dayLabel}${VOLUNTEER_HOME_EN_DASH}${jobName}`,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'shift_edit_title',
  );

  const children = [
    ...volunteerHomeFindTitleHeader(ctx, titleText, 'shift_edit_title'),
  ];

  if (inOboMode && releaseEnabled) {
    children.push(
      volunteerHomeBodyText(
        `Editing shift for ${volunteerOboTargetFirstName(ctx)}.`,
        ctx.layoutWarnings,
        'shift_edit_obo_hint',
      ),
      volunteerHomeGap(),
    );
  }

  if (releaseEnabled || undoEnabled) {
    children.push(
      volunteerShiftEditActionRow({
        editTarget,
        releasePayload,
        undoPayload,
        releaseEnabled,
        undoEnabled,
      }),
    );
  }

  if (inOboMode && releaseEnabled && retreatId) {
    const roster = await volunteerListRetreatRoster(retreatId, ctx.oboMode?.volunteerId || '');
    children.push(
      volunteerHomeGap(),
      volunteerHomeBodyText('Or reassign to someone else:', ctx.layoutWarnings, 'shift_edit_reassign_hdr'),
      volunteerHomeGap(),
      volunteerHomePersonPickerComponent('shiftEditReassignPicker', roster, {
        searchScope: 'retreat+global',
        retreatId,
        excludeVolunteerId: ctx.oboMode?.volunteerId || '',
        selectedHint: 'Selected — tap Reassign',
      }),
      volunteerHomeGap(),
      volunteerHomeCenteredPill(
        'Reassign',
        editTarget,
        {
          ...editPayloadBase,
          shiftEditConfirm: '1',
          pickVolunteerFrom: 'shiftEditReassignPicker',
        },
        volunteerHomeOboBarColor,
        '#FFFFFF',
        { hPad: VOLUNTEER_HOME_BUTTON_H_PAD },
      ),
    );
  }

  children.push(
    ...volunteerShiftEditStatusComponents(ctx, dayIso, editOutcome, ctx.layoutWarnings, { reassignedName }),
    volunteerHomeGap(),
    ...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings),
  );

  const shiftEditState = editOutcome ? { outcome: editOutcome } : null;

  return volunteerHomeScreenEnvelope('jewelheart.volunteer.shiftEdit', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
    shiftEditState,
  });
}

/** Legacy parametric screen — routes to checkin / info / edit. */
export async function buildJewelheartVolunteerShiftDetailScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const mode = String(params.shiftMode || 'edit').toLowerCase();
  if (mode === 'info') {
    return buildJewelheartVolunteerShiftInfoScreen(firebaseUid, authToken, params);
  }
  if (params.checkinOp && String(params.checkinOp) !== 'unassign') {
    return buildJewelheartVolunteerCheckinScreen(firebaseUid, authToken, params);
  }
  return buildJewelheartVolunteerShiftEditScreen(firebaseUid, authToken, params);
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
  const profile = await loadVolunteerProfileForSelf(firebaseUid, authToken);
  const navParams = {
    retreatId: ctx.retreatId || params.retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
  };

  if (!profile) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Account',
      'Complete volunteer onboarding on the login page before using Account.',
      params,
      'jewelheart.volunteer.account',
    );
  }

  const { firstName, lastName } = splitPersonName(profile.displayName);
  const email = String(profile.email || '').trim();
  const phone = String(profile.phone || '').trim();
  const canEditEmail = !email;
  const canEditPhone = !phone;
  const displayName = profile.displayName || 'Volunteer';

  const children = [
    ...volunteerAccountPrefsHeader(ctx, 'Account', displayName, ctx.layoutWarnings, 'acct_header'),
    volunteerProfilePanel([
      volunteerProfileField('First name', firstName, { fieldKey: 'firstName' }),
      volunteerProfileField('Last name', lastName, { fieldKey: 'lastName' }),
      volunteerProfileField('Email address', email, {
        editable: canEditEmail,
        fieldKey: 'email',
        placeholder: 'Add your email address',
      }),
      volunteerProfileField('Phone number', phone, {
        editable: canEditPhone,
        fieldKey: 'phone',
        placeholder: 'Add your phone number',
      }),
    ]),
  ];

  if (canEditEmail || canEditPhone) {
    children.push(
      volunteerHomeGap(),
      volunteerHomeCenteredPill(
        'Save',
        '',
        { saveProfile: true },
        volunteerHomeMaroon,
        '#FFFFFF',
        { action: { type: 'patchVolunteer', payload: { mode: 'profile' } } },
      ),
    );
  }

  children.push(volunteerHomeGap(), ...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));

  return volunteerHomeScreenEnvelope(
    'jewelheart.volunteer.account',
    'Account',
    children,
    ctx.layoutWarnings,
    {
      navParams,
      hideBottomLayoutWarnings: true,
      volunteerProfile: {
        volunteerId: profile.id,
        canEditEmail,
        canEditPhone,
      },
    },
  );
}

export async function buildJewelheartVolunteerPreferencesScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const profile = await loadVolunteerProfileForSelf(firebaseUid, authToken);
  const navParams = {
    retreatId: ctx.retreatId || params.retreatId || '',
    returnTo: params.returnTo || 'jewelheart.home',
  };

  if (!profile) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Preferences',
      'Complete volunteer onboarding on the login page before using Account.',
      params,
      'jewelheart.volunteer.preferences',
    );
  }

  const email = String(profile.email || '').trim();
  const phone = String(profile.phone || '').trim();
  const displayName = profile.displayName || 'Volunteer';

  const children = [
    ...volunteerAccountPrefsHeader(ctx, 'Preferences', displayName, ctx.layoutWarnings, 'prefs_header'),
    volunteerProfilePanel([
      volunteerProfilePanelIntro('Send me once daily reminders of my shifts:'),
      volunteerPrefCheckbox(
        volunteerPrefNotifyLabel('email', email),
        profile.notifyEmail !== false,
        'notifyEmail',
        { disabled: !email },
      ),
      volunteerPrefCheckbox(
        volunteerPrefNotifyLabel('text', phone),
        profile.notifySms === true,
        'notifySms',
        { disabled: !phone },
      ),
    ]),
    volunteerHomeGap(),
    ...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings),
  ];

  return volunteerHomeScreenEnvelope(
    'jewelheart.volunteer.preferences',
    'Preferences',
    children,
    ctx.layoutWarnings,
    {
      navParams,
      hideBottomLayoutWarnings: true,
      volunteerProfile: {
        volunteerId: profile.id,
      },
    },
  );
}

async function volunteerLoadUserManageTarget(retreatId, volunteerId) {
  if (!retreatId || !volunteerId) return null;
  try {
    const { rows } = await query(
      `SELECT v.id, v.display_name AS "displayName", v.email, v.phone,
              v.firebase_uid AS "firebaseUid"
       FROM jewelheart_volunteers v
       JOIN jewelheart_retreat_volunteers rv ON rv.volunteer_id = v.id
       WHERE rv.retreat_id = $1 AND v.id = $2
       LIMIT 1`,
      [retreatId, volunteerId],
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

function volunteerHomeNormalizeDayIso(iso) {
  if (!iso) return '';
  if (iso instanceof Date) return iso.toISOString().slice(0, 10);
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

async function volunteerLoadTaskAssignmentDetails(taskId) {
  if (!taskId) return [];
  try {
    const { rows: assignments } = await query(
      `SELECT a.id AS "assignmentId",
              a.volunteer_id AS "volunteerId",
              a.created_at AS "assignedAt",
              a.assignment_source AS "assignmentSource",
              v.display_name AS "volunteerName",
              ab.display_name AS "assignedByName"
       FROM jewelheart_assignments a
       JOIN jewelheart_volunteers v ON v.id = a.volunteer_id
       LEFT JOIN jewelheart_volunteers ab ON ab.id = a.assigned_by_volunteer_id
       WHERE a.task_id = $1
       ORDER BY a.created_at, v.display_name`,
      [taskId],
    );
    const enriched = [];
    for (const row of assignments) {
      let checkins = [];
      try {
        const { rows } = await query(
          `SELECT c.id,
                  c.started_at AS "startedAt",
                  c.finished_at AS "finishedAt",
                  c.created_at AS "recordedAt",
                  pb.display_name AS "performedByName"
           FROM jewelheart_shift_checkins c
           LEFT JOIN jewelheart_volunteers pb ON pb.id = c.performed_by_volunteer_id
           WHERE c.assignment_id = $1
           ORDER BY c.started_at`,
          [row.assignmentId],
        );
        checkins = rows;
      } catch {
        checkins = [];
      }
      enriched.push({ ...row, checkins });
    }
    return enriched;
  } catch {
    return [];
  }
}

/** Scheduled days for a job — uses live schedule (same source as home/find). */
async function volunteerJobScheduledDayIsosForJob(firebaseUid, authToken, retreat, retreatId, jobId) {
  if (!retreatId || !jobId || !retreat) return [];
  const jobKey = String(jobId);
  const dates = volunteerHomeRetreatDates(retreat);
  const out = [];
  for (const iso of dates) {
    try {
      const day = await getScheduleByDay(firebaseUid, retreatId, iso, authToken);
      const hit = (day?.items || []).some((item) => {
        const jid = String((item.job && item.job.id) || (item.task && item.task.jobId) || '');
        return jid === jobKey;
      });
      if (hit) out.push(iso);
    } catch {
      /* skip day */
    }
  }
  return out;
}

/** Shift detail for job+day from schedule, with assignment/check-in audit from DB. */
async function volunteerLoadJobFinderDayDetailForJob(
  firebaseUid,
  authToken,
  retreatId,
  jobId,
  dayIso,
) {
  if (!retreatId || !jobId || !dayIso) return [];
  const jobKey = String(jobId);
  try {
    const day = await getScheduleByDay(firebaseUid, retreatId, dayIso, authToken);
    const blocks = [];
    for (const item of day?.items || []) {
      const jid = String((item.job && item.job.id) || (item.task && item.task.jobId) || '');
      if (jid !== jobKey) continue;
      const taskId = item.task?.id ? String(item.task.id) : '';
      if (!taskId) continue;
      blocks.push({
        taskId,
        slotLabel: item.slot?.label || '',
        timeBand: item.slot?.timeBand || '',
        jobTitle: (item.job && item.job.title) || '',
        volunteersNeeded: item.job?.volunteersNeeded ?? item.task?.volunteersNeeded ?? 1,
        checkinsRequired: item.job?.checkinsRequired ?? item.task?.checkinsRequired ?? 1,
        notes: item.task?.notes || '',
        assignments: await volunteerLoadTaskAssignmentDetails(taskId),
      });
    }
    return blocks;
  } catch {
    return [];
  }
}

async function volunteerJobScheduledDayIsos(retreatId, jobId) {
  if (!retreatId || !jobId) return [];
  try {
    const { rows } = await query(
      `SELECT DISTINCT s.slot_date::text AS "dayIso"
       FROM jewelheart_tasks t
       JOIN jewelheart_slots s ON s.id = t.slot_id
       WHERE t.retreat_id = $1 AND t.job_id = $2
       ORDER BY s.slot_date`,
      [retreatId, jobId],
    );
    return rows.map((r) => volunteerHomeNormalizeDayIso(r.dayIso));
  } catch {
    return [];
  }
}

async function volunteerLoadJobFinderDayDetail(retreatId, jobId, dayIso) {
  if (!retreatId || !jobId || !dayIso) return [];
  const normDay = volunteerHomeNormalizeDayIso(dayIso);
  try {
    const { rows: tasks } = await query(
      `SELECT t.id AS "taskId",
              s.label AS "slotLabel",
              s.time_band AS "timeBand",
              j.title AS "jobTitle",
              j.volunteers_needed AS "volunteersNeeded",
              COALESCE(j.checkins_required, 1) AS "checkinsRequired",
              t.notes
       FROM jewelheart_tasks t
       JOIN jewelheart_slots s ON s.id = t.slot_id
       JOIN jewelheart_jobs j ON j.id = t.job_id
       WHERE t.retreat_id = $1 AND t.job_id = $2 AND s.slot_date = $3::date
       ORDER BY s.time_band NULLS LAST, s.label NULLS LAST, t.id`,
      [retreatId, jobId, normDay],
    );
    const blocks = [];
    for (const task of tasks) {
      blocks.push({
        ...task,
        assignments: await volunteerLoadTaskAssignmentDetails(task.taskId),
      });
    }
    return blocks;
  } catch {
    return [];
  }
}

function volunteerHomeJobFinderSlotHeader(task, warnings, code) {
  const parts = [volunteerHomeDisplayJobName(task.jobTitle)];
  const slot = String(task.slotLabel || '').trim();
  const band = String(task.timeBand || '').trim();
  if (slot) parts.push(slot);
  else if (band) parts.push(band);
  return volunteerHomeEmphasisText(
    parts.join(VOLUNTEER_HOME_EN_DASH),
    warnings,
    code,
  );
}

function volunteerHomeJobFinderDetailComponents(ctx, taskBlocks, options = {}) {
  const {
    codePrefix = 'job_finder',
    actionTarget = 'jewelheart.volunteer.jobFinder',
    actionPayload = {},
    retreatId = '',
    roster = [],
  } = options;
  const items = [];
  if (!taskBlocks.length) {
    items.push(
      volunteerHomeBodyText('No shift scheduled for this job on that day.', ctx.layoutWarnings, `${codePrefix}_empty`),
    );
    return items;
  }
  taskBlocks.forEach((task, ti) => {
    if (ti > 0) items.push(volunteerHomeGap());
    items.push(volunteerHomeJobFinderSlotHeader(task, ctx.layoutWarnings, `${codePrefix}_slot_${ti}`));
    const needed = Number(task.volunteersNeeded) || 1;
    const filled = task.assignments.length;
    const open = Math.max(0, needed - filled);
    const taskId = task.taskId ? String(task.taskId) : '';
    items.push(
      volunteerHomeBodyText(
        `${filled} of ${needed} filled${open ? ` (${open} open)` : ''} · ${task.checkinsRequired} check-in(s) required`,
        ctx.layoutWarnings,
        `${codePrefix}_cap_${ti}`,
      ),
    );
    if (task.notes) {
      items.push(
        volunteerHomeBodyText(`Notes: ${String(task.notes).trim()}`, ctx.layoutWarnings, `${codePrefix}_notes_${ti}`),
      );
    }
    if (!task.assignments.length) {
      items.push(
        volunteerHomeBodyText('Open — no assignee.', ctx.layoutWarnings, `${codePrefix}_open_${ti}`),
      );
    }
    task.assignments.forEach((row, ai) => {
      items.push(volunteerHomeGap());
      items.push(
        volunteerHomeBodyText(
          `Assigned: ${row.volunteerName}`,
          ctx.layoutWarnings,
          `${codePrefix}_a_${ti}_${ai}`,
        ),
      );
      items.push(
        volunteerHomeBodyText(
          `Assigned at: ${volunteerHomeFormatDateTimeEt(row.assignedAt)}`,
          ctx.layoutWarnings,
          `${codePrefix}_at_${ti}_${ai}`,
        ),
      );
      items.push(
        volunteerHomeBodyText(
          `Assigned by: ${volunteerHomeFormatAssignmentByLabel(row)}`,
          ctx.layoutWarnings,
          `${codePrefix}_by_${ti}_${ai}`,
        ),
      );
      if (!row.checkins.length) {
        items.push(
          volunteerHomeBodyText('Check-ins: none', ctx.layoutWarnings, `${codePrefix}_ci_none_${ti}_${ai}`),
        );
      } else {
        row.checkins.forEach((ci, ciIdx) => {
          const start = volunteerHomeFormatTimeAm(ci.startedAt);
          const end = ci.finishedAt ? volunteerHomeFormatTimeAm(ci.finishedAt) : '—';
          const recorded = volunteerHomeFormatDateTimeEt(ci.recordedAt || ci.startedAt);
          const performer = ci.performedByName ? ` · by ${ci.performedByName}` : '';
          items.push(
            volunteerHomeBodyText(
              `Check-in ${ciIdx + 1}: ${start} – ${end} (recorded ${recorded}${performer})`,
              ctx.layoutWarnings,
              `${codePrefix}_ci_${ti}_${ai}_${ciIdx}`,
            ),
          );
        });
      }
      if (taskId && row.volunteerId) {
        items.push(volunteerHomeGap());
        items.push(
          volunteerHomeCenteredPill(
            'Unassign',
            actionTarget,
            {
              ...actionPayload,
              jobFinderOp: 'unassign',
              jobFinderTaskId: taskId,
              jobFinderVolunteerId: String(row.volunteerId),
            },
            volunteerHomeLightMaroon,
            '#FFFFFF',
          ),
        );
      }
    });
    if (open > 0 && taskId) {
      const pickerId = `jobFinderAssignPicker_${ti}`;
      items.push(volunteerHomeGap());
      items.push(
        volunteerHomeBodyText('Assign volunteer:', ctx.layoutWarnings, `${codePrefix}_assign_lbl_${ti}`),
      );
      items.push(volunteerHomeGap());
      items.push(
        volunteerHomePersonPickerComponent(pickerId, roster, {
          searchScope: 'retreat+global',
          retreatId,
          selectedHint: 'Selected — tap Assign',
        }),
      );
      items.push(volunteerHomeGap());
      items.push(
        volunteerHomeCenteredPill(
          'Assign',
          actionTarget,
          {
            ...actionPayload,
            jobFinderAssignConfirm: '1',
            jobFinderTaskId: taskId,
            pickVolunteerFrom: pickerId,
          },
          volunteerHomeMaroon,
          '#FFFFFF',
        ),
      );
    }
  });
  return items;
}

/**
 * User management — manager/admin tools for roster sign-in (status, unlink, invite email).
 */
export async function buildJewelheartVolunteerUserManageScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const isManager = await volunteerHomeIsManager(firebaseUid);
  const retreatId = ctx.retreatId || params.retreatId || '';
  const navParams = {
    retreatId,
    returnTo: params.returnTo || 'jewelheart.volunteer.manage',
    footerNavSimple: true,
    footerNavManage: true,
  };
  const manageTarget = 'jewelheart.volunteer.userManage';
  const corePayload = volunteerHomeWithReturnTo(
    retreatId ? { retreatId } : {},
    'jewelheart.volunteer.manage',
  );

  if (!isManager && !isAdmin) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'User management',
      'Manager access required. Ask an admin to add your Firebase UID to jewelheart_managers.',
      params,
      manageTarget,
    );
  }

  const cleared = String(params.userManageClear || '') === '1';
  const confirmedId = cleared ? '' : String(params.userManageVolunteerId || '').trim();
  const statusNote = cleared ? '' : String(params.userManageStatusNote || '').trim();
  const pendingOp = cleared ? '' : String(params.userManagePendingOp || '').trim();
  const targetVolunteer = confirmedId && retreatId
    ? await volunteerLoadUserManageTarget(retreatId, confirmedId)
    : null;
  const headerName = targetVolunteer?.displayName || '(tbd)';
  const headerLine = volunteerHomeFitLine(
    `Manage - ${headerName}`,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'user_manage_header',
  );

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx, headerLine, undefined, { alreadyFitted: true }),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      'Find someone on the roster, confirm your selection, then check status, unlink sign-in, or reset onboarding.',
      ctx.layoutWarnings,
      'user_manage_intro',
    ),
    volunteerHomeGap(),
  ];

  if (!confirmedId || !targetVolunteer) {
    const roster = retreatId ? await volunteerListRetreatRoster(retreatId) : [];
    children.push(
      volunteerHomePersonPickerComponent('userManagePicker', roster, {
        searchScope: 'retreat+global',
        retreatId,
        selectedHint: 'Selected — tap Confirm',
      }),
      volunteerHomeGap(),
      volunteerHomeCenteredPill(
        'Confirm',
        manageTarget,
        {
          ...corePayload,
          userManageConfirm: '1',
          pickVolunteerFrom: 'userManagePicker',
        },
        volunteerHomeMaroon,
        '#FFFFFF',
      ),
      volunteerHomeGap(),
    );
  } else {
    const email = String(targetVolunteer.email || '').trim();
    const hasEmail = Boolean(normalizeEmail(email));
    const actionBase = { volunteerId: confirmedId, displayName: targetVolunteer.displayName, hasEmail };
    if (statusNote) {
      for (const [i, line] of statusNote.split('\n').entries()) {
        if (!line.trim()) continue;
        children.push(volunteerHomeBodyText(line, ctx.layoutWarnings, `user_manage_status_${i}`));
      }
      children.push(volunteerHomeGap());
    }
    if (pendingOp === 'unlink') {
      children.push(
        volunteerHomeEmphasisText(
          `Unlink sign-in for ${targetVolunteer.displayName}?`,
          ctx.layoutWarnings,
          'user_manage_confirm_unlink',
        ),
        volunteerHomeBodyText(
          'Their profile is kept on the roster; they can sign in again later.',
          ctx.layoutWarnings,
          'user_manage_confirm_unlink_note',
        ),
        volunteerHomeGap(),
        volunteerHomeCenteredInlineRow([
          volunteerHomePillButton('Confirm unlink', manageTarget, {}, volunteerHomeMaroon, '#FFFFFF', {
            action: {
              type: 'volunteerUserManage',
              payload: { op: 'unlink', confirmed: true, ...actionBase },
            },
            hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          }),
          volunteerHomePillButton('Cancel', manageTarget, { userManagePendingClear: '1' }, volunteerHomeSummaryBlue, '#FFFFFF', {
            hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          }),
        ], { spacing: 8, noWrap: true }),
      );
    } else if (pendingOp === 'resetOnboarding') {
      children.push(
        volunteerHomeEmphasisText(
          `Reset onboarding for ${targetVolunteer.displayName}?`,
          ctx.layoutWarnings,
          'user_manage_confirm_reset',
        ),
        volunteerHomeBodyText(
          'They must complete the profile screen again on next sign-in. Roster name and contact stay as-is.',
          ctx.layoutWarnings,
          'user_manage_confirm_reset_note',
        ),
        volunteerHomeGap(),
        volunteerHomeCenteredInlineRow([
          volunteerHomePillButton('Confirm reset', manageTarget, {}, volunteerHomeMaroon, '#FFFFFF', {
            action: {
              type: 'volunteerUserManage',
              payload: { op: 'resetOnboarding', confirmed: true, ...actionBase },
            },
            hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          }),
          volunteerHomePillButton('Cancel', manageTarget, { userManagePendingClear: '1' }, volunteerHomeSummaryBlue, '#FFFFFF', {
            hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          }),
        ], { spacing: 8, noWrap: true }),
      );
    } else {
      children.push(
        volunteerHomeCenteredInlineRow([
          volunteerHomePillButton('Status', manageTarget, {}, volunteerHomeSummaryBlue, '#FFFFFF', {
            action: { type: 'volunteerUserManage', payload: { op: 'status', ...actionBase } },
            hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          }),
          volunteerHomePillButton('Unlink', manageTarget, {}, volunteerHomeMaroon, '#FFFFFF', {
            action: { type: 'volunteerUserManage', payload: { op: 'unlink', ...actionBase } },
            hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          }),
          volunteerHomePillButton('Reset onboarding', manageTarget, {}, volunteerHomeMaroon, '#FFFFFF', {
            action: {
              type: 'volunteerUserManage',
              payload: { op: 'resetOnboarding', ...actionBase },
            },
            hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          }),
        ], { spacing: 8, noWrap: true }),
      );
    }
    children.push(
      volunteerHomeGap(),
      volunteerHomeCenteredPill(
        'Clear selection',
        manageTarget,
        { ...corePayload, userManageClear: '1' },
        volunteerHomeSummaryBlue,
        '#FFFFFF',
      ),
      volunteerHomeGap(),
    );
  }

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope(manageTarget, 'JewelHeart', children, ctx.layoutWarnings, { navParams });
}

function volunteerHomeManageCheckinsScroll(children) {
  return {
    type: 'container',
    layout: 'column',
    spacing: 0,
    style: {
      manageCheckinsScroll: true,
      flexGrow: true,
      padding: { top: 4, bottom: 4, left: 8, right: 8 },
      borderColor: volunteerHomeMaroon,
    },
    children,
  };
}

/**
 * Manage → On behalf of — pick a roster volunteer, then view their home (read-only phase 1).
 */
export async function buildJewelheartVolunteerOboScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const isManager = await volunteerHomeIsManager(firebaseUid);
  const retreatId = ctx.retreatId || params.retreatId || '';
  const navParams = {
    retreatId,
    returnTo: params.returnTo || 'jewelheart.volunteer.manage',
    footerNavSimple: true,
    footerNavManage: true,
  };
  const oboTarget = 'jewelheart.volunteer.obo';
  const corePayload = volunteerHomeWithReturnTo(
    retreatId ? { retreatId } : {},
    'jewelheart.volunteer.manage',
  );

  if (!isManager && !isAdmin) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'On behalf of',
      'Manager access required. Ask an admin to add your Firebase UID to jewelheart_managers.',
      params,
      oboTarget,
    );
  }

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx, 'On behalf of'),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      'Pick someone on the roster to view their home screen as they would see it today. Tap the coral bar to exit.',
      ctx.layoutWarnings,
      'obo_intro',
    ),
    volunteerHomeGap(),
  ];

  const roster = retreatId ? await volunteerListRetreatRoster(retreatId) : [];
  children.push(
    volunteerHomePersonPickerComponent('oboPicker', roster, {
      searchScope: 'retreat+global',
      retreatId,
      selectedHint: 'Selected — tap Start',
    }),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Start',
      'jewelheart.home',
      {
        ...corePayload,
        oboConfirm: '1',
        pickVolunteerFrom: 'oboPicker',
      },
      volunteerHomeOboBarColor,
      '#FFFFFF',
    ),
    volunteerHomeGap(),
    ...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings),
  );

  return volunteerHomeScreenEnvelope('jewelheart.volunteer.obo', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
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
    footerNavManage: true,
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

  const managePayload = volunteerHomeWithReturnTo(
    navParams.retreatId ? { retreatId: navParams.retreatId } : {},
    'jewelheart.volunteer.manage',
  );

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx, 'Manage'),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Generate Excel',
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
      'Generate Excel fills Poster and Compact with current assignees (✓ = checked in), Roster with the live retreat roster, and downloads P-mmdd-hhmm.xlsx. Open in Google Sheets or Excel for printing.',
      ctx.layoutWarnings,
      'manage_poster_hint',
    ),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Check-ins',
      'jewelheart.volunteer.manageCheckins',
      managePayload,
      volunteerHomeSummaryBlue,
      '#FFFFFF',
    ),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Job finder',
      'jewelheart.volunteer.jobFinder',
      volunteerHomeWithReturnTo(
        navParams.retreatId ? { retreatId: navParams.retreatId } : {},
        'jewelheart.volunteer.manage',
      ),
      volunteerHomeSummaryBlue,
      '#FFFFFF',
    ),
    volunteerHomeGap(),
    ...(isAdmin
      ? [
          volunteerHomeCenteredPill(
            'Reload jobs & instructions',
            '',
            {},
            volunteerHomeMaroon,
            '#FFFFFF',
            {
              action: {
                type: 'volunteerAdminTools',
                payload: { op: 'reloadPosterData' },
              },
            },
          ),
          volunteerHomeGap(),
          volunteerHomeBodyText(
            'Reload jobs & instructions re-reads jobs-v4.xlsx and instructions.docx on the server (no restart). Copy updated files to data/jewelheart/ first.',
            ctx.layoutWarnings,
            'manage_reload_poster_hint',
          ),
          volunteerHomeGap(),
        ]
      : []),
    volunteerHomeCenteredPill(
      'User management',
      'jewelheart.volunteer.userManage',
      volunteerHomeWithReturnTo(
        navParams.retreatId ? { retreatId: navParams.retreatId } : {},
        'jewelheart.volunteer.manage',
      ),
      volunteerHomeSummaryBlue,
      '#FFFFFF',
    ),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'On behalf of',
      'jewelheart.volunteer.obo',
      volunteerHomeWithReturnTo(
        navParams.retreatId ? { retreatId: navParams.retreatId } : {},
        'jewelheart.volunteer.manage',
      ),
      volunteerHomeOboBarColor,
      '#FFFFFF',
    ),
    volunteerHomeGap(),
    ...(isAdmin
      ? [
          volunteerHomeCenteredPill(
            'Roster privileges',
            'jewelheart.volunteer.adminPrivileges',
            volunteerHomeWithReturnTo(
              navParams.retreatId ? { retreatId: navParams.retreatId } : {},
              'jewelheart.volunteer.manage',
            ),
            volunteerHomeSummaryBlue,
            '#FFFFFF',
          ),
          volunteerHomeGap(),
        ]
      : []),
    volunteerHomeCenteredPill(
      'Testing (today pin)',
      'jewelheart.volunteer.testing',
      volunteerHomeWithReturnTo(
        navParams.retreatId ? { retreatId: navParams.retreatId } : {},
        'jewelheart.volunteer.manage',
      ),
      volunteerHomeSummaryBlue,
      '#FFFFFF',
    ),
    volunteerHomeGap(),
    ...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings),
  ];
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.manage', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
}

/**
 * Manage → Check-ins — browse recent volunteer check-in records.
 */
export async function buildJewelheartVolunteerManageCheckinsScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const isManager = await volunteerHomeIsManager(firebaseUid);
  const showList = String(params.checkinsShow || '') === '1';
  const retreatId = ctx.retreatId || params.retreatId || '';
  const navParams = {
    retreatId,
    returnTo: params.returnTo || 'jewelheart.volunteer.manage',
    footerNavManage: true,
  };
  const corePayload = volunteerHomeWithReturnTo(
    retreatId ? { retreatId } : {},
    'jewelheart.volunteer.manage',
  );
  const checkinsTarget = 'jewelheart.volunteer.manageCheckins';

  if (!isManager && !isAdmin) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Check-ins',
      'Manager access required.',
      params,
      checkinsTarget,
    );
  }

  const children = [
    ...volunteerHomeRetreatHeaderOnly(ctx),
    volunteerHomeBar('Manage check-ins', volunteerHomeSummaryBlue, '#FFFFFF'),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Show check-ins',
      checkinsTarget,
      { ...corePayload, checkinsShow: '1' },
      volunteerHomeMaroon,
      '#FFFFFF',
    ),
    volunteerHomeGap(),
  ];

  if (showList) {
    const checkinRows = retreatId ? await volunteerListRetreatCheckins(retreatId, 50) : [];
    const scrollInner = [];
    if (!checkinRows.length) {
      scrollInner.push(
        volunteerHomeBodyText('No check-ins recorded yet for this retreat.', ctx.layoutWarnings, 'manage_checkins_empty'),
      );
    } else {
      checkinRows.forEach((row, index) => {
        scrollInner.push(
          volunteerHomeBodyText(
            volunteerHomeManageCheckinLine(row, ctx.layoutWarnings, `manage_ci_${index}`),
            ctx.layoutWarnings,
            `manage_ci_${index}`,
          ),
        );
      });
    }
    children.push(volunteerHomeManageCheckinsScroll(scrollInner));
    children.push(volunteerHomeGap());
  }

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));

  return volunteerHomeScreenEnvelope(checkinsTarget, 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
    manageCheckinsFlexLayout: true,
  });
}

/**
 * Manage → Job finder — pick a job, day, and inspect shift assignments + check-ins.
 */
export async function buildJewelheartVolunteerJobFinderScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const isManager = await volunteerHomeIsManager(firebaseUid);
  const retreatId = ctx.retreatId || params.retreatId || '';
  const navParams = {
    retreatId,
    returnTo: params.returnTo || 'jewelheart.volunteer.manage',
    footerNavManage: true,
  };
  const jobFinderTarget = 'jewelheart.volunteer.jobFinder';
  const corePayload = volunteerHomeWithReturnTo(
    retreatId ? { retreatId } : {},
    'jewelheart.volunteer.manage',
  );

  if (!isManager && !isAdmin) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Job finder',
      'Manager access required.',
      params,
      jobFinderTarget,
    );
  }

  const cleared = String(params.jobFinderClear || '') === '1';
  const jobId = cleared ? '' : String(params.jobFinderJobId || '').trim();
  const jobTitle = cleared ? '' : String(params.jobFinderJobTitle || '').trim();
  const dayIso = cleared ? '' : String(params.jobFinderDayIso || '').trim();

  let jobFinderStatusNote = '';
  const jobFinderOp = String(params.jobFinderOp || '').trim();
  if (retreatId && jobFinderOp === 'unassign') {
    const taskId = String(params.jobFinderTaskId || '').trim();
    const volunteerId = String(params.jobFinderVolunteerId || '').trim();
    if (taskId && volunteerId) {
      const ok = await volunteerSelfUnassign(retreatId, taskId, volunteerId);
      jobFinderStatusNote = ok ? 'Unassigned.' : 'Could not unassign.';
    }
  } else if (retreatId && jobFinderOp === 'assign') {
    const taskId = String(params.jobFinderTaskId || '').trim();
    const volunteerId = String(params.jobFinderPickVolunteerId || '').trim();
    if (taskId && volunteerId) {
      const actor = await volunteerResolveSelf(firebaseUid, retreatId);
      const ok = await volunteerAssignVolunteerToTask(retreatId, taskId, volunteerId, {
        assignmentSource: 'manager',
        assignedByVolunteerId: actor?.id || null,
      });
      jobFinderStatusNote = ok ? 'Assigned.' : 'Could not assign (shift full or already assigned).';
    }
  }

  const children = [
    ...volunteerHomeRetreatHeaderOnly(ctx),
    volunteerHomeBar('Job finder', volunteerHomeSummaryBlue, '#FFFFFF'),
    volunteerHomeGap(),
  ];

  if (!jobId) {
    children.push(
      volunteerHomeBodyText(
        'Type to match a job title, confirm, then pick a scheduled day to inspect assignments and check-ins.',
        ctx.layoutWarnings,
        'job_finder_intro',
      ),
      volunteerHomeGap(),
    );
    let jobs = [];
    if (retreatId) {
      try {
        const jobRes = await listJobs(firebaseUid, retreatId, authToken);
        jobs = volunteerHomeJobsInPosterCatalog(jobRes?.items || []);
      } catch {
        jobs = [];
      }
    }
    children.push(
      volunteerHomeJobPickerComponent('jobFinderPicker', jobs, {
        selectedHint: 'Selected — tap Confirm',
      }),
      volunteerHomeGap(),
      volunteerHomeCenteredPill(
        'Confirm',
        jobFinderTarget,
        {
          ...corePayload,
          jobFinderConfirm: '1',
          pickJobFrom: 'jobFinderPicker',
        },
        volunteerHomeMaroon,
        '#FFFFFF',
      ),
      volunteerHomeGap(),
    );
  } else {
    const headerName = jobTitle || '(job)';
    const headerLine = volunteerHomeFitLine(
      headerName,
      VOLUNTEER_HOME_MAX_BAR_CHARS,
      ctx.layoutWarnings,
      'job_finder_header',
    );
    children.push(
      volunteerHomeBar(headerLine, volunteerHomeSummaryBlue, '#FFFFFF'),
      volunteerHomeGap(),
      volunteerHomeCenteredPill(
        'Pick another job',
        jobFinderTarget,
        { ...corePayload, jobFinderClear: '1' },
        volunteerHomeLightMaroon,
        '#FFFFFF',
      ),
      volunteerHomeGap(),
    );

    const dayIsos = retreatId && jobId
      ? await volunteerJobScheduledDayIsosForJob(
          firebaseUid,
          authToken,
          ctx.retreat,
          retreatId,
          jobId,
        )
      : [];
    const effectiveDayIso = dayIso || (dayIsos.length ? dayIsos[0] : '');
    if (!dayIsos.length) {
      children.push(
        volunteerHomeBodyText('This job has no scheduled days in the retreat.', ctx.layoutWarnings, 'job_finder_no_days'),
        volunteerHomeGap(),
      );
    } else {
      const dayPayloadBase = {
        ...corePayload,
        jobFinderJobId: jobId,
        jobFinderJobTitle: jobTitle,
      };
      const dayButtons = dayIsos.map((iso) => {
        const label = volunteerHomeWeekdayShort(iso);
        const selected = iso === effectiveDayIso;
        return volunteerHomeFilterToggleButton(
          label,
          selected,
          jobFinderTarget,
          { ...dayPayloadBase, jobFinderDayIso: iso },
          { hPad: 5 },
        );
      });
      children.push(
        volunteerHomeBodyText('Select day:', ctx.layoutWarnings, 'job_finder_day_label'),
        volunteerHomeGap(),
        volunteerHomeWrappedFilterRow(dayButtons, { spacing: 4, sidePad: 4, compactWrap: true }),
        volunteerHomeGap(),
      );

      if (effectiveDayIso) {
        if (jobFinderStatusNote) {
          children.push(
            volunteerHomeBodyText(jobFinderStatusNote, ctx.layoutWarnings, 'job_finder_status'),
            volunteerHomeGap(),
          );
        }
        let taskBlocks = await volunteerLoadJobFinderDayDetailForJob(
          firebaseUid,
          authToken,
          retreatId,
          jobId,
          effectiveDayIso,
        );
        if (!taskBlocks.length) {
          taskBlocks = await volunteerLoadJobFinderDayDetail(retreatId, jobId, effectiveDayIso);
        }
        const roster = retreatId ? await volunteerListRetreatRoster(retreatId) : [];
        const jobFinderActionPayload = {
          ...corePayload,
          jobFinderJobId: jobId,
          jobFinderJobTitle: jobTitle,
          jobFinderDayIso: effectiveDayIso,
        };
        children.push(
          ...volunteerHomeJobFinderDetailComponents(ctx, taskBlocks, {
            actionTarget: jobFinderTarget,
            actionPayload: jobFinderActionPayload,
            retreatId,
            roster,
          }),
        );
        children.push(volunteerHomeGap());
      } else {
        children.push(
          volunteerHomeBodyText('Tap a day to see shift detail.', ctx.layoutWarnings, 'job_finder_pick_day'),
          volunteerHomeGap(),
        );
      }
    }
  }

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));

  return volunteerHomeScreenEnvelope(jobFinderTarget, 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
    manageCheckinsFlexLayout: true,
  });
}

function volunteerTestingCheckbox(label, checked, fieldKey) {
  return {
    type: 'testingCheckbox',
    label: String(label || ''),
    checked: checked === true,
    fieldKey: fieldKey || '',
  };
}

function volunteerTestingDateField(label, value, fieldKey) {
  return {
    type: 'testingDateField',
    label: String(label || ''),
    value: value || '',
    fieldKey: fieldKey || '',
  };
}

function volunteerTestingPanel(children) {
  return {
    type: 'testingPanel',
    children: children || [],
  };
}

/**
 * Manage → Testing — pin "today" and optional retreat window for QA (manager/admin).
 */
export async function buildJewelheartVolunteerTestingScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const isManager = await volunteerHomeIsManager(firebaseUid);
  const navParams = {
    retreatId: ctx.retreatId || params.retreatId || '',
    returnTo: params.returnTo || 'jewelheart.volunteer.manage',
    footerNavManage: true,
  };

  if (!isManager && !isAdmin) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Testing',
      'Manager access required.',
      params,
      'jewelheart.volunteer.testing',
    );
  }

  const settings = await loadVolunteerTestingSettings(query);
  const dbStart = ctx.retreat?.startDate || VOLUNTEER_HOME_DEFAULT_RETREAT.startDate;
  const dbEnd = ctx.retreat?.endDate || VOLUNTEER_HOME_DEFAULT_RETREAT.endDate;
  const formStart = settings.overrideStartDate || dbStart;
  const formEnd = settings.overrideEndDate || dbEnd;
  const formToday = settings.pinnedToday || ctx.todayIso || ctx.liveTodayIso;

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx, 'Testing'),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      ctx.testingEnabled
        ? `Testing ON — app today ${ctx.todayIso}; live calendar ${ctx.liveTodayIso}.`
        : `Testing OFF — live calendar today is ${ctx.liveTodayIso}.`,
      ctx.layoutWarnings,
      'testing_status',
    ),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      `Header preview: ${ctx.retreatBannerLine}`,
      ctx.layoutWarnings,
      'testing_banner_preview',
    ),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      `Database retreat: ${dbStart} … ${dbEnd}`,
      ctx.layoutWarnings,
      'testing_db_retreat',
    ),
    volunteerHomeGap(),
    volunteerTestingPanel([
      volunteerTestingCheckbox('Testing mode (use dates below)', settings.enabled, 'enabled'),
      volunteerTestingDateField('Pinned today', formToday, 'pinnedToday'),
      volunteerTestingDateField('Retreat start', formStart, 'overrideStartDate'),
      volunteerTestingDateField('Retreat end', formEnd, 'overrideEndDate'),
    ]),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Save',
      '',
      {},
      volunteerHomeMaroon,
      '#FFFFFF',
      {
        action: { type: 'volunteerTesting', payload: { op: 'saveFromForm' } },
      },
    ),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Use live calendar',
      '',
      {},
      volunteerHomeSummaryBlue,
      '#FFFFFF',
      {
        action: { type: 'volunteerTesting', payload: { op: 'saveLive' } },
      },
    ),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      'When testing is on, pinned today drives Home yellow pills and search day filters. Start/end override the retreat window in the header and day list (assignments in Postgres are unchanged).',
      ctx.layoutWarnings,
      'testing_hint',
    ),
    volunteerHomeGap(),
    ...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings),
  ];

  return volunteerHomeScreenEnvelope('jewelheart.volunteer.testing', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
}

async function volunteerLoadAdminPrivilegeTarget(retreatId, volunteerId) {
  if (!retreatId || !volunteerId) return null;
  try {
    const { rows } = await query(
      `SELECT v.id, v.display_name AS "displayName", v.email, v.phone,
              v.firebase_uid AS "firebaseUid",
              v.roster_admin AS "rosterAdmin",
              v.roster_manage AS "rosterManage"
       FROM jewelheart_volunteers v
       JOIN jewelheart_retreat_volunteers rv ON rv.volunteer_id = v.id
       WHERE rv.retreat_id = $1 AND v.id = $2
       LIMIT 1`,
      [retreatId, volunteerId],
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Admin → Privileges — grant/revoke roster Admin and Manage flags (syncs ACL when linked).
 */
export async function buildJewelheartVolunteerAdminPrivilegesScreen(
  firebaseUid,
  authToken = undefined,
  params = {},
) {
  const ctx = await volunteerHomeGatherCtx(firebaseUid, authToken, params);
  const isAdmin = await volunteerHomeIsAdmin(firebaseUid);
  const retreatId = ctx.retreatId || params.retreatId || '';
  const navParams = {
    retreatId,
    returnTo: params.returnTo || 'jewelheart.volunteer.admin',
    footerNavSimple: true,
  };
  const adminTarget = 'jewelheart.volunteer.adminPrivileges';
  const corePayload = volunteerHomeWithReturnTo(
    retreatId ? { retreatId } : {},
    'jewelheart.volunteer.admin',
  );

  if (!isAdmin) {
    return volunteerHomeSimplePlaceholderScreen(
      ctx,
      'Privileges',
      'Admin access required.',
      params,
      adminTarget,
    );
  }

  const cleared = String(params.adminPrivClear || '') === '1';
  const confirmedId = cleared ? '' : String(params.adminPrivVolunteerId || '').trim();
  const statusNote = cleared ? '' : String(params.adminPrivStatusNote || '').trim();
  const targetVolunteer = confirmedId && retreatId
    ? await volunteerLoadAdminPrivilegeTarget(retreatId, confirmedId)
    : null;
  const headerName = targetVolunteer?.displayName || '(tbd)';
  const headerLine = volunteerHomeFitLine(
    `Privileges - ${headerName}`,
    VOLUNTEER_HOME_MAX_BAR_CHARS,
    ctx.layoutWarnings,
    'admin_priv_header',
  );

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx, headerLine, undefined, { alreadyFitted: true }),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      'Grant or revoke Admin and Manage for roster members. Flags sync to live access when they are signed in.',
      ctx.layoutWarnings,
      'admin_priv_intro',
    ),
    volunteerHomeGap(),
  ];

  if (!confirmedId || !targetVolunteer) {
    const roster = retreatId ? await volunteerListRetreatRoster(retreatId) : [];
    children.push(
      volunteerHomePersonPickerComponent('adminPrivPicker', roster, {
        searchScope: 'retreat+global',
        retreatId,
        selectedHint: 'Selected — tap Confirm',
      }),
      volunteerHomeGap(),
      volunteerHomeCenteredPill(
        'Confirm',
        adminTarget,
        {
          ...corePayload,
          adminPrivConfirm: '1',
          pickVolunteerFrom: 'adminPrivPicker',
        },
        volunteerHomeMaroon,
        '#FFFFFF',
      ),
      volunteerHomeGap(),
    );
  } else {
    const actionBase = {
      volunteerId: confirmedId,
      displayName: targetVolunteer.displayName,
      rosterAdmin: targetVolunteer.rosterAdmin === true,
      rosterManage: targetVolunteer.rosterManage === true,
    };
    if (statusNote) {
      for (const [i, line] of statusNote.split('\n').entries()) {
        if (!line.trim()) continue;
        children.push(volunteerHomeBodyText(line, ctx.layoutWarnings, `admin_priv_status_${i}`));
      }
      children.push(volunteerHomeGap());
    }
    const adminOn = targetVolunteer.rosterAdmin === true;
    const manageOn = targetVolunteer.rosterManage === true;
    children.push(
      volunteerHomeCenteredInlineRow([
        volunteerHomePillButton(
          adminOn ? 'Revoke Admin' : 'Grant Admin',
          adminTarget,
          {},
          adminOn ? volunteerHomeMaroon : volunteerHomeSummaryBlue,
          '#FFFFFF',
          {
            action: {
              type: 'volunteerAdminTools',
              payload: { op: 'setPrivileges', admin: !adminOn, ...actionBase },
            },
            hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          },
        ),
        volunteerHomePillButton(
          manageOn ? 'Revoke Manage' : 'Grant Manage',
          adminTarget,
          {},
          manageOn ? volunteerHomeMaroon : volunteerHomeSummaryBlue,
          '#FFFFFF',
          {
            action: {
              type: 'volunteerAdminTools',
              payload: { op: 'setPrivileges', manage: !manageOn, ...actionBase },
            },
            hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
          },
        ),
      ], { spacing: 8, noWrap: true }),
      volunteerHomeGap(),
      volunteerHomeCenteredPill(
        'Refresh status',
        adminTarget,
        { ...corePayload, adminPrivVolunteerId: confirmedId },
        volunteerHomeSummaryBlue,
        '#FFFFFF',
        {
          action: {
            type: 'volunteerAdminTools',
            payload: { op: 'loadPrivileges', volunteerId: confirmedId },
          },
        },
      ),
      volunteerHomeGap(),
      volunteerHomeCenteredPill(
        'Choose someone else',
        adminTarget,
        { ...corePayload, adminPrivClear: '1' },
        volunteerHomeSummaryBlue,
        '#FFFFFF',
      ),
      volunteerHomeGap(),
    );
  }

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope(adminTarget, 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
}

/**
 * Admin home (gated on jewelheart_admins). Generate Excel is a dark-maroon
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

  const retreatId = navParams.retreatId || ctx.retreatId || '';
  const adminTarget = 'jewelheart.volunteer.admin';
  const corePayload = volunteerHomeWithReturnTo(
    retreatId ? { retreatId } : {},
    'jewelheart.home',
  );
  const clearStep = String(params.adminClearStep || '').trim();
  const assignmentCounts = retreatId ? await countRetreatAssignments(query, retreatId) : { assignments: 0, checkins: 0 };
  const posterStatus = getPosterDataStatus();

  const children = [
    ...volunteerHomeBlueHeaderChildren(ctx, 'Admin'),
    ...volunteerHomeGoldPageTitleBar('Admin', ctx.layoutWarnings),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Roster privileges',
      'jewelheart.volunteer.adminPrivileges',
      corePayload,
      volunteerHomeSummaryBlue,
      '#FFFFFF',
    ),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      'Grant or revoke Admin and Manage for anyone on the roster.',
      ctx.layoutWarnings,
      'admin_priv_hint',
    ),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Generate Excel',
      '',
      {},
      volunteerHomeMaroon,
      '#FFFFFF',
      {
        action: {
          type: 'download',
          target: `jewelheart/retreats/${retreatId}/reports/poster-master`,
          payload: {},
        },
      },
    ),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      'Generate Excel fills Poster and Compact with current assignees (✓ = checked in), Roster with the live retreat roster, and downloads P-mmdd-hhmm.xlsx. Open in Google Sheets or Excel for printing.',
      ctx.layoutWarnings,
      'admin_poster_hint',
    ),
    volunteerHomeGap(),
    volunteerHomeCenteredPill(
      'Reload jobs & instructions',
      '',
      {},
      volunteerHomeMaroon,
      '#FFFFFF',
      {
        action: {
          type: 'volunteerAdminTools',
          payload: { op: 'reloadPosterData' },
        },
      },
    ),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      posterStatus.loaded
        ? `Poster catalog: ${posterStatus.jobCount} jobs loaded${posterStatus.loadedAt ? ` (${posterStatus.loadedAt.slice(0, 19).replace('T', ' ')})` : ''}.`
        : 'Poster catalog not loaded — check server data/jewelheart/ paths.',
      ctx.layoutWarnings,
      'admin_poster_status',
    ),
    volunteerHomeGap(),
    volunteerHomeBodyText(
      `Assignments on this retreat: ${assignmentCounts.assignments} (${assignmentCounts.checkins} check-in row(s)).`,
      ctx.layoutWarnings,
      'admin_assign_count',
    ),
    volunteerHomeGap(),
  ];

  if (clearStep === '2') {
    children.push(
      volunteerHomeEmphasisText(
        'Final confirmation — clear ALL assignments?',
        ctx.layoutWarnings,
        'admin_clear_step2_title',
      ),
      volunteerHomeBodyText(
        `This permanently deletes ${assignmentCounts.assignments} assignment(s) and ${assignmentCounts.checkins} check-in record(s). Testers start fresh.`,
        ctx.layoutWarnings,
        'admin_clear_step2_note',
      ),
      volunteerHomeGap(),
      volunteerHomeCenteredInlineRow([
        volunteerHomePillButton('Confirm CLEAR', adminTarget, {}, volunteerHomeMaroon, '#FFFFFF', {
          action: {
            type: 'volunteerAdminTools',
            payload: { op: 'clearAssignments', confirmed: true },
          },
          hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
        }),
        volunteerHomePillButton('Cancel', adminTarget, { adminClearStep: '' }, volunteerHomeSummaryBlue, '#FFFFFF', {
          hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
        }),
      ], { spacing: 8, noWrap: true }),
      volunteerHomeGap(),
    );
  } else if (clearStep === '1') {
    children.push(
      volunteerHomeEmphasisText(
        `Clear ${assignmentCounts.assignments} assignment(s)?`,
        ctx.layoutWarnings,
        'admin_clear_step1_title',
      ),
      volunteerHomeBodyText(
        'Volunteers keep their accounts; only shift sign-ups and check-ins are removed.',
        ctx.layoutWarnings,
        'admin_clear_step1_note',
      ),
      volunteerHomeGap(),
      volunteerHomeCenteredInlineRow([
        volunteerHomePillButton('Continue', adminTarget, { adminClearStep: '2' }, volunteerHomeMaroon, '#FFFFFF', {
          hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
        }),
        volunteerHomePillButton('Cancel', adminTarget, { adminClearStep: '' }, volunteerHomeSummaryBlue, '#FFFFFF', {
          hPad: VOLUNTEER_HOME_BUTTON_H_PAD,
        }),
      ], { spacing: 8, noWrap: true }),
      volunteerHomeGap(),
    );
  } else {
    children.push(
      volunteerHomeCenteredPill(
        'Clear all assignments',
        adminTarget,
        { ...corePayload, adminClearStep: '1' },
        volunteerHomeMaroon,
        '#FFFFFF',
      ),
      volunteerHomeGap(),
      volunteerHomeBodyText(
        'Use before a fresh test run. Does not remove volunteers or roster data. Take a backup first on production.',
        ctx.layoutWarnings,
        'admin_clear_hint',
      ),
      volunteerHomeGap(),
    );
  }

  children.push(...volunteerHomeLayoutWarningComponents(ctx.layoutWarnings));
  return volunteerHomeScreenEnvelope('jewelheart.volunteer.admin', 'JewelHeart', children, ctx.layoutWarnings, {
    navParams,
  });
}

