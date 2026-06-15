#!/usr/bin/env node
/**
 * End-to-end test of the volunteer self-assignment flow against the live DB.
 * Run on prod from ~/private-server:
 *   set -a; . ./.env; set +a; JEWELHEART_VOLUNTEER_HOME_DEMO=1 node scripts-inspect/test-volunteer-assign-flow.mjs
 *
 * Exercises: no-shifts start, search, assign (DB write), home counts,
 * search filtering, My assigned shifts, My shift info, unassign (DB delete).
 */
import { query } from '../src/db.js';
import {
  buildJewelheartHomeScreen,
  buildJewelheartVolunteerAssignScreen,
  buildJewelheartVolunteerShiftScreen,
  buildJewelheartVolunteerMineScreen,
} from '../src/jewelheart/jewelheart-sdui-home.js';

const UID = 'HscF5GpmxMWHVEhgY24ByiEXE353'; // global admin (read ACL); volunteer resolves to first linked
const RETREAT_ID = '34d43115-67b3-5fbf-9173-abb051c11ca7';
const TODAY = '2026-07-21'; // pinned demo day 2

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!ok) failures += 1;
}

function walk(node, out) {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (node.type === 'text' && node.content) {
    out.texts.push({ content: String(node.content), bg: node.style?.backgroundColor, action: node.action });
  }
  if (node.type === 'button') {
    out.buttons.push({
      label: String(node.label || node.content || ''),
      target: node.action?.target,
      payload: node.action?.payload,
      bg: node.style?.backgroundColor,
    });
  }
  walk(node.children, out);
}

function flatten(screen) {
  const out = { texts: [], buttons: [] };
  walk(screen.components, out);
  for (const c of screen.metadata?.stickyFooterComponents || []) walk(c, out);
  return out;
}

async function assignmentRows() {
  const { rows } = await query(
    `SELECT a.id, a.task_id, v.display_name, j.title AS job, s.slot_date::text AS day
     FROM jewelheart_assignments a
     JOIN jewelheart_tasks t ON t.id = a.task_id
     JOIN jewelheart_jobs j ON j.id = t.job_id
     JOIN jewelheart_slots s ON s.id = t.slot_id
     JOIN jewelheart_volunteers v ON v.id = a.volunteer_id
     WHERE t.retreat_id = $1
     ORDER BY s.slot_date, j.title`,
    [RETREAT_ID],
  );
  return rows;
}

// ---- 0. start clean: remove every assignment in the retreat ----
await query(
  `DELETE FROM jewelheart_assignments a USING jewelheart_tasks t
   WHERE a.task_id = t.id AND t.retreat_id = $1`,
  [RETREAT_ID],
);
check('DB cleared to zero assignments', (await assignmentRows()).length === 0);

// ---- 1. home shows "no shifts" ----
let home = await buildJewelheartHomeScreen(UID);
let flat = flatten(home);
const summary0 = flat.texts.find((t) => /shift/.test(t.content));
check('home summary is "no shifts"', summary0?.content === 'no shifts', summary0?.content);
const homeLine = flat.texts.find((t) => t.content.startsWith('Home'));
check('home subtitle date is m/d', /Day 2, Tue, 7\/21$/.test(homeLine?.content || ''), homeLine?.content);

