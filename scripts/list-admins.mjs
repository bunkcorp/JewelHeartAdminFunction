import { query } from '../integrations/private-server/src/db.js';

const admins = await query('SELECT firebase_uid, created_at FROM jewelheart_admins ORDER BY created_at');
console.log('jewelheart_admins:', JSON.stringify(admins.rows, null, 2));
const managers = await query('SELECT firebase_uid FROM jewelheart_managers ORDER BY created_at');
console.log('jewelheart_managers:', JSON.stringify(managers.rows, null, 2));
