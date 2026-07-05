#!/usr/bin/env node
/**
 * Re-seed the live Summer-2026 retreat with the v8 single-field job set.
 * - Replaces old jobs/slots/tasks (assignments cascade away).
 * - One shift per (job, scheduled day); capacity 1 each.
 * - Spreadsheet order preserved via increasing created_at.
 * - Starts with NO assignments.
 *
 * Run on prod from ~/private-server:
 *   ~/.nvm/versions/node/v20.20.0/bin/node --env-file=.env scripts-inspect/reseed-v8.mjs
 */
import { randomUUID } from 'crypto';
import { query } from '../src/db.js';

const RETREAT_ID = '34d43115-67b3-5fbf-9173-abb051c11ca7';

// Retreat days (Mon..Sat). label/day_of_week are cosmetic; one slot per day.
const DAYS = [
  { iso: '2026-07-20', dow: 'Monday', label: 'Mon Jul 20' },
  { iso: '2026-07-21', dow: 'Tuesday', label: 'Tue Jul 21' },
  { iso: '2026-07-22', dow: 'Wednesday', label: 'Wed Jul 22' },
  { iso: '2026-07-23', dow: 'Thursday', label: 'Thu Jul 23' },
  { iso: '2026-07-24', dow: 'Friday', label: 'Fri Jul 24' },
  { iso: '2026-07-25', dow: 'Saturday', label: 'Sat Jul 25' },
];

// v8 jobs in spreadsheet order (curated, validated against the Data tab).
const JOBS = [
  { title: 'Café, lunch break / Light cleanup', days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Café, end of day / Full cleanup', days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Kitchen, lunch brk / Light cleanup', days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Kitchen, end of day / Full cleanup', days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Coffee & snacks / Morning setup', days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Coffee & snacks / Evening brkdwn', days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Tara Paradse, store / Vacuum', days: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { title: 'JH off, main hallway / Vacuum', days: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { title: 'Coatrm, café hallwy / Vacuum', days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Foyer & lobby / Vacuum', days: ['2026-07-22', '2026-07-25'] },
  { title: 'Lama offices / Clean', days: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { title: "Men's room / Clean & stock", days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Urinals / Check pads & mop', days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: "Women's room / Clean & stock", days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Unisx, Lama bathrooms', days: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Front windows / Clean', days: ['2026-07-22', '2026-07-25'] },
  { title: 'Towels, mop pads / launder at home', days: ['2026-07-21', '2026-07-23', '2026-07-25'] },
];

const esc = (s) => String(s).replace(/'/g, "''");

const slotByIso = new Map(DAYS.map((d) => [d.iso, { id: randomUUID(), ...d }]));

const stmts = [];
stmts.push('BEGIN;');
stmts.push(`DELETE FROM jewelheart_tasks WHERE retreat_id = '${RETREAT_ID}';`);
stmts.push(`DELETE FROM jewelheart_slots WHERE retreat_id = '${RETREAT_ID}';`);
stmts.push(`DELETE FROM jewelheart_jobs  WHERE retreat_id = '${RETREAT_ID}';`);

for (const d of DAYS) {
  const s = slotByIso.get(d.iso);
  stmts.push(
    `INSERT INTO jewelheart_slots (id, retreat_id, label, slot_date, day_of_week, activity_context, time_band, created_at, updated_at) ` +
      `VALUES ('${s.id}', '${RETREAT_ID}', '${esc(d.label)}', '${d.iso}'::date, '${d.dow}', NULL, 'anytime', now(), now());`,
  );
}

let taskCount = 0;
JOBS.forEach((job, idx) => {
  const jobId = randomUUID();
  stmts.push(
    `INSERT INTO jewelheart_jobs (id, retreat_id, title, volunteers_needed, estimated_minutes, created_at, updated_at) ` +
      `VALUES ('${jobId}', '${RETREAT_ID}', '${esc(job.title)}', 1, 0, now() + interval '${idx} second', now());`,
  );
  for (const iso of job.days) {
    const slot = slotByIso.get(iso);
    if (!slot) throw new Error(`Job "${job.title}" references unknown day ${iso}`);
    stmts.push(
      `INSERT INTO jewelheart_tasks (id, retreat_id, job_id, slot_id, notes, created_at, updated_at) ` +
        `VALUES ('${randomUUID()}', '${RETREAT_ID}', '${jobId}', '${slot.id}', NULL, now(), now());`,
    );
    taskCount += 1;
  }
});
stmts.push('COMMIT;');

console.log(`Seeding ${JOBS.length} jobs, ${DAYS.length} slots, ${taskCount} tasks (0 assignments)...`);
await query(stmts.join('\n'));

const j = await query(`SELECT count(*)::int n FROM jewelheart_jobs WHERE retreat_id=$1`, [RETREAT_ID]);
const s = await query(`SELECT count(*)::int n FROM jewelheart_slots WHERE retreat_id=$1`, [RETREAT_ID]);
const t = await query(`SELECT count(*)::int n FROM jewelheart_tasks WHERE retreat_id=$1`, [RETREAT_ID]);
const a = await query(
  `SELECT count(*)::int n FROM jewelheart_assignments a JOIN jewelheart_tasks t ON t.id=a.task_id WHERE t.retreat_id=$1`,
  [RETREAT_ID],
);
console.log('VERIFY -> jobs:', j.rows[0].n, 'slots:', s.rows[0].n, 'tasks:', t.rows[0].n, 'assignments:', a.rows[0].n);
console.log('\nJob order check:');
const ord = await query(
  `SELECT title FROM jewelheart_jobs WHERE retreat_id=$1 ORDER BY created_at`,
  [RETREAT_ID],
);
ord.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.title}`));
