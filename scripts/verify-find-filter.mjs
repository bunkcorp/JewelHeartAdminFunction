/**
 * Executable spec test for the Find filter state machine (docs/sdui/find.md).
 *
 * Pure logic, no DB. This MIRRORS the helpers in
 * integrations/private-server/jewelheart-sdui-home.js (findFilterTapAll /
 * findFilterTapItem and the volunteerFindFilter* wrappers). Keep the two in sync:
 * if you change the state machine there, mirror it here and the assertions below
 * document the agreed behavior.
 *
 *   node scripts/verify-find-filter.mjs
 */

let failures = 0;
function check(label, cond) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${label}`);
  }
}
function eq(label, got, want) {
  check(`${label} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`, got === want);
}

/* ---- mirror of jewelheart-sdui-home.js ---- */

function parseCsvParam(s) {
  return new Set(String(s || '').split(',').map((x) => x.trim()).filter(Boolean));
}

function volunteerFindFilterDefaultState(dayIsos) {
  if (dayIsos.length === 1) {
    return { daysAll: '0', selectedDays: dayIsos[0], daysPrev: '', jobsAll: '1', selectedJobs: '', jobsPrev: '' };
  }
  return { daysAll: '1', selectedDays: '', daysPrev: '', jobsAll: '1', selectedJobs: '', jobsPrev: '' };
}

function volunteerFindFilterFromParams(params, dayIsos) {
  if (params.filterReset === '1') return volunteerFindFilterDefaultState(dayIsos);
  const def = volunteerFindFilterDefaultState(dayIsos);
  let daysAll = params.daysAll === '0' ? '0' : params.daysAll === '1' ? '1' : def.daysAll;
  let selectedDays = String(params.selectedDays || '').trim();
  let daysPrev = String(params.daysPrev || '').trim();
  let jobsAll = params.jobsAll === '0' ? '0' : params.jobsAll === '1' ? '1' : def.jobsAll;
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

function findFilterTapAll(all, selected, prev) {
  if (all === '1') {
    if (String(prev || '').trim()) return { all: '0', selected: String(prev).trim(), prev: '' };
    return { all: '1', selected: '', prev: '' };
  }
  return { all: '1', selected: '', prev: String(selected || '').trim() };
}

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

function nextDaysAll(state, dayIsos) {
  if (dayIsos.length === 1) return state;
  const g = findFilterTapAll(state.daysAll, state.selectedDays, state.daysPrev);
  return { ...state, daysAll: g.all, selectedDays: g.selected, daysPrev: g.prev };
}
function nextDay(state, iso, dayIsos) {
  if (dayIsos.length === 1) return state;
  const g = findFilterTapItem(state.daysAll, state.selectedDays, state.daysPrev, iso, dayIsos);
  return { ...state, daysAll: g.all, selectedDays: g.selected, daysPrev: g.prev };
}
function nextJobsAll(state) {
  const g = findFilterTapAll(state.jobsAll, state.selectedJobs, state.jobsPrev);
  return { ...state, jobsAll: g.all, selectedJobs: g.selected, jobsPrev: g.prev };
}
function nextJob(state, id, order) {
  const g = findFilterTapItem(state.jobsAll, state.selectedJobs, state.jobsPrev, id, order);
  return { ...state, jobsAll: g.all, selectedJobs: g.selected, jobsPrev: g.prev };
}
function allDaysNoAction(s) {
  return s.daysAll === '1' && !String(s.daysPrev || '').trim();
}
function allJobsNoAction(s) {
  return s.jobsAll === '1' && !String(s.jobsPrev || '').trim();
}

/* ---- spec scenarios (docs/sdui/find.md) ---- */

const dayIsos = ['2026-07-21', '2026-07-22', '2026-07-23'];
const jobIds = ['kitchen', 'garden', 'office'];

// §4 default
let s = volunteerFindFilterDefaultState(dayIsos);
check('default all days/jobs', s.daysAll === '1' && s.jobsAll === '1');
check('default All days carries no action', allDaysNoAction(s));
check('default All jobs carries no action', allJobsNoAction(s));

// §5.1 All days tap while on with no prev => no-op (symmetric with jobs; no today fallback)
s = nextDaysAll(s, dayIsos);
eq('All days no-op keeps daysAll', s.daysAll, '1');
eq('All days no-op keeps selectedDays empty', s.selectedDays, '');
eq('All days no-op keeps daysPrev empty', s.daysPrev, '');

// §5.2 pick a single day from all-on
s = nextDay(s, '2026-07-22', dayIsos);
eq('day tap from all -> that day only (daysAll)', s.daysAll, '0');
eq('day tap from all -> that day only (selected)', s.selectedDays, '2026-07-22');
eq('day tap from all clears prev', s.daysPrev, '');

// §5.2 add another day -> CSV in calendar order
s = nextDay(s, '2026-07-21', dayIsos);
eq('two days in calendar order', s.selectedDays, '2026-07-21,2026-07-22');

// §5.1 turn All days back on -> remember the subset as prev
s = nextDaysAll(s, dayIsos);
eq('All days on after subset', s.daysAll, '1');
eq('All days remembers subset as prev', s.daysPrev, '2026-07-21,2026-07-22');
check('All days now actionable (has prev)', !allDaysNoAction(s));

// §5.1 tap All days while on with prev -> restore subset, clear prev
s = nextDaysAll(s, dayIsos);
eq('All days restore subset', s.selectedDays, '2026-07-21,2026-07-22');
eq('All days restore clears prev', s.daysPrev, '');

// §5.2 empty-revert clears prev (decision #5)
s = volunteerFindFilterDefaultState(dayIsos);
s = nextDay(s, '2026-07-23', dayIsos); // all -> {23}
s = nextDay(s, '2026-07-23', dayIsos); // remove last -> revert to all
eq('empty-revert -> all on', s.daysAll, '1');
eq('empty-revert clears selected', s.selectedDays, '');
eq('empty-revert clears prev', s.daysPrev, '');

// §5.3 / §5.4 jobs are symmetric with days
let j = volunteerFindFilterDefaultState(dayIsos);
check('All jobs no-op when on/no-prev', allJobsNoAction(j));
j = nextJobsAll(j);
eq('All jobs no-op keeps jobsAll', j.jobsAll, '1');
eq('All jobs no-op keeps selected empty', j.selectedJobs, '');

j = nextJob(j, 'garden', jobIds);
eq('job from all -> that job (jobsAll)', j.jobsAll, '0');
eq('job from all -> that job (selected)', j.selectedJobs, 'garden');
j = nextJob(j, 'kitchen', jobIds);
eq('jobs in list order', j.selectedJobs, 'kitchen,garden');

j = nextJobsAll(j);
eq('All jobs remembers subset as prev', j.jobsPrev, 'kitchen,garden');
j = nextJobsAll(j);
eq('All jobs restore subset', j.selectedJobs, 'kitchen,garden');
eq('All jobs restore clears prev', j.jobsPrev, '');

j = volunteerFindFilterDefaultState(dayIsos);
j = nextJob(j, 'office', jobIds);
j = nextJob(j, 'office', jobIds);
eq('jobs empty-revert -> all on', j.jobsAll, '1');
eq('jobs empty-revert clears prev', j.jobsPrev, '');

// §7 single-day retreat: All days omitted, lone day fixed
const oneDay = ['2026-07-21'];
let one = volunteerFindFilterDefaultState(oneDay);
eq('single-day selects the day', one.selectedDays, '2026-07-21');
eq('single-day daysAll off', one.daysAll, '0');
const oneAfter = nextDay(one, '2026-07-21', oneDay);
eq('single-day day tap is a no-op (daysAll)', oneAfter.daysAll, one.daysAll);
eq('single-day day tap is a no-op (selected)', oneAfter.selectedDays, one.selectedDays);

// §3 from-params invariants
const r1 = volunteerFindFilterFromParams({ daysAll: '0', selectedDays: '' }, dayIsos);
eq('params daysAll=0 + empty -> revert to all', r1.daysAll, '1');
eq('params revert clears prev', r1.daysPrev, '');
const r2 = volunteerFindFilterFromParams({ jobsAll: '1', selectedJobs: 'kitchen' }, dayIsos);
eq('params jobsAll=1 ignores stale selection', r2.selectedJobs, '');
const r3 = volunteerFindFilterFromParams({ filterReset: '1', daysAll: '0', selectedDays: 'x' }, dayIsos);
eq('params filterReset -> default daysAll', r3.daysAll, '1');

if (failures) {
  console.error(`\nverify-find-filter: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('verify-find-filter: all assertions passed');
