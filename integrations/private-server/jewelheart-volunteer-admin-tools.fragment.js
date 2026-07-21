/**
 * Admin-only retreat tools: roster Admin/Manage flags + clear assignments.
 *
 * Routes (after requireAuthDual):
 *   GET  /retreats/:retreatId/volunteers/:volunteerId/privileges
 *   PUT  /retreats/:retreatId/volunteers/:volunteerId/privileges
 *   GET  /retreats/:retreatId/admin/assignments-summary
 *   POST /retreats/:retreatId/admin/clear-assignments
 *   POST /retreats/:retreatId/admin/reload-poster-data
 */

import { HttpError } from './errors.js';
import * as acl from './acl.js';
import { assertUuid } from './service.js';
import { reloadPosterData, getPosterDataStatus } from './jewelheart-poster-data.js';

async function assertGlobalAdmin(query, firebaseUid) {
  const uid = String(firebaseUid || '').trim();
  if (!uid) throw new HttpError(401, 'Sign in required');
  const admin = await query('SELECT 1 FROM jewelheart_admins WHERE firebase_uid = $1 LIMIT 1', [uid]);
  if (admin.rows[0]) return;
  throw new HttpError(403, 'Admin access required.');
}

async function assertAdminOrManager(query, firebaseUid) {
  const uid = String(firebaseUid || '').trim();
  if (!uid) throw new HttpError(401, 'Sign in required');
  const admin = await query('SELECT 1 FROM jewelheart_admins WHERE firebase_uid = $1 LIMIT 1', [uid]);
  if (admin.rows[0]) return;
  const mgr = await query('SELECT 1 FROM jewelheart_managers WHERE firebase_uid = $1 LIMIT 1', [uid]);
  if (mgr.rows[0]) return;
  throw new HttpError(403, 'Manager or admin access required.');
}

async function ensureVolunteerOnRetreat(query, retreatId, volunteerId) {
  const linked = await query(
    `SELECT 1 FROM jewelheart_retreat_volunteers WHERE retreat_id = $1 AND volunteer_id = $2 LIMIT 1`,
    [retreatId, volunteerId],
  );
  if (!linked.rows[0]) {
    throw new HttpError(404, 'Volunteer is not on this retreat roster.');
  }
}

async function loadVolunteerPrivilegeRow(query, retreatId, volunteerId) {
  assertUuid(retreatId, 'retreatId');
  assertUuid(volunteerId, 'volunteerId');
  await ensureVolunteerOnRetreat(query, retreatId, volunteerId);
  const { rows } = await query(
    `SELECT v.id,
            v.display_name AS "displayName",
            v.email,
            v.firebase_uid AS "firebaseUid",
            v.roster_admin AS "rosterAdmin",
            v.roster_manage AS "rosterManage"
     FROM jewelheart_volunteers v
     WHERE v.id = $1
     LIMIT 1`,
    [volunteerId],
  );
  if (!rows[0]) throw new HttpError(404, 'Volunteer not found');
  return rows[0];
}

/** Keep jewelheart_admins / jewelheart_managers in sync with roster flags for a linked uid. */
export async function syncVolunteerAclFromRosterFlags(query, volunteer) {
  const uid = String(volunteer?.firebaseUid || '').trim();
  const rosterAdmin = volunteer?.rosterAdmin === true;
  const rosterManage = volunteer?.rosterManage === true;
  let adminAcl = false;
  let manageAcl = false;

  if (uid) {
    if (rosterAdmin) {
      await query(
        `INSERT INTO jewelheart_admins (firebase_uid) VALUES ($1)
         ON CONFLICT (firebase_uid) DO NOTHING`,
        [uid],
      );
      adminAcl = true;
    } else {
      await query(`DELETE FROM jewelheart_admins WHERE firebase_uid = $1`, [uid]);
    }
    if (rosterManage) {
      await query(
        `INSERT INTO jewelheart_managers (firebase_uid) VALUES ($1)
         ON CONFLICT (firebase_uid) DO NOTHING`,
        [uid],
      );
      manageAcl = true;
    } else {
      await query(`DELETE FROM jewelheart_managers WHERE firebase_uid = $1`, [uid]);
    }
  }

  return {
    rosterAdmin,
    rosterManage,
    adminAcl: rosterAdmin && Boolean(uid),
    manageAcl: rosterManage && Boolean(uid),
    linked: Boolean(uid),
  };
}

