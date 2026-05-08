/**
 * Paste into: private-server/src/jewelheart/service.js
 *
 * Replace your existing `taskRowWithMeta` and `listTasks` definitions with the
 * two functions below (keep names `taskRowWithMeta` / `listTasks` unchanged).
 *
 * Requires: query, assertUuid, acl.assertRetreatReadAccess, m.mapTaskRow
 * (same dependencies as the originals).
 */

async function taskRowWithMeta(retreatId, taskId) {
  const { rows } = await query(
    `SELECT t.*, j.volunteers_needed, j.title AS job_title, s.label AS slot_label,
      s.activity_context AS slot_activity_context,
      (SELECT COUNT(*)::int FROM jewelheart_assignments a WHERE a.task_id = t.id) AS assignment_count
     FROM jewelheart_tasks t
     JOIN jewelheart_jobs j ON j.id = t.job_id
     JOIN jewelheart_slots s ON s.id = t.slot_id AND s.retreat_id = t.retreat_id
     WHERE t.id = $1 AND t.retreat_id = $2`,
    [taskId, retreatId]
  );
  return rows[0] || null;
}

export async function listTasks(firebaseUid, retreatId, opts, authToken = undefined) {
  assertUuid(retreatId, 'retreatId');
  await acl.assertRetreatReadAccess(firebaseUid, retreatId, authToken);
  const { slotId, unassignedOnly, underassignedOnly } = opts;
  let sql = `SELECT t.*, j.volunteers_needed, j.title AS job_title, s.label AS slot_label,
    s.activity_context AS slot_activity_context,
    (SELECT COUNT(*)::int FROM jewelheart_assignments a WHERE a.task_id = t.id) AS assignment_count
    FROM jewelheart_tasks t
    JOIN jewelheart_jobs j ON j.id = t.job_id
    JOIN jewelheart_slots s ON s.id = t.slot_id AND s.retreat_id = t.retreat_id
    WHERE t.retreat_id = $1`;
  const params = [retreatId];
  let p = 2;
  if (slotId) {
    assertUuid(slotId, 'slotId');
    sql += ` AND t.slot_id = $${p++}`;
    params.push(slotId);
  }
  if (unassignedOnly) {
    sql += ' AND (SELECT COUNT(*) FROM jewelheart_assignments a WHERE a.task_id = t.id) = 0';
  }
  if (underassignedOnly) {
    sql +=
      ' AND (SELECT COUNT(*) FROM jewelheart_assignments a WHERE a.task_id = t.id) < j.volunteers_needed';
  }
  sql += ' ORDER BY t.created_at ASC';
  const { rows } = await query(sql, params);
  return { items: rows.map(m.mapTaskRow) };
}
