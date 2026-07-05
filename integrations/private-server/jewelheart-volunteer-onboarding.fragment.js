/**
 * JewelHeart — volunteer bootstrap + mandatory onboarding (no invites).
 *
 * Env:
 *   JEWELHEART_ACTIVE_RETREAT_ID — retreat linked on first sign-in (required)
 *   SENDGRID_API_KEY, SENDGRID_FROM_EMAIL — email OTP
 */

import crypto from 'crypto';
import { HttpError } from './errors.js';
import { assertUuid } from './service.js';
import {
  identityFromAuthToken,
  normalizeEmail,
  normalizePhoneE164,
  phoneDigitsLast10,
} from './jewelheart-auth-identity.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS_PER_HOUR = 8;

function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code || ''), 'utf8').digest('hex');
}

function generateOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function splitDisplayName(displayName) {
  const parts = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function authDisplayNameHint(authToken, keycloakPayload) {
  const raw =
    authToken?.name ||
    keycloakPayload?.name ||
    authToken?.display_name ||
    keycloakPayload?.preferred_username ||
    '';
  return String(raw || '').trim() || null;
}

function activeRetreatIdFromEnv() {
  const id = String(process.env.JEWELHEART_ACTIVE_RETREAT_ID || '').trim();
  if (!id) {
    throw new HttpError(
      503,
      'Active retreat is not configured on this server (JEWELHEART_ACTIVE_RETREAT_ID).',
    );
  }
  assertUuid(id, 'JEWELHEART_ACTIVE_RETREAT_ID');
  return id;
}

async function volunteerByFirebaseUid(query, uid) {
  const { rows } = await query(
    `SELECT id,
            display_name AS "displayName",
            email,
            phone,
            firebase_uid AS "firebaseUid",
            profile_confirmed_at AS "profileConfirmedAt",
            auth_email_at_signup AS "authEmailAtSignup",
            auth_phone_at_signup AS "authPhoneAtSignup"
     FROM jewelheart_volunteers
     WHERE firebase_uid = $1
     LIMIT 1`,
    [uid],
  );
  return rows[0] || null;
}

async function findVolunteerByContact(query, auth) {
  const email = normalizeEmail(auth?.email);
  if (email) {
    const { rows } = await query(
      `SELECT id,
              display_name AS "displayName",
              email,
              phone,
              firebase_uid AS "firebaseUid",
              profile_confirmed_at AS "profileConfirmedAt",
              auth_email_at_signup AS "authEmailAtSignup",
              auth_phone_at_signup AS "authPhoneAtSignup"
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
      `SELECT id,
              display_name AS "displayName",
              email,
              phone,
              firebase_uid AS "firebaseUid",
              profile_confirmed_at AS "profileConfirmedAt",
              auth_email_at_signup AS "authEmailAtSignup",
              auth_phone_at_signup AS "authPhoneAtSignup"
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
      'This sign-in is already linked to another volunteer profile. Sign out and contact the organizers.',
    );
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

async function sendgridOtpEmail({ to, code }) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new HttpError(503, 'Email is not configured on this server.');
  const from = process.env.SENDGRID_FROM_EMAIL || process.env.JEWELHEART_FROM_EMAIL;
  if (!from) throw new HttpError(503, 'Email sender is not configured on this server.');

  const subject = 'JewelHeart volunteer — verification code';
  const text = `Your JewelHeart verification code is: ${code}\n\nIt expires in 10 minutes.`;
  const html = `<p>Your JewelHeart verification code is:</p>
<p style="font-size:1.5em;font-weight:700;letter-spacing:0.15em">${code}</p>
<p>It expires in 10 minutes.</p>`;

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: 'JewelHeart Retreat Volunteers' },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new HttpError(502, `Could not send verification email (${res.status}). ${t.slice(0, 200)}`);
  }
}

