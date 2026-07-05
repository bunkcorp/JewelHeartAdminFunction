#!/usr/bin/env node
import { query } from '../src/db.js';

const patterns = process.argv.slice(2);
if (!patterns.length) {
  console.error('usage: inspect-roster-names.mjs Weiner Reese Esckilsen');
  process.exit(1);
}

for (const p of patterns) {
  const { rows } = await query(
    `SELECT id, display_name, email, phone, firebase_uid
     FROM jewelheart_volunteers
     WHERE display_name ILIKE $1 OR email ILIKE $1
     ORDER BY display_name`,
    [`%${p}%`],
  );
  console.log(`\n=== ${p} (${rows.length}) ===`);
  for (const r of rows) console.log(JSON.stringify(r));
}
