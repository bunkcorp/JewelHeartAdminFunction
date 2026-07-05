import { query } from './src/db.js';

const cols = await query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`,
);
console.log('users columns:', cols.rows.map((r) => r.column_name).join(', '));

const users = await query(`SELECT id FROM users LIMIT 15`);
console.log('users ids:', users.rows);

const missing = await query(`
  SELECT DISTINCT ra.firebase_uid
  FROM jewelheart_retreat_admins ra
  LEFT JOIN jewelheart_admins ga ON ga.firebase_uid = ra.firebase_uid
  WHERE ga.firebase_uid IS NULL
`);
console.log('retreat admins NOT in global admins:', missing.rows);
