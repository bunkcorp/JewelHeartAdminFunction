/**
 * Match Firebase / Keycloak sign-in to jewelheart_volunteers and link retreat roster.
 * Used by volunteer SDUI home, listRetreats, and read ACL for published retreats.
 */

import { query } from '../db.js';

/** Last 10 digits for US phone matching (Firebase E.164 vs stored "(714) 955-9394"). */
export function phoneDigitsOnly(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length ? digits : null;
}

/** Email and phone hints from decoded auth tokens. */
export function authContactHints(authToken, keycloakPayload) {
  const email =
    (authToken?.email && String(authToken.email).trim()) ||
    (keycloakPayload?.email && String(keycloakPayload.email).trim()) ||
    null;
  const rawPhone =
    (authToken?.phone_number && String(authToken.phone_number).trim()) ||
    (Array.isArray(authToken?.firebase?.identities?.phone) &&
      authToken.firebase.identities.phone[0] &&
      String(authToken.firebase.identities.phone[0]).trim()) ||
    null;
  return { email, phoneDigits: phoneDigitsOnly(rawPhone) };
}

/**
 * @returns {Promise<{ id: string, displayName: string, email?: string, phone?: string, firebase_uid?: string } | null>}
 */
export async function findVolunteerByAuth(firebaseUid, authToken, keycloakPayload) {
  if (firebaseUid) {
    const byUid = await query(
      `SELECT id, display_name AS "displayName", email, phone, firebase_uid
       FROM jewelheart_volunteers
       WHERE firebase_uid = $1
       LIMIT 1`,
      [firebaseUid],
    );
    if (byUid.rows[0]) return byUid.rows[0];
  }

  const { email, phoneDigits } = authContactHints(authToken, keycloakPayload);

  if (email) {
    const byEmail = await query(
      `SELECT id, display_name AS "displayName", email, phone, firebase_uid
       FROM jewelheart_volunteers
       WHERE email IS NOT NULL AND lower(trim(email)) = lower(trim($1))
       LIMIT 1`,
      [email],
    );
    if (byEmail.rows[0]) return byEmail.rows[0];
  }

  if (phoneDigits) {
    const byPhone = await query(
      `SELECT id, display_name AS "displayName", email, phone, firebase_uid
       FROM jewelheart_volunteers
       WHERE phone IS NOT NULL
         AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = $1
       LIMIT 1`,
      [phoneDigits],
    );
    if (byPhone.rows[0]) return byPhone.rows[0];
  }

  return null;
}

export async function ensureVolunteerFirebaseUid(volunteerId, firebaseUid) {
  if (!volunteerId || !firebaseUid) return;
  await query(
    `UPDATE jewelheart_volunteers
     SET firebase_uid = $2, updated_at = now()
     WHERE id = $1 AND (firebase_uid IS NULL OR firebase_uid = $2)`,
    [volunteerId, firebaseUid],
  );
}

export async function ensureRetreatVolunteerLink(retreatId, volunteerId) {
  if (!retreatId || !volunteerId) return;
  await query(
    `INSERT INTO jewelheart_retreat_volunteers (retreat_id, volunteer_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [retreatId, volunteerId],
  );
}

/** Most recent published retreat (volunteer home default). */
export async function findDefaultPublishedRetreatId() {
  const { rows } = await query(
    `SELECT id FROM jewelheart_retreats
     WHERE status = 'published'
     ORDER BY start_date DESC NULLS LAST, created_at DESC
     LIMIT 1`,
  );
  return rows[0]?.id || null;
}

/**
 * Match auth to a volunteer row, attach firebase_uid, and ensure retreat roster link.
 * @returns {Promise<{ id: string, displayName: string } | null>}
 */
export async function ensureVolunteerForHome(firebaseUid, authToken, retreatId, keycloakPayload) {
  const volunteer = await findVolunteerByAuth(firebaseUid, authToken, keycloakPayload);
  if (!volunteer) return null;

  await ensureVolunteerFirebaseUid(volunteer.id, firebaseUid);

  let targetRetreatId = retreatId || null;
  if (!targetRetreatId) {
    const linked = await query(
      `SELECT rv.retreat_id AS id
       FROM jewelheart_retreat_volunteers rv
       JOIN jewelheart_retreats r ON r.id = rv.retreat_id
       WHERE rv.volunteer_id = $1 AND r.status = 'published'
       ORDER BY r.start_date DESC NULLS LAST
       LIMIT 1`,
      [volunteer.id],
    );
    targetRetreatId = linked.rows[0]?.id || (await findDefaultPublishedRetreatId());
  }

  if (targetRetreatId) {
    await ensureRetreatVolunteerLink(targetRetreatId, volunteer.id);
  }

  return { id: volunteer.id, displayName: volunteer.displayName };
}

/** Whether signed-in user is on the roster for a published retreat. */
export async function isVolunteerLinkedToRetreat(firebaseUid, retreatId, authToken, keycloakPayload) {
  if (!retreatId) return false;
  const volunteer = await findVolunteerByAuth(firebaseUid, authToken, keycloakPayload);
  if (!volunteer) return false;
  const { rows } = await query(
    `SELECT 1
     FROM jewelheart_retreat_volunteers rv
     JOIN jewelheart_retreats r ON r.id = rv.retreat_id
     WHERE rv.retreat_id = $1 AND rv.volunteer_id = $2 AND r.status = 'published'
     LIMIT 1`,
    [retreatId, volunteer.id],
  );
  return rows.length > 0;
}

/** Volunteer id for ACL / listRetreats (sets firebase_uid when matched by email/phone). */
export async function resolveVolunteerIdForAccess(firebaseUid, authToken, keycloakPayload) {
  const volunteer = await findVolunteerByAuth(firebaseUid, authToken, keycloakPayload);
  if (!volunteer) return null;
  await ensureVolunteerFirebaseUid(volunteer.id, firebaseUid);
  return volunteer.id;
}
