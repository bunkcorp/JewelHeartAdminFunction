#!/usr/bin/env node
/**
 * Verify Find-open-shifts day graying + All-jobs row.
 * Run on prod:
 *   JEWELHEART_VOLUNTEER_HOME_TEST_TODAY=2026-07-22 \
 *   ~/.nvm/versions/node/v20.20.0/bin/node --env-file=.env scripts-inspect/search-check.mjs
 */
import { query } from '../src/db.js';
import { buildJewelheartVolunteerSearchScreen } from '../src/jewelheart/jewelheart-sdui-home.js';

const RETREAT_ID = '34d43115-67b3-5fbf-9173-abb051c11ca7';
const adm = await query('SELECT firebase_uid FROM jewelheart_admins LIMIT 1');
const uid = adm.rows[0]?.firebase_uid || 'verify-test-uid';

const screen = await buildJewelheartVolunteerSearchScreen(uid, undefined, { retreatId: RETREAT_ID });

const buttons = [];
(function walk(n) {
  if (Array.isArray(n)) return n.forEach(walk);
  if (n && typeof n === 'object') {
    if (n.type === 'button') buttons.push(n);
    Object.values(n).forEach(walk);
  }
})(screen);

console.log('TEST_TODAY =', process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY || '(real)');
console.log('\nDay buttons:');
const wd = /^(× )?(Mon|Tue|Wed|Thu|Fri|Sat)$/;
for (const b of buttons) {
  const lbl = String(b.content || b.label || '');
  if (wd.test(lbl)) {
    console.log(`  ${lbl.padEnd(6)} bg=${b.style?.backgroundColor}  action=${b.action ? 'yes' : 'NO'}`);
  }
}

const allJobs = buttons.find((b) => /All jobs/i.test(String(b.content || b.label || '')));
console.log('\nAll jobs button present:', !!allJobs);

const jobBtns = buttons.filter((b) => b.action?.payload && 'selectedJobs' in (b.action.payload || {}) && !/All jobs/i.test(String(b.content || '')) && !wd.test(String(b.content || '')));
console.log('job list buttons (approx):', jobBtns.length);
process.exit(0);
