#!/usr/bin/env node
import { query } from '../src/db.js';

const email = process.argv[2] || 'djlewis@triadic.com';
const { rows } = await query(
  `SELECT id, display_name, email, phone, firebase_uid, roster_admin, roster_manage, updated_at
   FROM jewelheart_volunteers
   WHERE lower(trim(email)) = lower(trim($1))
      OR display_name ILIKE '%David Lewis%'
   ORDER BY display_name`,
  [email],
);
console.log('volunteers:', JSON.stringify(rows, null, 2));

if (rows[0]?.id) {
  const inv = await query(
    `SELECT id, consumed_at, expires_at, created_at
     FROM jewelheart_volunteer_invites
     WHERE volunteer_id = $1
     ORDER BY created_at DESC LIMIT 5`,
    [rows[0].id],
  );
  console.log('invites:', JSON.stringify(inv.rows, null, 2));
}
