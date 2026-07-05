#!/usr/bin/env node
import { query } from '../src/db.js';

const { rows } = await query(
  `SELECT id, email, phone, firebase_uid FROM jewelheart_volunteers WHERE display_name ILIKE '%Scott Merwin%'`,
);
console.log('volunteers', rows);
if (rows[0]) {
  const inv = await query(
    `SELECT id, expires_at, consumed_at, created_at
     FROM jewelheart_volunteer_invites WHERE volunteer_id = $1 ORDER BY created_at DESC LIMIT 3`,
    [rows[0].id],
  );
  console.log('invites', inv.rows);
}
