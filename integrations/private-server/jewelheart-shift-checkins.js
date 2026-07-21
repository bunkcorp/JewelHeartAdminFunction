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
               WHERE c.assignment_id = a.id AND c.finished_at IS NOT NULL) AS "checkinCount"
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
               WHERE c.assignment_id = a.id AND c.finished_at IS NOT NULL) AS "checkinCount"
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
export async function volunteerApplyCheckinOpDb(assignment, todayIso, op, options = {}) {
  if (!assignment?.assignmentId || !op) return { ok: false, error: 'missing' };
  const performedByVolunteerId = options.performedByVolunteerId || null;
  const dayIso = String(assignment.dayIso || '');
  if (op === 'start') {
    if (dayIso !== todayIso) return { ok: false, error: 'not_today' };
    try {
      const open = await query(
        `SELECT id FROM jewelheart_shift_checkins
         WHERE assignment_id = $1 AND finished_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1`,
        [assignment.assignmentId],
      );
      if (open.rows[0]) return { ok: true, alreadyOpen: true };
      await query(
        `INSERT INTO jewelheart_shift_checkins (assignment_id, started_at, performed_by_volunteer_id)
         VALUES ($1, now(), $2)`,
        [assignment.assignmentId, performedByVolunteerId],
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
    return volunteerClearAssignmentCheckinsDb(assignment);
  }
  return { ok: false, error: 'unknown_op' };
}

/**
 * Done on check-in screen: drop incomplete sessions created during this visit.
 * Keeps completed rows (including new Start+End pairs) and baseline rows that were
 * already finished when the screen opened.
 */
/** Parse "h:mm AM/PM" to minutes since midnight, or null if invalid. */
export function volunteerClockLabelMinutes(label) {
  const m = String(label || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 1 || h > 12 || min < 0 || min > 59) return null;
  const pm = m[3].toUpperCase() === 'PM';
  if (h === 12) h = pm ? 12 : 0;
  else if (pm) h += 12;
  return h * 60 + min;
}

/** @returns {{ ok: boolean, error?: string }} */
export function volunteerValidateClockPairLabels(startLabel, finishLabel) {
  const startMin = volunteerClockLabelMinutes(startLabel);
  const endMin = volunteerClockLabelMinutes(finishLabel);
  if (startMin == null || endMin == null) {
    return { ok: false, error: 'Enter times as h:mm AM or PM.' };
  }
  if (endMin <= startMin) {
    return { ok: false, error: 'End time must be after start time.' };
  }
  if (endMin - startMin > 60) {
    return { ok: false, error: 'Start and end must be within one hour.' };
  }
  return { ok: true };
}

function volunteerClockLabelToPgTime(label) {
  const mins = volunteerClockLabelMinutes(label);
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/**
 * Done with manually entered clock times (today only). Replaces open sessions from this visit.
 */
export async function volunteerApplyManualCheckinDoneDb(
  assignment,
  todayIso,
  startLabel,
  finishLabel,
  baselineIds = [],
  timeZone = 'America/New_York',
  performedByVolunteerId = null,
) {
  if (!assignment?.assignmentId) return { ok: false, error: 'missing' };
  const dayIso = String(assignment.dayIso || '');
  if (dayIso !== todayIso) return { ok: false, error: 'not_today' };
  const valid = volunteerValidateClockPairLabels(startLabel, finishLabel);
  if (!valid.ok) return { ok: false, error: valid.error };
  const startTime = volunteerClockLabelToPgTime(startLabel);
  const finishTime = volunteerClockLabelToPgTime(finishLabel);
  if (!startTime || !finishTime) return { ok: false, error: 'invalid_time' };
  const base = (baselineIds || []).map(String).filter(Boolean);
  try {
    if (!base.length) {
      await query(
        `DELETE FROM jewelheart_shift_checkins
         WHERE assignment_id = $1 AND finished_at IS NULL`,
        [assignment.assignmentId],
      );
    } else {
      await query(
        `DELETE FROM jewelheart_shift_checkins
         WHERE assignment_id = $1
           AND finished_at IS NULL
           AND NOT (id = ANY($2::uuid[]))`,
        [assignment.assignmentId, base],
      );
    }
    await query(
      `INSERT INTO jewelheart_shift_checkins (assignment_id, started_at, finished_at, performed_by_volunteer_id)
       VALUES (
         $1,
         ($2::date + $3::time) AT TIME ZONE $4,
         ($2::date + $5::time) AT TIME ZONE $4,
         $6
       )`,
      [assignment.assignmentId, dayIso, startTime, timeZone, finishTime, performedByVolunteerId],
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'manual_done_failed' };
  }
}

export async function volunteerCheckinDoneDb(assignment, baselineIds = []) {
  if (!assignment?.assignmentId) return { ok: false, error: 'missing' };
  const base = (baselineIds || []).map(String).filter(Boolean);
  try {
    if (!base.length) {
      await query(
        `DELETE FROM jewelheart_shift_checkins
         WHERE assignment_id = $1 AND finished_at IS NULL`,
        [assignment.assignmentId],
      );
    } else {
      await query(
        `DELETE FROM jewelheart_shift_checkins
         WHERE assignment_id = $1
           AND finished_at IS NULL
           AND NOT (id = ANY($2::uuid[]))`,
        [assignment.assignmentId, base],
      );
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'done_failed' };
  }
}

/** Remove all check-in rows for an assignment (Undo on check-in screen). */
export async function volunteerClearAssignmentCheckinsDb(assignment) {
  if (!assignment?.assignmentId) return { ok: false, error: 'missing' };
  try {
    await query(
      `DELETE FROM jewelheart_shift_checkins WHERE assignment_id = $1`,
      [assignment.assignmentId],
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'clear_failed' };
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
               WHERE c2.assignment_id = a.id AND c2.finished_at IS NOT NULL) AS "checkinCount",
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
