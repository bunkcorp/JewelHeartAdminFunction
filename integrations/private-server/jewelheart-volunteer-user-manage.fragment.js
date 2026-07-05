/**
 * Manager/admin volunteer access tools — status, unlink, reset onboarding.
 *
 * Routes (after requireAuthDual):
 *   GET  /retreats/:retreatId/volunteers/:volunteerId/user-access
 *   POST /retreats/:retreatId/volunteers/:volunteerId/unlink-auth
 *   POST /retreats/:retreatId/volunteers/:volunteerId/reset-onboarding
 */

import { HttpError } from './errors.js';
import * as acl from './acl.js';
import { assertUuid } from './service.js';
import { normalizeEmail } from './jewelheart-auth-identity.js';
import { loadVolunteerRow } from './jewelheart-volunteer-invite.js';
import { resetVolunteerOnboarding } from './jewelheart-volunteer-onboarding.js';

async function assertManagerOrAdmin(query, firebaseUid) {
  const uid = String(firebaseUid || '').trim();
  if (!uid) throw new HttpError(401, 'Sign in required');
  const admin = await query('SELECT 1 FROM jewelheart_admins WHERE firebase_uid = $1 LIMIT 1', [uid]);
  if (admin.rows[0]) return;
  const mgr = await query('SELECT 1 FROM jewelheart_managers WHERE firebase_uid = $1 LIMIT 1', [uid]);
  if (mgr.rows[0]) return;
  throw new HttpError(403, 'Manager access required.');
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

export async function getVolunteerUserAccessStatus(query, retreatId, volunteerId) {
  assertUuid(retreatId, 'retreatId');
  assertUuid(volunteerId, 'volunteerId');
  await ensureVolunteerOnRetreat(query, retreatId, volunteerId);

  const volunteer = await loadVolunteerRow(query, volunteerId);
  if (!volunteer) throw new HttpError(404, 'Volunteer not found');

  const linked = Boolean(volunteer.firebaseUid);
  const profileConfirmedAt = volunteer.profileConfirmedAt || null;
  return {
    volunteerId: volunteer.id,
    displayName: volunteer.displayName,
    email: volunteer.email || '',
    phone: volunteer.phone || '',
    linked,
    profileConfirmed: Boolean(profileConfirmedAt),
    profileConfirmedAt,
    hasEmail: Boolean(normalizeEmail(volunteer.email)),
    hasPhone: Boolean(String(volunteer.phone || '').replace(/\D/g, '')),
  };
}

export function formatVolunteerUserAccessStatusLines(status) {
  const lines = [];
  lines.push(`${status.displayName}`);
  if (status.email) lines.push(`Email: ${status.email}`);
  if (status.phone) lines.push(`Phone: ${status.phone}`);
  lines.push(status.linked ? 'Sign-in: linked' : 'Sign-in: not linked');
  if (status.profileConfirmed && status.profileConfirmedAt) {
    const when = new Date(status.profileConfirmedAt).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    lines.push(`Onboarding: completed ${when} Eastern`);
  } else {
    lines.push('Onboarding: not completed yet');
  }
  return lines;
}

export async function unlinkVolunteerAuth(query, volunteerId) {
  assertUuid(volunteerId, 'volunteerId');
  const { rows } = await query(
    `UPDATE jewelheart_volunteers
     SET firebase_uid = NULL, updated_at = now()
     WHERE id = $1
     RETURNING id, display_name AS "displayName", email, phone`,
    [volunteerId],
  );
  if (!rows[0]) throw new HttpError(404, 'Volunteer not found');
  return rows[0];
}

export function createJewelHeartVolunteerUserManageHandlers({ query }) {
  return {
    async getUserAccess(req, res) {
      try {
        await assertManagerOrAdmin(query, req.uid);
        const retreatId = req.params.retreatId;
        const volunteerId = req.params.volunteerId;
        assertUuid(retreatId, 'retreatId');
        assertUuid(volunteerId, 'volunteerId');
        await acl.assertRetreatReadAccess(req.uid, retreatId, req.authToken);
        const status = await getVolunteerUserAccessStatus(query, retreatId, volunteerId);
        res.status(200).json({ ok: true, status, lines: formatVolunteerUserAccessStatusLines(status) });
      } catch (e) {
        const code = e instanceof HttpError ? e.status : 500;
        if (code >= 500) console.error('user access status', e);
        res.status(code).json({ error: e.message || 'Server error' });
      }
    },

    async postUnlinkAuth(req, res) {
      try {
        await assertManagerOrAdmin(query, req.uid);
        const retreatId = req.params.retreatId;
        const volunteerId = req.params.volunteerId;
        assertUuid(retreatId, 'retreatId');
        assertUuid(volunteerId, 'volunteerId');
        await acl.assertRetreatReadAccess(req.uid, retreatId, req.authToken);
        await ensureVolunteerOnRetreat(query, retreatId, volunteerId);
        const row = await unlinkVolunteerAuth(query, volunteerId);
        res.status(200).json({
          ok: true,
          displayName: row.displayName,
          message: `${row.displayName} is unlinked. Profile is kept; they can sign in again and re-onboard if needed.`,
        });
      } catch (e) {
        const code = e instanceof HttpError ? e.status : 500;
        if (code >= 500) console.error('unlink volunteer auth', e);
        res.status(code).json({ error: e.message || 'Server error' });
      }
    },

    async postResetOnboarding(req, res) {
      try {
        await assertManagerOrAdmin(query, req.uid);
        const retreatId = req.params.retreatId;
        const volunteerId = req.params.volunteerId;
        assertUuid(retreatId, 'retreatId');
        assertUuid(volunteerId, 'volunteerId');
        await acl.assertRetreatReadAccess(req.uid, retreatId, req.authToken);
        await ensureVolunteerOnRetreat(query, retreatId, volunteerId);
        const row = await resetVolunteerOnboarding(query, volunteerId);
        res.status(200).json({
          ok: true,
          displayName: row.displayName,
          message: `${row.displayName} must complete onboarding again on next sign-in.`,
        });
      } catch (e) {
        const code = e instanceof HttpError ? e.status : 500;
        if (code >= 500) console.error('reset onboarding', e);
        res.status(code).json({ error: e.message || 'Server error' });
      }
    },

    /** @deprecated invites removed — keep route so older jewelheart.js patches still load */
    async postInviteEmail(_req, res) {
      res.status(410).json({
        error: 'gone',
        message: 'Personal invites are no longer used. Share the volunteer login URL instead.',
      });
    },
  };
}
