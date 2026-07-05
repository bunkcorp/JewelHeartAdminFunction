/**
 * JewelHeart — volunteer invite tokens + roster allowlist (v1)
 * ============================================================
 *
 * Flow:
 *   1. Admin mints invite for (retreatId, volunteerId) → QR URL with ?invite=TOKEN
 *   2. Volunteer signs in (Google / Keycloak / Firebase phone / email)
 *   3. POST /jewelheart/invites/redeem { inviteToken } — invite valid AND auth matches roster
 *   4. Links auth uid → jewelheart_volunteers.firebase_uid; applies roster_admin / roster_manage
 *   5. SDUI (uiChannel=testers) calls assertVolunteerRosterAccess on each screen
 *
 * Env:
 *   JEWELHEART_INVITE_TTL_HOURS     default 72
 *   JEWELHEART_VOLUNTEER_LOGIN_URL  default https://karmadots.org/testerslogin/
 *   JEWELHEART_ORGANIZER_CONTACT    shown in 403 copy
 *
 *   router.get('/invites/:token/preview', …)  — before requireAuthDual
 *   router.post('/invites/redeem', …)         — after requireAuthDual
 *   router.get('/volunteer/session', …)
 *   router.post('/retreats/:retreatId/volunteers/:volunteerId/invite', …)
 */

import crypto from 'crypto';
import { HttpError } from './errors.js';
import * as acl from './acl.js';
import { assertUuid } from './service.js';
import {
  identityFromAuthToken,
  normalizeEmail,
  normalizePhoneE164,
  phoneDigitsLast10,
  organizerContactMessage,
  rosterIdentityMatches,
  volunteerHasSelfServiceContact,
} from './jewelheart-auth-identity.js';
import { ensureVolunteerLinkedForAuth } from './jewelheart-volunteer-onboarding.js';

function inviteTtlHours() {
  const n = parseInt(process.env.JEWELHEART_INVITE_TTL_HOURS || '72', 10);
  return Number.isFinite(n) && n > 0 ? n : 72;
}

function volunteerLoginBaseUrl() {
  const u = String(process.env.JEWELHEART_VOLUNTEER_LOGIN_URL || 'https://karmadots.org/testerslogin/').trim();
  // .html pages must not get a trailing slash — /login/volunteer.html/ misses static and 401s.
  if (/\.html$/i.test(u.replace(/\/+$/, ''))) {
    return u.replace(/\/+$/, '');
  }
  return u.endsWith('/') ? u : `${u}/`;
}

function hashInviteToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || ''), 'utf8').digest('hex');
}

function generateInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function isGlobalAdmin(query, uid) {
  const { rows } = await query('SELECT 1 FROM jewelheart_admins WHERE firebase_uid = $1 LIMIT 1', [uid]);
  return Boolean(rows[0]);
}

async function loadVolunteerRow(query, volunteerId) {
  const { rows } = await query(
    `SELECT id,
            display_name AS "displayName",
            email,
            phone,
            firebase_uid AS "firebaseUid",
            roster_admin AS "rosterAdmin",
            roster_manage AS "rosterManage",
            profile_confirmed_at AS "profileConfirmedAt"
     FROM jewelheart_volunteers
     WHERE id = $1
     LIMIT 1`,
    [volunteerId],
  );
  return rows[0] || null;
}

async function loadInviteByToken(query, rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  const { rows } = await query(
    `SELECT i.id,
            i.retreat_id AS "retreatId",
            i.volunteer_id AS "volunteerId",
            i.expires_at AS "expiresAt",
            i.consumed_at AS "consumedAt",
            r.name AS "retreatName"
     FROM jewelheart_volunteer_invites i
     JOIN jewelheart_retreats r ON r.id = i.retreat_id
     WHERE i.token_hash = $1
     LIMIT 1`,
    [hashInviteToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.consumedAt) return { ...row, status: 'consumed' };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ...row, status: 'expired' };
  return { ...row, status: 'active', rawToken: token };
}

async function ensureUidNotLinkedElsewhere(query, uid, volunteerId) {
  const { rows } = await query(
    `SELECT id, display_name AS "displayName"
     FROM jewelheart_volunteers
     WHERE firebase_uid = $1 AND id <> $2
     LIMIT 1`,
    [uid, volunteerId],
  );
  if (rows[0]) {
    throw new HttpError(
      409,
      'This sign-in is already linked to another volunteer profile. Sign out and use the account that matches your roster entry.',
    );
  }
}