async function countRecentOtps(query, volunteerId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n
     FROM jewelheart_contact_verifications
     WHERE volunteer_id = $1
       AND created_at > now() - interval '1 hour'`,
    [volunteerId],
  );
  return rows[0]?.n || 0;
}

async function hasVerifiedEmail(query, volunteerId, email) {
  const em = normalizeEmail(email);
  if (!em) return false;
  const { rows } = await query(
    `SELECT 1
     FROM jewelheart_contact_verifications
     WHERE volunteer_id = $1
       AND channel = 'email'
       AND lower(trim(destination)) = lower(trim($2))
       AND verified_at IS NOT NULL
       AND verified_at > now() - interval '30 minutes'
     LIMIT 1`,
    [volunteerId, em],
  );
  return Boolean(rows[0]);
}

function emailOtpRequired(authEmail, formEmail) {
  const ae = normalizeEmail(authEmail);
  const fe = normalizeEmail(formEmail);
  if (!fe) return true;
  if (!ae) return true;
  return ae !== fe;
}

function phoneAllowed(authPhone, formPhone) {
  const fp = normalizePhoneE164(formPhone);
  if (!fp) return true;
  const ap = normalizePhoneE164(authPhone);
  if (!ap) return true;
  return phoneDigitsLast10(ap) === phoneDigitsLast10(fp);
}

function buildOnboardingDraft(volunteer, auth, authToken, keycloakPayload) {
  const authEmail = normalizeEmail(auth.email);
  const authPhone = normalizePhoneE164(auth.phone);
  const { firstName, lastName } = splitDisplayName(volunteer.displayName);
  const profileConfirmed = Boolean(volunteer.profileConfirmedAt);
  const reOnboarding = !profileConfirmed && Boolean(firstName || lastName || volunteer.email || volunteer.phone);

  const draftEmail = normalizeEmail(volunteer.email) || authEmail || '';
  const draftPhone = volunteer.phone ? String(volunteer.phone).trim() : authPhone ? authPhone : '';

  return {
    volunteerId: volunteer.id,
    profileConfirmed,
    reOnboarding,
    firstName: profileConfirmed ? firstName : '',
    lastName: profileConfirmed ? lastName : '',
    email: draftEmail,
    phone: draftPhone,
    authEmail: authEmail || '',
    authPhone: authPhone || '',
    emailOtpRequired: emailOtpRequired(authEmail, draftEmail),
    phoneMustMatchAuth: Boolean(authPhone),
    meritBoardNote:
      'Names are not inferred from your email address — enter the first and last name you want shown in the app.',
  };
}

/**
 * Match roster by email/phone and attach uid (no create). Used by bootstrap + SDUI gate.
 */
export async function ensureVolunteerLinkedForAuth(query, uid, authToken, keycloakPayload) {
  const auth = identityFromAuthToken(authToken, uid, keycloakPayload);
  const rosterMatch = await findVolunteerByContact(query, auth);
  let volunteer = await volunteerByFirebaseUid(query, uid);

  if (rosterMatch) {
    if (volunteer && volunteer.id !== rosterMatch.id) {
      await query(`UPDATE jewelheart_volunteers SET firebase_uid = NULL, updated_at = now() WHERE id = $1`, [
        volunteer.id,
      ]);
      volunteer = null;
    }
    if (!rosterMatch.firebaseUid || rosterMatch.firebaseUid === uid) {
      await ensureUidNotLinkedElsewhere(query, uid, rosterMatch.id);
      await linkVolunteerUid(query, rosterMatch.id, uid);
      volunteer = await volunteerByFirebaseUid(query, uid);
    } else if (rosterMatch.firebaseUid !== uid) {
      throw new HttpError(
        409,
        'This roster contact is linked to a different sign-in. Contact the organizers.',
      );
    }
  }

  if (!volunteer) {
    volunteer = await volunteerByFirebaseUid(query, uid);
  }
  return volunteer;
}

/**
 * Find or create volunteer, link uid + active retreat.
 */
export async function bootstrapVolunteerSession(query, uid, authToken, keycloakPayload) {
  const auth = identityFromAuthToken(authToken, uid, keycloakPayload);
  const retreatId = activeRetreatIdFromEnv();

  let volunteer = await ensureVolunteerLinkedForAuth(query, uid, authToken, keycloakPayload);

  if (!volunteer) {
    const hint = authDisplayNameHint(authToken, keycloakPayload);
    const displayName = hint || 'Volunteer';
    const authEmail = normalizeEmail(auth.email);
    const authPhone = normalizePhoneE164(auth.phone);
    const { rows } = await query(
      `INSERT INTO jewelheart_volunteers
         (display_name, email, phone, firebase_uid, auth_email_at_signup, auth_phone_at_signup)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id,
                 display_name AS "displayName",
                 email,
                 phone,
                 firebase_uid AS "firebaseUid",
                 profile_confirmed_at AS "profileConfirmedAt",
                 auth_email_at_signup AS "authEmailAtSignup",
                 auth_phone_at_signup AS "authPhoneAtSignup"`,
      [
        displayName,
        authEmail,
        authPhone,
        uid,
        authEmail,
        authPhone,
      ],
    );
    volunteer = rows[0];
  }

  await ensureRetreatVolunteerLink(query, retreatId, volunteer.id);

  const draft = buildOnboardingDraft(volunteer, auth, authToken, keycloakPayload);
  return {
    ok: true,
    volunteerId: volunteer.id,
    retreatId,
    profileConfirmed: draft.profileConfirmed,
    linked: true,
    ...draft,
  };
}

export async function resetVolunteerOnboarding(query, volunteerId) {
  assertUuid(volunteerId, 'volunteerId');
  const { rows } = await query(
    `UPDATE jewelheart_volunteers
     SET profile_confirmed_at = NULL, updated_at = now()
     WHERE id = $1
     RETURNING id, display_name AS "displayName"`,
    [volunteerId],
  );
  if (!rows[0]) throw new HttpError(404, 'Volunteer not found');
  return rows[0];
}

export function createJewelHeartVolunteerOnboardingHandlers({ query }) {
  async function requireVolunteer(req) {
    const uid = req.uid;
    if (!uid) throw new HttpError(401, 'Sign in required');
    const volunteer = await volunteerByFirebaseUid(query, uid);
    if (!volunteer) {
      throw new HttpError(403, 'Volunteer session not bootstrapped. Sign in again.');
    }
    return volunteer;
  }

  return {
    async postBootstrap(req, res) {
      try {
        const out = await bootstrapVolunteerSession(query, req.uid, req.authToken, req.keycloakPayload);
        res.status(200).json(out);
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('volunteer bootstrap', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },

    async getOnboarding(req, res) {
      try {
        const volunteer = await requireVolunteer(req);
        const auth = identityFromAuthToken(req.authToken, req.uid, req.keycloakPayload);
        const draft = buildOnboardingDraft(volunteer, auth, req.authToken, req.keycloakPayload);
        res.status(200).json({ ok: true, ...draft });
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('onboarding get', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },

    async postSendOtp(req, res) {
      try {
        const volunteer = await requireVolunteer(req);
        if (volunteer.profileConfirmedAt) {
          throw new HttpError(400, 'Profile is already confirmed.');
        }
        const channel = String(req.body?.channel || 'email').trim().toLowerCase();
        if (channel !== 'email') {
          throw new HttpError(400, 'Only email verification is supported.');
        }
        const destination = normalizeEmail(req.body?.email || req.body?.destination);
        if (!destination) throw new HttpError(400, 'Enter a valid email address.');

        const auth = identityFromAuthToken(req.authToken, req.uid, req.keycloakPayload);
        if (!emailOtpRequired(auth.email, destination)) {
          res.status(200).json({ ok: true, skipped: true, message: 'Email matches sign-in — no code needed.' });
          return;
        }

        const sent = await countRecentOtps(query, volunteer.id);
        if (sent >= OTP_MAX_ATTEMPTS_PER_HOUR) {
          throw new HttpError(429, 'Too many verification codes sent. Try again later.');
        }

        const code = generateOtpCode();
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);
        await query(
          `INSERT INTO jewelheart_contact_verifications
             (volunteer_id, channel, destination, code_hash, expires_at)
           VALUES ($1, 'email', $2, $3, $4)`,
          [volunteer.id, destination, hashOtp(code), expiresAt.toISOString()],
        );
        await sendgridOtpEmail({ to: destination, code });

        res.status(200).json({
          ok: true,
          message: `Verification code sent to ${destination}.`,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('onboarding send otp', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },

    async postVerifyOtp(req, res) {
      try {
        const volunteer = await requireVolunteer(req);
        const destination = normalizeEmail(req.body?.email || req.body?.destination);
        const code = String(req.body?.code || '').trim();
        if (!destination) throw new HttpError(400, 'Email required.');
        if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'Enter the 6-digit code.');

        const { rows } = await query(
          `SELECT id, code_hash AS "codeHash", expires_at AS "expiresAt", verified_at AS "verifiedAt"
           FROM jewelheart_contact_verifications
           WHERE volunteer_id = $1
             AND channel = 'email'
             AND lower(trim(destination)) = lower(trim($2))
             AND verified_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1`,
          [volunteer.id, destination],
        );
        const row = rows[0];
        if (!row) throw new HttpError(400, 'No verification pending for this email. Tap Send code.');
        if (new Date(row.expiresAt).getTime() < Date.now()) {
          throw new HttpError(400, 'Code expired. Tap Send code for a new one.');
        }
        if (row.codeHash !== hashOtp(code)) {
          throw new HttpError(400, 'Incorrect code.');
        }

        await query(
          `UPDATE jewelheart_contact_verifications SET verified_at = now() WHERE id = $1`,
          [row.id],
        );

        res.status(200).json({ ok: true, verified: true, email: destination });
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('onboarding verify otp', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },

    async postComplete(req, res) {
      try {
        const volunteer = await requireVolunteer(req);
        if (volunteer.profileConfirmedAt) {
          res.status(200).json({ ok: true, alreadyConfirmed: true, profileConfirmed: true });
          return;
        }

        const firstName = String(req.body?.firstName || '').trim();
        const lastName = String(req.body?.lastName || '').trim();
        const email = normalizeEmail(req.body?.email);
        const phoneRaw = String(req.body?.phone || '').trim();
        const phone = phoneRaw ? normalizePhoneE164(phoneRaw) : null;

        if (!firstName) throw new HttpError(400, 'First name is required.');
        if (!lastName) throw new HttpError(400, 'Last name is required.');
        if (!email) throw new HttpError(400, 'Email address is required.');

        const auth = identityFromAuthToken(req.authToken, req.uid, req.keycloakPayload);
        if (!phoneAllowed(auth.phone, phone)) {
          throw new HttpError(
            400,
            'Phone must match the number you signed in with, or leave phone blank.',
          );
        }

        if (emailOtpRequired(auth.email, email)) {
          const verified = await hasVerifiedEmail(query, volunteer.id, email);
          if (!verified) {
            throw new HttpError(400, 'Verify your email address with the code we sent.');
          }
        }

        const displayName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();

        try {
          const { rows } = await query(
            `UPDATE jewelheart_volunteers
             SET display_name = $2,
                 email = $3,
                 phone = $4,
                 profile_confirmed_at = now(),
                 updated_at = now()
             WHERE id = $1
             RETURNING id,
                       display_name AS "displayName",
                       email,
                       phone,
                       profile_confirmed_at AS "profileConfirmedAt"`,
            [volunteer.id, displayName, email, phone],
          );
          if (!rows[0]) throw new HttpError(404, 'Volunteer not found');
          res.status(200).json({
            ok: true,
            profileConfirmed: true,
            volunteerId: rows[0].id,
            displayName: rows[0].displayName,
            email: rows[0].email,
            phone: rows[0].phone,
            profileConfirmedAt: rows[0].profileConfirmedAt,
          });
        } catch (e) {
          if (e.code === '23505') {
            throw new HttpError(409, 'That email is already used by another volunteer. Contact the organizers.');
          }
          throw e;
        }
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status >= 500) console.error('onboarding complete', e);
        res.status(status).json({ error: e.message || 'Server error' });
      }
    },
  };
}

export {
  volunteerByFirebaseUid,
  buildOnboardingDraft,
  splitDisplayName,
};
