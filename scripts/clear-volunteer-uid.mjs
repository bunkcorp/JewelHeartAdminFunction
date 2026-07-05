#!/usr/bin/env node
/** Clear firebase_uid on a volunteer row (test/dev recovery). */
import { query } from '../src/db.js';

const email = process.argv[2];
if (!email) {
  console.error('usage: node scripts/clear-volunteer-uid.mjs <email>');
  process.exit(1);
}

const { rows } = await query(
  `UPDATE jewelheart_volunteers
   SET firebase_uid = NULL, updated_at = now()
   WHERE lower(trim(email)) = lower(trim($1))
   RETURNING id, display_name, email, phone`,
  [email],
);
console.log(rows[0] ? `cleared uid for ${rows[0].display_name}` : 'not found', rows[0] || '');
