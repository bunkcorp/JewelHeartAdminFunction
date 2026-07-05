import { query } from './src/db.js';

/** David Lewis — retreat admin on all retreats; needs global admin for home Admin pill. */
const LEWIS_FIREBASE_UID = 'drjSixLe9TMVCeP6J8u0Rf86XUi1';

const r = await query(
  `INSERT INTO jewelheart_admins (firebase_uid) VALUES ($1) ON CONFLICT (firebase_uid) DO NOTHING RETURNING firebase_uid`,
  [LEWIS_FIREBASE_UID],
);
console.log('inserted:', r.rows);

const all = await query('SELECT firebase_uid FROM jewelheart_admins ORDER BY created_at');
console.log('jewelheart_admins now:', all.rows);
