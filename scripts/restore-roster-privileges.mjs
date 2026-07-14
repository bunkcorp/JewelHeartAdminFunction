#!/usr/bin/env node
/**
 * Restore Admin + Manage for a roster member by email (dev/test break-glass).
 *
 *   node --env-file=.env scripts-inspect/restore-roster-privileges.mjs djlewis@triadic.com
 */
import { query } from '../src/db.js';
import { syncVolunteerAclFromRosterFlags } from '../src/jewelheart/jewelheart-volunteer-admin-tools.js';

const email = process.argv[2] || 'djlewis@triadic.com';

const { rows } = await query(
  `SELECT id,
          display_name AS "displayName",
          email,
          firebase_uid AS "firebaseUid",
          roster_admin AS "rosterAdmin",
          roster_manage AS "rosterManage"
   FROM jewelheart_volunteers
   WHERE lower(trim(email)) = lower(trim($1))
   ORDER BY updated_at DESC
   LIMIT 1`,
  [email],
);

if (!rows[0]) {
  console.error('No volunteer found for', email);
  process.exit(1);
}

const before = rows[0];
console.log('before:', before);

const { rows: updatedRows } = await query(
  `UPDATE jewelheart_volunteers
   SET roster_admin = true,
       roster_manage = true,
       updated_at = now()
   WHERE id = $1
   RETURNING id,
             display_name AS "displayName",
             email,
             firebase_uid AS "firebaseUid",
             roster_admin AS "rosterAdmin",
             roster_manage AS "rosterManage"`,
  [before.id],
);

const updated = updatedRows[0];
const synced = await syncVolunteerAclFromRosterFlags(query, updated);
console.log('after:', { ...updated, ...synced });

const admins = await query('SELECT firebase_uid FROM jewelheart_admins ORDER BY created_at');
const mgrs = await query('SELECT firebase_uid FROM jewelheart_managers ORDER BY created_at');
console.log('jewelheart_admins:', admins.rows);
console.log('jewelheart_managers:', mgrs.rows);