export async function getVolunteerPrivileges(query, retreatId, volunteerId) {
  const row = await loadVolunteerPrivilegeRow(query, retreatId, volunteerId);
  const uid = String(row.firebaseUid || '').trim();
  let adminAcl = false;
  let manageAcl = false;
  if (uid) {
    const admin = await query('SELECT 1 FROM jewelheart_admins WHERE firebase_uid = $1 LIMIT 1', [uid]);
    adminAcl = Boolean(admin.rows[0]);
    const mgr = await query('SELECT 1 FROM jewelheart_managers WHERE firebase_uid = $1 LIMIT 1', [uid]);
    manageAcl = Boolean(mgr.rows[0]);
  }
  return {
    volunteerId: row.id,
    displayName: row.displayName,
    email: row.email || '',
    firebaseUid: row.firebaseUid || null,
    rosterAdmin: row.rosterAdmin === true,
    rosterManage: row.rosterManage === true,
    adminAcl,
    manageAcl,
    linked: Boolean(uid),
  };
}

export async function setVolunteerPrivileges(query, retreatId, volunteerId, body) {
  const row = await loadVolunteerPrivilegeRow(query, retreatId, volunteerId);
  const hasAdmin = Object.prototype.hasOwnProperty.call(body || {}, 'admin');
  const hasManage = Object.prototype.hasOwnProperty.call(body || {}, 'manage');
  if (!hasAdmin && !hasManage) {
    throw new HttpError(400, 'Specify admin and/or manage.');
  }

  const rosterAdmin = hasAdmin ? body.admin === true : row.rosterAdmin === true;
  const rosterManage = hasManage ? body.manage === true : row.rosterManage === true;

  const { rows } = await query(
    `UPDATE jewelheart_volunteers
     SET roster_admin = $2,
         roster_manage = $3,
         updated_at = now()
     WHERE id = $1
     RETURNING id,
               display_name AS "displayName",
               email,
               firebase_uid AS "firebaseUid",
               roster_admin AS "rosterAdmin",
               roster_manage AS "rosterManage"`,
    [volunteerId, rosterAdmin, rosterManage],
  );
  const updated = rows[0];
  const synced = await syncVolunteerAclFromRosterFlags(query, updated);
  return {
    volunteerId: updated.id,
    displayName: updated.displayName,
    email: updated.email || '',
    firebaseUid: updated.firebaseUid || null,
    ...synced,
  };
}

export async function countRetreatAssignments(query, retreatId) {
  assertUuid(retreatId, 'retreatId');
  const { rows } = await query(
    `SELECT count(*)::int AS n
     FROM jewelheart_assignments a
     JOIN jewelheart_tasks t ON t.id = a.task_id
     WHERE t.retreat_id = $1`,
    [retreatId],
  );
  const assignments = rows[0]?.n ?? 0;
  const { rows: checkinRows } = await query(
    `SELECT count(*)::int AS n
     FROM jewelheart_shift_checkins c
     JOIN jewelheart_assignments a ON a.id = c.assignment_id
     JOIN jewelheart_tasks t ON t.id = a.task_id
     WHERE t.retreat_id = $1`,
    [retreatId],
  );
  return { assignments, checkins: checkinRows[0]?.n ?? 0 };
}

export async function clearRetreatAssignments(query, retreatId) {
  assertUuid(retreatId, 'retreatId');
  const before = await countRetreatAssignments(query, retreatId);
  const del = await query(
    `DELETE FROM jewelheart_assignments a
     USING jewelheart_tasks t
     WHERE a.task_id = t.id AND t.retreat_id = $1`,
    [retreatId],
  );
  const after = await countRetreatAssignments(query, retreatId);
  return {
    deletedAssignments: del.rowCount ?? 0,
    before,
    after,
  };
}

