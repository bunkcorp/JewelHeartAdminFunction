import { query } from './src/db.js';

const users = await query(
  `SELECT id, display_name, name, username FROM users WHERE display_name ILIKE '%Lewis%' OR display_name ILIKE '%Woods%' OR name ILIKE '%Lewis%' OR username ILIKE '%lewis%' OR username ILIKE '%djlew%' LIMIT 20`,
);
console.log('users matching Lewis:', users.rows);

const allRadmin = await query(`SELECT DISTINCT firebase_uid FROM jewelheart_retreat_admins ORDER BY 1`);
console.log('all retreat admin uids:', allRadmin.rows);
