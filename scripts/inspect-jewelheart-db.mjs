#!/usr/bin/env node
/**
 * Inspect JewelHeart DB on prod (run from ~/private-server):
 *   node --env-file=.env scripts-inspect/inspect-jewelheart-db.mjs
 * Prints retreat, jobs, slots/tasks per day, volunteers, assignments.
 */
import { query } from '../src/db.js';

const out = (label, rows) => {
  console.log(`\n=== ${label} (${rows.length}) ===`);
  for (const r of rows) console.log(JSON.stringify(r));
};

const retreats = await query(
  `SELECT id, name, start_date::text AS start, end_date::text AS end FROM jewelheart_retreats ORDER BY start_date DESC LIMIT 5`,
);
out('retreats', retreats.rows);

const retreat = retreats.rows.find((r) => r.start === '2026-07-20') || retreats.rows[0];
if (!retreat) process.exit(0);
console.log('\nUsing retreat:', retreat.id, retreat.name);

const jobs = await query(
  `SELECT id, title FROM jewelheart_jobs WHERE retreat_id = $1 ORDER BY title`,
  [retreat.id],
);
out('jobs', jobs.rows);

const tasks = await query(
  `SELECT t.id AS task_id, j.title AS job, s.slot_date::text AS day, s.label AS slot
   FROM jewelheart_tasks t
   JOIN jewelheart_jobs j ON j.id = t.job_id
   JOIN jewelheart_slots s ON s.id = t.slot_id
   WHERE j.retreat_id = $1
   ORDER BY s.slot_date, j.title LIMIT 200`,
  [retreat.id],
);
out('tasks', tasks.rows);

const vols = await query(
  `SELECT v.id, v.display_name, v.firebase_uid
   FROM jewelheart_volunteers v
   JOIN jewelheart_retreat_volunteers rv ON rv.volunteer_id = v.id AND rv.retreat_id = $1
   ORDER BY v.display_name LIMIT 50`,
  [retreat.id],
);
out('linked volunteers', vols.rows);

const assigns = await query(
  `SELECT a.id, v.display_name, j.title AS job, s.slot_date::text AS day
   FROM jewelheart_assignments a
   JOIN jewelheart_tasks t ON t.id = a.task_id
   JOIN jewelheart_jobs j ON j.id = t.job_id
   JOIN jewelheart_slots s ON s.id = t.slot_id
   JOIN jewelheart_volunteers v ON v.id = a.volunteer_id
   WHERE j.retreat_id = $1
   ORDER BY s.slot_date, j.title LIMIT 100`,
  [retreat.id],
);
out('assignments', assigns.rows);