export function formatPrivilegeStatusLines(status) {
  const lines = [];
  lines.push(`${status.displayName}`);
  if (status.email) lines.push(`Email: ${status.email}`);
  lines.push(status.linked ? 'Sign-in: linked' : 'Sign-in: not linked (ACL applies after they link)');
  lines.push(`Roster Admin flag: ${status.rosterAdmin ? 'ON' : 'off'}`);
  lines.push(`Roster Manage flag: ${status.rosterManage ? 'ON' : 'off'}`);
  if (status.linked) {
    lines.push(`Live Admin access: ${status.adminAcl ? 'yes' : 'no'}`);
    lines.push(`Live Manage access: ${status.manageAcl ? 'yes' : 'no'}`);
  }
  return lines;
}

export function createJewelHeartVolunteerAdminToolsHandlers({ query }) {
  return {
    async getPrivileges(req, res) {
      try {
        await assertGlobalAdmin(query, req.uid);
        const retreatId = req.params.retreatId;
        const volunteerId = req.params.volunteerId;
        await acl.assertRetreatReadAccess(req.uid, retreatId, req.authToken);
        const status = await getVolunteerPrivileges(query, retreatId, volunteerId);
        res.status(200).json({
          ok: true,
          status,
          lines: formatPrivilegeStatusLines(status),
        });
      } catch (e) {
        const code = e instanceof HttpError ? e.status : 500;
        if (code >= 500) console.error('admin privileges get', e);
        res.status(code).json({ error: e.message || 'Server error' });
      }
    },

    async putPrivileges(req, res) {
      try {
        await assertGlobalAdmin(query, req.uid);
        const retreatId = req.params.retreatId;
        const volunteerId = req.params.volunteerId;
        await acl.assertRetreatReadAccess(req.uid, retreatId, req.authToken);
        const status = await setVolunteerPrivileges(query, retreatId, volunteerId, req.body || {});
        res.status(200).json({
          ok: true,
          status,
          lines: formatPrivilegeStatusLines(status),
          message: `Updated privileges for ${status.displayName}.`,
        });
      } catch (e) {
        const code = e instanceof HttpError ? e.status : 500;
        if (code >= 500) console.error('admin privileges put', e);
        res.status(code).json({ error: e.message || 'Server error' });
      }
    },

    async getAssignmentsSummary(req, res) {
      try {
        await assertGlobalAdmin(query, req.uid);
        const retreatId = req.params.retreatId;
        await acl.assertRetreatReadAccess(req.uid, retreatId, req.authToken);
        const counts = await countRetreatAssignments(query, retreatId);
        res.status(200).json({ ok: true, ...counts });
      } catch (e) {
        const code = e instanceof HttpError ? e.status : 500;
        if (code >= 500) console.error('admin assignments summary', e);
        res.status(code).json({ error: e.message || 'Server error' });
      }
    },

    async postClearAssignments(req, res) {
      try {
        await assertGlobalAdmin(query, req.uid);
        const retreatId = req.params.retreatId;
        await acl.assertRetreatReadAccess(req.uid, retreatId, req.authToken);
        const confirm = String(req.body?.confirm || '').trim();
        if (confirm !== 'CLEAR') {
          throw new HttpError(400, 'Confirmation token missing. Tap confirm again.');
        }
        const out = await clearRetreatAssignments(query, retreatId);
        res.status(200).json({
          ok: true,
          message: `Cleared ${out.deletedAssignments} assignment(s) (${out.before.checkins} check-in row(s) removed).`,
          ...out,
        });
      } catch (e) {
        const code = e instanceof HttpError ? e.status : 500;
        if (code >= 500) console.error('admin clear assignments', e);
        res.status(code).json({ error: e.message || 'Server error' });
      }
    },

    async postReloadPosterData(req, res) {
      try {
        await assertAdminOrManager(query, req.uid);
        const retreatId = req.params.retreatId;
        await acl.assertRetreatReadAccess(req.uid, retreatId, req.authToken);
        const result = await reloadPosterData();
        const status = getPosterDataStatus();
        const warnNote = result.warnings?.length ? ` (${result.warnings.length} warning(s))` : '';
        res.status(200).json({
          ok: true,
          message: `Reloaded ${result.jobs.length} jobs and ${result.instructionsCount} instruction set(s)${warnNote}.`,
          ...result,
          status,
        });
      } catch (e) {
        const code = e instanceof HttpError ? e.status : 500;
        if (code >= 500) console.error('admin reload poster data', e);
        res.status(code).json({ error: e.message || 'Server error' });
      }
    },
  };
}
