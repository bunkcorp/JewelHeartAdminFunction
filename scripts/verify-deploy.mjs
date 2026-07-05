#!/usr/bin/env node
/**
 * Post-deploy smoke test (run on prod from ~/private-server):
 *   ~/.nvm/versions/node/v20.20.0/bin/node --env-file=.env scripts-inspect/verify-deploy.mjs
 */
import { query } from '../src/db.js';
import {
  buildJewelheartHomeScreen,
  buildJewelheartVolunteerSearchScreen,
  buildJewelheartVolunteerShiftScreen,
  buildJewelheartVolunteerAdminScreen,
} from '../src/jewelheart/jewelheart-sdui-home.js';

const RETREAT_ID = '34d43115-67b3-5fbf-9173-abb051c11ca7';
const CANON = [
  'Café, lunch break / Light cleanup', 'Café, end of day / Full cleanup',
  'Kitchen, lunch brk / Light cleanup', 'Kitchen, end of day / Full cleanup',
  'Coffee & snacks / Morning setup', 'Coffee & snacks / Evening brkdwn',
  'Tara Paradse, store / Vacuum', 'JH off, main hallway / Vacuum',
  'Coatrm, café hallwy / Vacuum', 'Foyer & lobby / Vacuum', 'Lama offices / Clean',
  "Men's room / Clean & stock", 'Urinals / Check pads & mop', "Women's room / Clean & stock",
  'Unisx, Lama bathrooms', 'Front windows / Clean', 'Towels, mop pads / launder at home',
];

// The UI compacts " / " to " • "; compare against the display form.
const CANON_DISPLAY = CANON.map((t) => t.replace(/\s\/\s/g, ' • '));

const adm = await query('SELECT firebase_uid FROM jewelheart_admins LIMIT 1');
const adminUid = adm.rows[0]?.firebase_uid;
console.log('admin uid:', adminUid || '(none)');
const uid = adminUid || 'verify-test-uid';

function ok(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }

// Home
const home = await buildJewelheartHomeScreen(uid);
ok('home builds', !!home && !!(home.screen || home.components || home.stickyFooterComponents || home));

// Search (job list order)
const search = await buildJewelheartVolunteerSearchScreen(uid, undefined, { retreatId: RETREAT_ID });
const sjson = JSON.stringify(search);
const order = CANON_DISPLAY
  .map((t) => ({ t, i: sjson.indexOf(t) }))
  .filter((x) => x.i >= 0)
  .sort((a, b) => a.i - b.i)
  .map((x) => x.t);
console.log('search job order:');
order.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
ok('all 17 jobs present in search', order.length === 17);
ok('search order == spreadsheet order', JSON.stringify(order) === JSON.stringify(CANON_DISPLAY));

// Shift screen instructions (Men's room)
try {
  const mens = await query(
    `SELECT t.id AS task_id, j.id AS job_id, s.slot_date::text AS dy
     FROM jewelheart_tasks t JOIN jewelheart_jobs j ON j.id=t.job_id JOIN jewelheart_slots s ON s.id=t.slot_id
     WHERE t.retreat_id=$1 AND j.title=$2 ORDER BY s.slot_date LIMIT 1`,
    [RETREAT_ID, "Men's room / Clean & stock"],
  );
  if (mens.rows[0]) {
    const { task_id, job_id, dy } = mens.rows[0];
    const shift = await buildJewelheartVolunteerShiftScreen(uid, undefined, {
      shiftOp: 'assign_me', jobId: job_id, dayIso: dy, taskId: task_id,
    });
    const shjson = JSON.stringify(shift);
    ok('shift shows Men\'s room instruction "Clean sink"', shjson.includes('Clean sink'));
    ok('shift shows "Empty trash, replace bag"', shjson.includes('Empty trash, replace bag'));
  } else {
    ok('found Men\'s room task', false);
  }
} catch (e) {
  console.log('FAIL  shift screen check -', e.message);
}

// Admin screen
const admin = await buildJewelheartVolunteerAdminScreen(uid, undefined, { retreatId: RETREAT_ID });
const ajson = JSON.stringify(admin);
ok('admin builds', !!admin);
ok('admin has Generate Poster', /Generate Poster/i.test(ajson));

process.exit(0);
