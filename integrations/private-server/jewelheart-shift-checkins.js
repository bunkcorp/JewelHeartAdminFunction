/**
 * Persisted shift check-ins (jewelheart_shift_checkins + jobs.checkins_required).
 */
import { query } from '../db.js';

function volunteerShiftCheckinsRequiredFromJob(jobTitle, dbValue) {
  if (dbValue != null && Number(dbValue) >= 1) return Number(dbValue);
  const t = String(jobTitle || '').toLowerCase();
  if (t.includes('urinal')) return 2;
  return 1;
}

export function volunteerShiftIsFulfilled(shift) {
  const need = shift?.checkinsRequired ?? 1;
  const have = shift?.checkinCount ?? 0;
  return have >= need;
}

/** Enrich shift rows with assignmentId, checkinCount, checkinsRequired. */
export async function volunteerEnrichShiftsWithCheckins(volunteerId, shifts) {
  if (!volunteerId || !shifts?.length) return shifts || [];
  const taskIds = [...new Set(shifts.map((s) => s.taskId).filter(Boolean))];
  if (!taskIds.length) return shifts;

  try {
    const { rows } = await query(
      `SELECT a.id AS "assignmentId",
              a.task_id AS "taskId",
              COALESCE(j.checkins_required, 1) AS "checkinsRequired",
              j.title AS "jobTitle",
              (SELECT COUNT(*)::int
               FROM jewelheart_shift_checkins c
               WHERE c.assignment_id = a.id) AS "checkinCount"
       FROM jewelheart_assignments a
       JOIN jewelheart_tasks t ON t.id = a.task_id
       JOIN jewelheart_jobs j ON j.id = t.job_id
       WHERE a.volunteer_id = $1
         AND a.task_id = ANY($2::uuid[])`,
      [volunteerId, taskIds],
    );
    const byTask = new Map(rows.map((r) => [String(r.taskId), r]));
    return shifts.map((s) => {
      const row = byTask.get(String(s.taskId));
      if (!row) {
        return {
          ...s,
          assignmentId: s.assignmentId || '',
          checkinCount: 0,
          checkinsRequired: volunteerShiftCheckinsRequiredFromJob(s.jobTitle, null),
          fulfilled: false,
        };
      }
      const checkinsRequired = volunteerShiftCheckinsRequiredFromJob(
        row.jobTitle || s.jobTitle,
        row.checkinsRequired,
      );
      const checkinCount = row.checkinCount ?? 0;
      return {
        ...s,
        assignmentId: String(row.assignmentId),
        checkinCount,
        checkinsRequired,
        fulfilled: checkinCount >= checkinsRequired,
      };
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[jewelheart.checkins] enrich failed — using defaults', err?.message || err);
    }
    return shifts.map((s) => ({
      ...s,
      checkinCount: 0,
      checkinsRequired: volunteerShiftCheckinsRequiredFromJob(s.jobTitle, null),
      fulfilled: false,
    }));
  }
}

export async function volunteerResolveAssignment(volunteerId, taskId) {
  if (!volunteerId || !taskId) return null;
  try {
    const { rows } = await query(
      `SELECT a.id AS "assignmentId",
              a.task_id AS "taskId",
              a.volunteer_id AS "volunteerId",
              t.job_id AS "jobId",
              s.slot_date AS "dayIso",
              j.title AS "jobTitle",
              COALESCE(j.checkins_required, 1) AS "checkinsRequired",
              (SELECT COUNT(*)::int
               FROM jewelheart_shift_checkins c
               WHERE c.assignment_id = a.id) AS "checkinCount"
       FROM jewelheart_assignments a
       JOIN jewelheart_tasks t ON t.id = a.task_id
       JOIN jewelheart_slots s ON s.id = t.slot_id
       JOIN jewelheart_jobs j ON j.id = t.job_id
       WHERE a.volunteer_id = $1 AND a.task_id = $2
       LIMIT 1`,
      [volunteerId, taskId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    const checkinsRequired = volunteerShiftCheckinsRequiredFromJob(r.jobTitle, r.checkinsRequired);
    const checkinCount = r.checkinCount ?? 0;
    return {
      ...r,
      assignmentId: String(r.assignmentId),
      taskId: String(r.taskId),
      jobId: String(r.jobId),
      dayIso: String(r.dayIso),
      checkinsRequired,
      checkinCount,
      fulfilled: checkinCount >= checkinsRequired,
    };
  } catch {
    return null;
  }
}

export async function volunteerLoadCheckinRows(assignmentId) {
  if (!assignmentId) return [];
  try {
    const { rows } = await query(
      `SELECT id, started_at AS "startedAt", finished_at AS "finishedAt"
       FROM jewelheart_shift_checkins
       WHERE assignment_id = $1
       ORDER BY started_at ASC`,
      [assignmentId],
    );
    return rows;
  } catch {
    return [];
  }
}

/**
 * Apply start/finish for an assignment. Start only allowed when dayIso === todayIso.
 * @returns {{ ok: boolean, error?: string }}
 */
export async function volunteerApplyCheckinOpDb(assignment, todayIso, op) {
  if (!assignment?.assignmentId || !op) return { ok: false, error: 'missing' };
  const dayIso = String(assignment.dayIso || '');
  if (op === 'start') {
    if (dayIso !== todayIso) return { ok: false, error: 'not_today' };
    try {
      await query(
        `INSERT INTO jewelheart_shift_checkins (assignment_id, started_at)
         VALUES ($1, now())`,
        [assignment.assignmentId],
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'start_failed' };
    }
  }
  if (op === 'finish') {
    try {
      const { rowCount } = await query(
        `UPDATE jewelheart_shift_checkins
         SET finished_at = now()
         WHERE id = (
           SELECT id FROM jewelheart_shift_checkins
           WHERE assignment_id = $1 AND finished_at IS NULL
           ORDER BY started_at DESC
           LIMIT 1
         )`,
        [assignment.assignmentId],
      );
      return { ok: rowCount > 0 };
    } catch (err) {
      return { ok: false, error: err?.message || 'finish_failed' };
    }
  }
  if (op === 'undo') {
    return volunteerUndoLastCheckinDb(assignment);
  }
  return { ok: false, error: 'unknown_op' };
}

/** Remove the most recent check-in row for an assignment (Undo on check-in screen). */
export async function volunteerUndoLastCheckinDb(assignment) {
  if (!assignment?.assignmentId) return { ok: false, error: 'missing' };
  try {
    const { rowCount } = await query(
      `DELETE FROM jewelheart_shift_checkins
       WHERE id = (
         SELECT id FROM jewelheart_shift_checkins
         WHERE assignment_id = $1
         ORDER BY started_at DESC
         LIMIT 1
       )`,
      [assignment.assignmentId],
    );
    return { ok: rowCount > 0 };
  } catch (err) {
    return { ok: false, error: err?.message || 'undo_failed' };
  }
}

function volunteerNormalizeDayIso(iso) {
  if (!iso) return '';
  if (iso instanceof Date) return iso.toISOString().slice(0, 10);
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

/** Recent check-ins for a retreat (manager view). */
export async function volunteerListRetreatCheckins(retreatId, limit = 40) {
  if (!retreatId) return [];
  try {
    const { rows } = await query(
      `SELECT v.display_name AS "volunteerName",
              j.title AS "jobTitle",
              s.slot_date AS "dayIso",
              c.started_at AS "startedAt",
              c.finished_at AS "finishedAt",
              (SELECT COUNT(*)::int
               FROM jewelheart_shift_checkins c2
               WHERE c2.assignment_id = a.id) AS "checkinCount",
              COALESCE(j.checkins_required, 1) AS "checkinsRequired"
       FROM jewelheart_shift_checkins c
       JOIN jewelheart_assignments a ON a.id = c.assignment_id
       JOIN jewelheart_volunteers v ON v.id = a.volunteer_id
       JOIN jewelheart_tasks t ON t.id = a.task_id
       JOIN jewelheart_jobs j ON j.id = t.job_id
       JOIN jewelheart_slots s ON s.id = t.slot_id
       WHERE t.retreat_id = $1
       ORDER BY c.started_at DESC
       LIMIT $2`,
      [retreatId, limit],
    );
    return rows.map((r) => ({
      ...r,
      dayIso: volunteerNormalizeDayIso(r.dayIso),
    }));
  } catch {
    return [];
  }
}
