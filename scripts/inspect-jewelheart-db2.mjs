import { query } from '../src/db.js';

const rid = '34d43115-67b3-5fbf-9173-abb051c11ca7';
const sub = await query(
  `SELECT j.title, sj.sort_order, sj.text
   FROM jewelheart_job_subjobs sj JOIN jewelheart_jobs j ON j.id = sj.job_id
   WHERE j.retreat_id = $1 ORDER BY j.title, sj.sort_order LIMIT 30`,
  [rid],
);
console.log('subjob rows:', sub.rows.length);
for (const r of sub.rows) console.log(JSON.stringify(r));

const needed = await query(
  `SELECT volunteers_needed, count(*) FROM jewelheart_jobs WHERE retreat_id = $1 GROUP BY 1`,
  [rid],
);
console.log('job volunteers_needed histogram:', JSON.stringify(needed.rows));

const admins = await query(`SELECT firebase_uid FROM jewelheart_admins LIMIT 10`);
console.log('global admins:', JSON.stringify(admins.rows));
const radmins = await query(`SELECT firebase_uid, retreat_id FROM jewelheart_retreat_admins LIMIT 10`);
console.log('retreat admins:', JSON.stringify(radmins.rows));
const linkedAt = await query(
  `SELECT v.display_name, rv.linked_at FROM jewelheart_retreat_volunteers rv JOIN jewelheart_volunteers v ON v.id = rv.volunteer_id WHERE rv.retreat_id = $1 ORDER BY rv.linked_at NULLS LAST, v.display_name`,
  [rid],
);
console.log('linked order:', JSON.stringify(linkedAt.rows));
