#!/usr/bin/env node
/**
 * Ensure prod retreat roster is the starter three: David Lewis, Kevin Woods, Scott Merwin.
 * Removes other retreat links for this retreat only (does not delete global volunteer rows).
 */
import { query } from '../src/db.js';

const RETREAT_ID =
  String(process.env.JEWELHEART_ACTIVE_RETREAT_ID || '').trim() ||
  '34d43115-67b3-5fbf-9173-abb051c11ca7';

const STARTERS = [
  { displayName: 'David Lewis', email: 'djlewis@triadic.com', phone: null },
  { displayName: 'Kevin Woods', email: 'kevinalexwoods@gmail.com', phone: null },
  { displayName: 'Scott Merwin', email: 'smerwin@umich.edu', phone: '734-576-2398' },
];

async function upsertStarter({ displayName, email, phone }) {
  const { rows: byEmail } = await query(
    `SELECT id, display_name, email, phone, firebase_uid
     FROM jewelheart_volunteers
     WHERE lower(trim(email)) = lower(trim($1))
     LIMIT 1`,
    [email],
  );
  if (byEmail[0]?.id) {
    const { rows } = await query(
      `UPDATE jewelheart_volunteers
       SET display_name = $2,
           phone = COALESCE($3, phone),
           updated_at = now()
       WHERE id = $1
       RETURNING id, display_name, email, phone, firebase_uid`,
      [byEmail[0].id, displayName, phone],
    );
    return rows[0];
  }
  const { rows } = await query(
    `INSERT INTO jewelheart_volunteers (display_name, email, phone)
     VALUES ($1, $2, $3)
     RETURNING id, display_name, email, phone, firebase_uid`,
    [displayName, email, phone],
  );
  return rows[0];
}

const starterIds = [];
for (const s of STARTERS) {
  const row = await upsertStarter(s);
  starterIds.push(row.id);
  await query(
    `INSERT INTO jewelheart_retreat_volunteers (retreat_id, volunteer_id)
     VALUES ($1, $2)
     ON CONFLICT (retreat_id, volunteer_id) DO NOTHING`,
    [RETREAT_ID, row.id],
  );
}

const removed = await query(
  `DELETE FROM jewelheart_retreat_volunteers rv
   WHERE rv.retreat_id = $1
     AND NOT (rv.volunteer_id = ANY($2::uuid[]))
   RETURNING rv.volunteer_id`,
  [RETREAT_ID, starterIds],
);

const roster = await query(
  `SELECT v.display_name, v.email, v.firebase_uid IS NOT NULL AS linked
   FROM jewelheart_volunteers v
   JOIN jewelheart_retreat_volunteers rv ON rv.volunteer_id = v.id
   WHERE rv.retreat_id = $1
   ORDER BY v.display_name`,
  [RETREAT_ID],
);

console.log(JSON.stringify({
  ok: true,
  retreatId: RETREAT_ID,
  starterIds,
  removedRetreatLinks: removed.rowCount,
  roster: roster.rows,
}, null, 2));
