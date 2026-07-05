import { query } from './src/db.js';

const admins = await query('SELECT firebase_uid FROM jewelheart_admins');
console.log('jewelheart_admins:', admins.rows);

const kc = await query('SELECT keycloak_sub, user_id FROM keycloak_users LIMIT 20').catch((e) => {
  console.log('keycloak_users error:', e.message);
  return { rows: [] };
});
console.log('keycloak_users:', kc.rows);

const users = await query(
  `SELECT id, email, display_name FROM users WHERE email ILIKE '%lewis%' OR email ILIKE '%woods%' OR display_name ILIKE '%Lewis%' OR display_name ILIKE '%Woods%' LIMIT 20`,
).catch((e) => {
  console.log('users error:', e.message);
  return { rows: [] };
});
console.log('users:', users.rows);

const vols = await query(
  `SELECT id, display_name, firebase_uid FROM jewelheart_volunteers WHERE display_name ILIKE '%Lewis%' OR display_name ILIKE '%Woods%' LIMIT 10`,
);
console.log('volunteers:', vols.rows);

const radmins = await query('SELECT firebase_uid, retreat_id FROM jewelheart_retreat_admins LIMIT 10');
console.log('retreat_admins:', radmins.rows);
