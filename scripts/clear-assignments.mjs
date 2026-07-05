#!/usr/bin/env node
/**
 * Clear ALL assignments for the live Summer 2026 retreat (start fresh).
 * Run on prod from ~/private-server:
 *   ~/.nvm/versions/node/v20.20.0/bin/node --env-file=.env scripts-inspect/clear-assignments.mjs
 */
import { query } from '../src/db.js';

const RETREAT_ID = '34d43115-67b3-5fbf-9173-abb051c11ca7';

const before = await query(
  `SELECT count(*)::int AS n
   FROM jewelheart_assignments a
   JOIN jewelheart_tasks t ON t.id = a.task_id
   WHERE t.retreat_id = $1`,
  [RETREAT_ID],
);
console.log('assignments before:', before.rows[0].n);

const del = await query(
  `DELETE FROM jewelheart_assignments a
   USING jewelheart_tasks t
   WHERE a.task_id = t.id AND t.retreat_id = $1`,
  [RETREAT_ID],
);
console.log('deleted:', del.rowCount);

const after = await query(
  `SELECT count(*)::int AS n
   FROM jewelheart_assignments a
   JOIN jewelheart_tasks t ON t.id = a.task_id
   WHERE t.retreat_id = $1`,
  [RETREAT_ID],
);
console.log('assignments after:', after.rows[0].n);