async function findVolunteerByRosterContact(query, auth) {
  const email = normalizeEmail(auth?.email);
  if (email) {
    const { rows } = await query(
      `SELECT id, display_name AS "displayName", email, phone, firebase_uid AS "firebaseUid",
              roster_admin AS "rosterAdmin", roster_manage AS "rosterManage"
       FROM jewelheart_volunteers
       WHERE email IS NOT NULL AND lower(trim(email)) = lower(trim($1))
       LIMIT 1`,
      [email],
    );
    if (rows[0]) return rows[0];
  }
  const phone10 = phoneDigitsLast10(auth?.phone) || phoneDigitsLast10(normalizePhoneE164(auth?.phone));
  if (phone10) {
    const { rows } = await query(
      `SELECT id, display_name AS "displayName", email, phone, firebase_uid AS "firebaseUid",
              roster_admin AS "rosterAdmin", roster_manage AS "rosterManage"
       FROM jewelheart_volunteers
       WHERE phone IS NOT NULL
         AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = $1
       LIMIT 1`,
      [phone10],
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

async function volunteerSessionPayload(query, uid, authToken, keycloakPayload) {
  const { rows: byUid } = await query(
    `SELECT v.id AS "volunteerId",
            v.display_name AS "displayName",
            v.email,
            v.phone,
            v.firebase_uid AS "firebaseUid",
            v.profile_confirmed_at AS "profileConfirmedAt",
            rv.retreat_id AS "retreatId",
            r.name AS "retreatName"
     FROM jewelheart_volunteers v
     LEFT JOIN jewelheart_retreat_volunteers rv ON rv.volunteer_id = v.id
     LEFT JOIN jewelheart_retreats r ON r.id = rv.retreat_id
     WHERE v.firebase_uid = $1
     ORDER BY rv.linked_at DESC NULLS LAST
     LIMIT 1`,
    [uid],
  );
  if (byUid[0]) return { linked: true, row: byUid[0] };

  const auth = identityFromAuthToken(authToken, uid, keycloakPayload);
  if (!auth.email && !auth.phone) return { linked: false, row: null };

  const candidate = await findVolunteerByRosterContact(query, auth);
  if (!candidate || !rosterIdentityMatches(candidate, auth)) return { linked: false, row: null };

  // First onboarding still requires invite; return visits may re-link (new device or Google vs phone).
  if (!candidate.firebaseUid) return { linked: false, row: null, needsInvite: true };

  await ensureUidNotLinkedElsewhere(query, uid, candidate.id);
  await linkVolunteerUid(query, candidate.id, uid);

  const { rows } = await query(
    `SELECT v.id AS "volunteerId",
            v.display_name AS "displayName",
            rv.retreat_id AS "retreatId",
            r.name AS "retreatName"
     FROM jewelheart_volunteers v
     LEFT JOIN jewelheart_retreat_volunteers rv ON rv.volunteer_id = v.id
     LEFT JOIN jewelheart_retreats r ON r.id = rv.retreat_id
     WHERE v.id = $1
     ORDER BY rv.linked_at DESC NULLS LAST
     LIMIT 1`,
    [candidate.id],
  );
  return { linked: true, row: rows[0] || null, relinked: true };
}

async function applyRosterRoles(query, uid, volunteer) {
  if (volunteer.rosterAdmin) {
    await query(
      `INSERT INTO jewelheart_admins (firebase_uid) VALUES ($1)
       ON CONFLICT (firebase_uid) DO NOTHING`,
      [uid],
    );
  }
  if (volunteer.rosterManage) {
    await query(
      `INSERT INTO jewelheart_managers (firebase_uid) VALUES ($1)
       ON CONFLICT (firebase_uid) DO NOTHING`,
      [uid],
    );
  }
}

async function volunteerRowByFirebaseUid(query, uid) {
  const { rows } = await query(
    `SELECT id,
            display_name AS "displayName",
            email,
            phone,
            notify_email AS "notifyEmail",
            notify_sms AS "notifySms"
     FROM jewelheart_volunteers
     WHERE firebase_uid = $1
     LIMIT 1`,
    [uid],
  );
  return rows[0] || null;
}

/** Self-service volunteer row — uid link, then roster identity (re-links uid when needed). */
async function resolveVolunteerForSelf(query, uid, authToken, keycloakPayload) {
  const byUid = await volunteerRowByFirebaseUid(query, uid);
  if (byUid) return byUid;

  const auth = identityFromAuthToken(authToken, uid, keycloakPayload);
  if (!auth.email && !auth.phone) return null;

  const candidate = await findVolunteerByRosterContact(query, auth);
  if (!candidate || !rosterIdentityMatches(candidate, auth)) return null;
  if (!candidate.firebaseUid) return null;

  if (candidate.firebaseUid !== uid) {
    await ensureUidNotLinkedElsewhere(query, uid, candidate.id);
    await linkVolunteerUid(query, candidate.id, uid);
  }
  return volunteerRowByFirebaseUid(query, uid);
}

async function applyVolunteerSelfPatch(query, volunteer, body) {
  const fields = [];
  const vals = [];
  let i = 1;

  const existingEmail = normalizeEmail(volunteer.email);
  const existingPhone = phoneDigitsLast10(volunteer.phone);

  if (body.email !== undefined) {
    if (existingEmail) {
      throw new HttpError(403, 'Email is already on file and cannot be changed here.');
    }
    const em = normalizeEmail(body.email);
    if (!em) throw new HttpError(400, 'Enter a valid email address.');
    fields.push(`email = $${i++}`);
    vals.push(em);
  }

  if (body.phone !== undefined) {
    if (existingPhone) {
      throw new HttpError(403, 'Phone number is already on file and cannot be changed here.');
    }
    const ph = normalizePhoneE164(body.phone);
    if (!ph) throw new HttpError(400, 'Enter a valid phone number.');
    fields.push(`phone = $${i++}`);
    vals.push(ph);
  }

  if (body.notifyEmail !== undefined) {
    fields.push(`notify_email = $${i++}`);
    vals.push(body.notifyEmail === true);
  }

  if (body.notifySms !== undefined) {
    fields.push(`notify_sms = $${i++}`);
    vals.push(body.notifySms === true);
  }

  if (!fields.length) return volunteer;

  fields.push('updated_at = now()');
  vals.push(volunteer.id);
  try {
    const { rows } = await query(
      `UPDATE jewelheart_volunteers
       SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING id,
                 display_name AS "displayName",
                 email,
                 phone,
                 notify_email AS "notifyEmail",
                 notify_sms AS "notifySms"`,
      vals,
    );
    if (!rows[0]) throw new HttpError(404, 'Volunteer not found');
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Email already in use by another volunteer.');
    throw e;
  }
}

async function linkVolunteerUid(query, volunteerId, uid) {
  await query(
    `UPDATE jewelheart_volunteers
     SET firebase_uid = $2, updated_at = now()
     WHERE id = $1`,
    [volunteerId, uid],
  );
}

async function ensureRetreatVolunteerLink(query, retreatId, volunteerId) {
  await query(
    `INSERT INTO jewelheart_retreat_volunteers (retreat_id, volunteer_id)
     VALUES ($1, $2)
     ON CONFLICT (retreat_id, volunteer_id) DO NOTHING`,
    [retreatId, volunteerId],
  );
}

async function consumeInvite(query, inviteId) {
  await query(
    `UPDATE jewelheart_volunteer_invites
     SET consumed_at = now()
     WHERE id = $1 AND consumed_at IS NULL`,
    [inviteId],
  );
}

async function revokeActiveInvites(query, retreatId, volunteerId) {
  await query(
    `UPDATE jewelheart_volunteer_invites
     SET consumed_at = COALESCE(consumed_at, now())
     WHERE retreat_id = $1 AND volunteer_id = $2 AND consumed_at IS NULL`,
    [retreatId, volunteerId],
  );
}

/**
 * @param {{ query: Function }} deps
 */
export function createJewelHeartVolunteerInviteHandlers(deps) {
  const { query } = deps;

  return {
    /** GET /jewelheart/invites/:token/preview — no auth */
    async getInvitePreview(req, res) {
      try {
        const invite = await loadInviteByToken(query, req.params.token);
        if (!invite) {
          res.status(404).json({ ok: false, error: 'not_found', message: 'Invite not found.' });
          return;
        }
        const volunteer = await loadVolunteerRow(query, invite.volunteerId);
        res.status(200).json({
          ok: invite.status === 'active',
          status: invite.status,
          retreatId: invite.retreatId,
          retreatName: invite.retreatName,
          volunteerId: invite.volunteerId,
          displayName: volunteer?.displayName || null,
          expiresAt: invite.expiresAt,
          hasEmail: Boolean(normalizeEmail(volunteer?.email)),
          hasPhone: Boolean(normalizePhoneE164(volunteer?.phone)),
          phone: normalizePhoneE164(volunteer?.phone) || null,
        });
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('invite preview', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },

    /** POST /jewelheart/invites/redeem — Bearer required */
    async postInviteRedeem(req, res) {
      try {
        const uid = req.uid;
        if (!uid) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        const inviteToken = String(req.body?.inviteToken || req.body?.invite || '').trim();
        if (!inviteToken) {
          res.status(400).json({ error: 'inviteToken required' });
          return;
        }
        const invite = await loadInviteByToken(query, inviteToken);
        const auth = identityFromAuthToken(req.authToken, uid, req.keycloakPayload);

        if (!invite) {
          res.status(404).json({
            ok: false,
            error: 'not_found',
            message: 'Invite not found.',
          });
          return;
        }

        const volunteer = await loadVolunteerRow(query, invite.volunteerId);
        if (!volunteer) {
          res.status(404).json({ error: 'volunteer_not_found' });
          return;
        }

        if (invite.status === 'consumed') {
          if (rosterIdentityMatches(volunteer, auth)) {
            await ensureUidNotLinkedElsewhere(query, uid, volunteer.id);
            if (volunteer.firebaseUid !== uid) {
              await linkVolunteerUid(query, volunteer.id, uid);
            }
            res.status(200).json({
              ok: true,
              volunteerId: volunteer.id,
              retreatId: invite.retreatId,
              displayName: volunteer.displayName,
              linked: true,
              alreadyLinked: true,
            });
            return;
          }
          res.status(404).json({
            ok: false,
            error: 'consumed',
            message: 'This invite link was already used. Sign in normally or ask for a new link.',
          });
          return;
        }

        if (invite.status !== 'active') {
          res.status(404).json({
            ok: false,
            error: invite.status || 'not_found',
            message:
              invite.status === 'expired'
                ? 'This invite link has expired. Ask the organizer for a new QR code.'
                : 'Invite not found.',
          });
          return;
        }

        if (!volunteerHasSelfServiceContact(volunteer)) {
          res.status(403).json({
            ok: false,
            error: 'roster_incomplete',
            message: organizerContactMessage(),
          });
          return;
        }

        if (!auth.email && !auth.phone) {
          res.status(403).json({
            ok: false,
            error: 'identity_missing',
            message:
              'Sign in with the email or phone number the organizers have for you (Google, email/password, or SMS).',
          });
          return;
        }
        if (!rosterIdentityMatches(volunteer, auth)) {
          res.status(403).json({
            ok: false,
            error: 'roster_mismatch',
            message: organizerContactMessage(),
          });
          return;
        }

        await ensureUidNotLinkedElsewhere(query, uid, volunteer.id);

        // Invite + roster match may replace a stale firebase_uid (e.g. Google vs phone are different Firebase users).
        if (volunteer.firebaseUid && volunteer.firebaseUid !== uid) {
          console.info(
            'invite redeem: replacing volunteer firebase_uid',
            volunteer.id,
            volunteer.firebaseUid,
            '->',
            uid,
          );
        }

        await linkVolunteerUid(query, volunteer.id, uid);
        await ensureRetreatVolunteerLink(query, invite.retreatId, volunteer.id);
        await applyRosterRoles(query, uid, volunteer);
        await consumeInvite(query, invite.id);

        res.status(200).json({
          ok: true,
          volunteerId: volunteer.id,
          retreatId: invite.retreatId,
          displayName: volunteer.displayName,
          linked: true,
          roles: {
            admin: Boolean(volunteer.rosterAdmin),
            manage: Boolean(volunteer.rosterManage),
          },
        });
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('invite redeem', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },

    /** GET /jewelheart/volunteer/session — Bearer; linked volunteer summary */
    async getVolunteerSession(req, res) {
      try {
        const uid = req.uid;
        if (!uid) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        const isAdmin = await isGlobalAdmin(query, uid);
        let volunteer = await ensureVolunteerLinkedForAuth(
          query,
          uid,
          req.authToken,
          req.keycloakPayload,
        );
        if (!volunteer) {
          res.status(200).json({
            ok: true,
            linked: false,
            profileConfirmed: false,
            needsOnboarding: true,
            isAdmin,
          });
          return;
        }
        const profileConfirmed = Boolean(volunteer.profileConfirmedAt);
        const session = await volunteerSessionPayload(query, uid, req.authToken, req.keycloakPayload);
        res.status(200).json({
          ok: true,
          linked: true,
          relinked: Boolean(session.relinked),
          profileConfirmed,
          needsOnboarding: !profileConfirmed,
          isAdmin,
          volunteerId: volunteer.id,
          displayName: volunteer.displayName,
          retreatId: session.row?.retreatId || null,
          retreatName: session.row?.retreatName || null,
        });
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('volunteer session', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },

    /** PATCH /jewelheart/volunteer/me — self-service profile + notification prefs */
    async patchVolunteerMe(req, res) {
      try {
        const uid = req.uid;
        if (!uid) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        const volunteer = await resolveVolunteerForSelf(
          query,
          uid,
          req.authToken,
          req.keycloakPayload,
        );
        if (!volunteer) {
          res.status(403).json({
            error: 'not_linked',
            message: 'Your volunteer profile is not linked yet. Sign in again to complete onboarding.',
          });
          return;
        }
        const body = req.body || {};
        const patch = {};
        if (body.email !== undefined) patch.email = body.email;
        if (body.phone !== undefined) patch.phone = body.phone;
        if (body.notifyEmail !== undefined) patch.notifyEmail = body.notifyEmail === true;
        if (body.notifySms !== undefined) patch.notifySms = body.notifySms === true;

        const updated = await applyVolunteerSelfPatch(query, volunteer, patch);
        res.status(200).json({
          ok: true,
          volunteerId: updated.id,
          displayName: updated.displayName,
          email: updated.email,
          phone: updated.phone,
          notifyEmail: updated.notifyEmail !== false,
          notifySms: updated.notifySms === true,
        });
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('patch volunteer me', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },

    /** POST /jewelheart/retreats/:retreatId/volunteers/:volunteerId/invite — admin */
    async postMintVolunteerInvite(req, res) {
      try {
        const retreatId = req.params.retreatId;
        const volunteerId = req.params.volunteerId;
        assertUuid(retreatId, 'retreatId');
        assertUuid(volunteerId, 'volunteerId');
        await acl.assertRetreatReadAccess(req.uid, retreatId, req.authToken);

        const volunteer = await loadVolunteerRow(query, volunteerId);
        if (!volunteer) {
          res.status(404).json({ error: 'volunteer_not_found' });
          return;
        }
        if (!volunteerHasSelfServiceContact(volunteer)) {
          res.status(400).json({
            error: 'roster_incomplete',
            message: 'Volunteer needs email or phone on the roster before generating an invite.',
          });
          return;
        }

        const onRetreat = await query(
          `SELECT 1 FROM jewelheart_retreat_volunteers WHERE retreat_id = $1 AND volunteer_id = $2 LIMIT 1`,
          [retreatId, volunteerId],
        );
        if (!onRetreat.rows[0]) {
          res.status(404).json({ error: 'volunteer_not_on_retreat' });
          return;
        }

        const rotate = req.body?.rotate !== false;
        if (rotate) await revokeActiveInvites(query, retreatId, volunteerId);

        const rawToken = generateInviteToken();
        const expiresAt = new Date(Date.now() + inviteTtlHours() * 3600 * 1000);
        await query(
          `INSERT INTO jewelheart_volunteer_invites
             (retreat_id, volunteer_id, token_hash, expires_at, created_by_uid)
           VALUES ($1, $2, $3, $4, $5)`,
          [retreatId, volunteerId, hashInviteToken(rawToken), expiresAt.toISOString(), req.uid],
        );

        const inviteUrl = `${volunteerLoginBaseUrl()}?invite=${encodeURIComponent(rawToken)}`;
        res.status(201).json({
          ok: true,
          inviteUrl,
          inviteToken: rawToken,
          expiresAt: expiresAt.toISOString(),
          volunteerId,
          retreatId,
          displayName: volunteer.displayName,
        });
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('mint invite', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },
  };
}

/**
 * Mint invite (for scripts / admin tools).
 */
export async function mintVolunteerInviteForRetreat(query, retreatId, volunteerId, createdByUid = null) {
  assertUuid(retreatId, 'retreatId');
  assertUuid(volunteerId, 'volunteerId');
  const volunteer = await loadVolunteerRow(query, volunteerId);
  if (!volunteer) throw new HttpError(404, 'volunteer_not_found');
  if (!volunteerHasSelfServiceContact(volunteer)) {
    throw new HttpError(400, 'Volunteer needs email or phone on roster');
  }
  await revokeActiveInvites(query, retreatId, volunteerId);
  const rawToken = generateInviteToken();
  const expiresAt = new Date(Date.now() + inviteTtlHours() * 3600 * 1000);
  await query(
    `INSERT INTO jewelheart_volunteer_invites
       (retreat_id, volunteer_id, token_hash, expires_at, created_by_uid)
     VALUES ($1, $2, $3, $4, $5)`,
    [retreatId, volunteerId, hashInviteToken(rawToken), expiresAt.toISOString(), createdByUid],
  );
  return {
    inviteUrl: `${volunteerLoginBaseUrl()}?invite=${encodeURIComponent(rawToken)}`,
    inviteToken: rawToken,
    expiresAt: expiresAt.toISOString(),
    displayName: volunteer.displayName,
  };
}

/**
 * SDUI / API allowlist — linked volunteer on retreat, or global admin.
 * @param {string} firebaseUid
 * @param {object} [authToken]
 * @param {{ retreatId?: string|null, query: Function }} opts
 */
export async function assertVolunteerRosterAccess(firebaseUid, authToken, opts) {
  const { query, retreatId = null, keycloakPayload = null } = opts || {};
  if (!query) throw new Error('assertVolunteerRosterAccess requires query');
  const uid = String(firebaseUid || '').trim();
  if (!uid) throw new HttpError(401, 'Sign in required');

  const isAdmin = await isGlobalAdmin(query, uid);

  const linked = await ensureVolunteerLinkedForAuth(query, uid, authToken, keycloakPayload);
  const volunteer = linked
    ? {
        volunteerId: linked.id,
        displayName: linked.displayName,
        profileConfirmedAt: linked.profileConfirmedAt,
      }
    : null;
  if (!volunteer) {
    throw new HttpError(403, 'Complete volunteer onboarding on the login page first.');
  }
  if (!volunteer.profileConfirmedAt) {
    throw new HttpError(403, 'Complete volunteer onboarding before using the app.');
  }

  const rid = retreatId ? String(retreatId).trim() : '';
  if (rid) {
    assertUuid(rid, 'retreatId');
    const linked = await query(
      `SELECT 1 FROM jewelheart_retreat_volunteers WHERE retreat_id = $1 AND volunteer_id = $2 LIMIT 1`,
      [rid, volunteer.volunteerId],
    );
    if (!linked.rows[0]) {
      throw new HttpError(403, organizerContactMessage());
    }
  } else {
    const any = await query(
      `SELECT 1 FROM jewelheart_retreat_volunteers WHERE volunteer_id = $1 LIMIT 1`,
      [volunteer.volunteerId],
    );
    if (!any.rows[0]) {
      throw new HttpError(403, organizerContactMessage());
    }
  }

  if (isAdmin) return { ok: true, isAdmin: true, volunteerId: volunteer.volunteerId, displayName: volunteer.displayName };

  return { ok: true, volunteerId: volunteer.volunteerId, displayName: volunteer.displayName };
}

export {
  hashInviteToken,
  loadInviteByToken,
  loadVolunteerRow,
  rosterIdentityMatches,
  volunteerHasSelfServiceContact,
};