// ---- 2. open-shifts search (all days, all jobs) ----
let assign = await buildJewelheartVolunteerAssignScreen(UID, undefined, { retreatId: RETREAT_ID });
let aflat = flatten(assign);
const total0 = aflat.texts.find((t) => /Open shifts found/.test(t.content));
check('search returns open shifts', Boolean(total0), total0?.content);
const openButtons0 = aflat.buttons.filter((b) => b.target === 'jewelheart.volunteer.shift');
check('open shift buttons exist', openButtons0.length > 0, `${openButtons0.length} buttons`);
check(
  'open shift buttons carry day after en dash',
  openButtons0.every((b) => / – (Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(b.label)),
  openButtons0[0]?.label,
);
const assignSubtitle = aflat.texts.find((t) => t.content.startsWith('Open shifts –'));
check('assign subtitle date is m/d', /, 7\/21$/.test(assignSubtitle?.content || ''), assignSubtitle?.content);

// pick one today shift + one future shift
const todayBtn = openButtons0.find((b) => b.payload?.dayIso === TODAY);
const futureBtn = openButtons0.find((b) => b.payload?.dayIso === '2026-07-22');
check('found a today candidate', Boolean(todayBtn), todayBtn?.label);
check('found a tomorrow candidate', Boolean(futureBtn), futureBtn?.label);

// ---- 3. assign the today shift via the shift screen (one-shot checkinOp=assign) ----
let shift = await buildJewelheartVolunteerShiftScreen(UID, undefined, {
  ...todayBtn.payload,
  checkinOp: 'assign',
});
let sflat = flatten(shift);
let rows = await assignmentRows();
check('DB has 1 assignment after assign', rows.length === 1, JSON.stringify(rows[0] || null));
check('assignment is on the chosen task', rows[0]?.task_id === todayBtn.payload.taskId);
check('assignment day is today', rows[0]?.day === TODAY, rows[0]?.day);
check(
  'shift page confirms assignment',
  sflat.texts.some((t) => /assigned to you/.test(t.content)),
);
const checkinBtn = sflat.buttons.find((b) => b.target === 'jewelheart.volunteer.checkin');
check('today shift page offers check-in button', /^Check in for /.test(checkinBtn?.label || ''), checkinBtn?.label);
const gold = sflat.texts.find((t) => t.bg === '#FFCA10');
check('today day+job bar is gold', Boolean(gold), gold?.content);

// idempotency: replaying assign does not duplicate
await buildJewelheartVolunteerShiftScreen(UID, undefined, { ...todayBtn.payload, checkinOp: 'assign' });
check('replayed assign stays at 1 row', (await assignmentRows()).length === 1);

// ---- 4. assign the tomorrow shift too ----
await buildJewelheartVolunteerShiftScreen(UID, undefined, { ...futureBtn.payload, checkinOp: 'assign' });
rows = await assignmentRows();
check('DB has 2 assignments', rows.length === 2);

// ---- 5. home counts update ----
home = await buildJewelheartHomeScreen(UID);
flat = flatten(home);
const summary2 = flat.texts.find((t) => /shifts/.test(t.content));
check(
  'home summary "2 shifts, 1 today – tap to check in"',
  summary2?.content === '2 shifts, 1 today – tap to check in',
  summary2?.content,
);

// ---- 6. assigned shifts are filtered out of a fresh search ----
assign = await buildJewelheartVolunteerAssignScreen(UID, undefined, { retreatId: RETREAT_ID });
aflat = flatten(assign);
const openButtons1 = aflat.buttons.filter((b) => b.target === 'jewelheart.volunteer.shift');
const stillThere = openButtons1.find(
  (b) =>
    (b.payload?.jobId === todayBtn.payload.jobId && b.payload?.dayIso === todayBtn.payload.dayIso) ||
    (b.payload?.jobId === futureBtn.payload.jobId && b.payload?.dayIso === futureBtn.payload.dayIso),
);
check('assigned shifts no longer offered in search', !stillThere, stillThere?.label);

// ---- 7. My assigned shifts page ----
let mine = await buildJewelheartVolunteerMineScreen(UID, undefined, { retreatId: RETREAT_ID });
let mflat = flatten(mine);
const thirdBar = mflat.texts.find((t) => /unassigns/.test(t.content));
check('mine third bar reads "🗑 unassigns – tap for detail"', thirdBar?.content === '🗑 unassigns – tap for detail', thirdBar?.content);
const trashButtons = mflat.buttons.filter((b) => b.label === '🗑');
const shiftButtons = mflat.buttons.filter((b) => b.target === 'jewelheart.volunteer.shift' && b.bg === '#92160E');
check('mine lists 2 trash buttons', trashButtons.length === 2, String(trashButtons.length));
check('mine lists 2 maroon shift buttons', shiftButtons.length === 2, shiftButtons.map((b) => b.label).join(' | '));
check(
  'mine shift labels carry day after en dash',
  shiftButtons.every((b) => / – (Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(b.label)),
);

// ---- 8. My shift info for the future (non-today) shift: blue bar, no check-in ----
shift = await buildJewelheartVolunteerShiftScreen(UID, undefined, {
  retreatId: RETREAT_ID,
  shiftOp: 'mine',
  jobId: futureBtn.payload.jobId,
  dayIso: futureBtn.payload.dayIso,
  taskId: futureBtn.payload.taskId,
});
sflat = flatten(shift);
const dayJobBar = sflat.texts.find((t) => t.bg === '#7A95CA' && / – Wed$/.test(t.content));
check('future shift info bar is blue with day+job', Boolean(dayJobBar), dayJobBar?.content);
check(
  'future shift info has no check-in button',
  !sflat.buttons.some((b) => b.target === 'jewelheart.volunteer.checkin'),
);
check(
  'shift info shows instruction text',
  sflat.texts.some((t) => /instruction|Contact/i.test(t.content)),
);

// ---- 9. unassign both via mine page (one-shot checkinOp=unassign) ----
mine = await buildJewelheartVolunteerMineScreen(UID, undefined, {
  retreatId: RETREAT_ID,
  checkinOp: 'unassign',
  taskId: todayBtn.payload.taskId,
});
check('DB has 1 assignment after first unassign', (await assignmentRows()).length === 1);
mine = await buildJewelheartVolunteerMineScreen(UID, undefined, {
  retreatId: RETREAT_ID,
  checkinOp: 'unassign',
  taskId: futureBtn.payload.taskId,
});
rows = await assignmentRows();
check('DB back to zero assignments', rows.length === 0);
mflat = flatten(mine);
check(
  'mine page shows empty state',
  mflat.texts.some((t) => /No shifts are assigned to you yet/.test(t.content)),
);

// ---- 10. home back to "no shifts"; search offers the shifts again ----
home = await buildJewelheartHomeScreen(UID);
flat = flatten(home);
const summary3 = flat.texts.find((t) => /shift/.test(t.content));
check('home summary back to "no shifts"', summary3?.content === 'no shifts', summary3?.content);
assign = await buildJewelheartVolunteerAssignScreen(UID, undefined, { retreatId: RETREAT_ID });
aflat = flatten(assign);
const openButtons2 = aflat.buttons.filter((b) => b.target === 'jewelheart.volunteer.shift');
check(
  'unassigned shifts reappear in search',
  openButtons2.length === openButtons0.length,
  `${openButtons2.length} vs ${openButtons0.length}`,
);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
