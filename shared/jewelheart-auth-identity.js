/**
 * Normalize auth identity fields for roster matching (email / E.164 phone).
 */

export function normalizeEmail(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return s && s.includes('@') ? s : null;
}

export function phoneDigitsLast10(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length ? digits : null;
}

export function normalizePhoneE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const trimmed = String(raw || '').trim();
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export function volunteerHasSelfServiceContact(volunteer) {
  return Boolean(normalizeEmail(volunteer?.email) || phoneDigitsLast10(volunteer?.phone));
}

/**
 * Auth email/phone must match at least one populated roster field.
 * @param {{ email?: string|null, phone?: string|null }} volunteer
 * @param {{ email?: string|null, phone?: string|null }} auth
 */
export function rosterIdentityMatches(volunteer, auth) {
  const rosterEmail = normalizeEmail(volunteer?.email);
  const rosterPhone10 = phoneDigitsLast10(volunteer?.phone);
  const authEmail = normalizeEmail(auth?.email);
  const authPhone10 =
    phoneDigitsLast10(auth?.phone) ||
    phoneDigitsLast10(auth?.phoneE164) ||
    phoneDigitsLast10(normalizePhoneE164(auth?.phone));

  if (!rosterEmail && !rosterPhone10) return false;
  if (rosterEmail && authEmail && rosterEmail === authEmail) return true;
  if (rosterPhone10 && authPhone10 && rosterPhone10 === authPhone10) return true;
  return false;
}

/**
 * @param {object|null|undefined} authToken decoded Bearer (Firebase / Keycloak)
 * @param {string} uid
 */
function emailFromFirebaseIdentities(authToken) {
  const identities = authToken?.firebase?.identities;
  if (!identities || typeof identities !== 'object') return null;
  const raw = identities.email;
  if (Array.isArray(raw) && raw[0]) return normalizeEmail(raw[0]);
  if (typeof raw === 'string') return normalizeEmail(raw);
  return null;
}

export function identityFromAuthToken(authToken, uid, keycloakPayload = null) {
  const email =
    normalizeEmail(authToken?.email) ||
    normalizeEmail(keycloakPayload?.email) ||
    normalizeEmail(authToken?.preferred_username) ||
    normalizeEmail(keycloakPayload?.preferred_username) ||
    emailFromFirebaseIdentities(authToken) ||
    null;
  const rawPhone =
    authToken?.phone_number ||
    keycloakPayload?.phone_number ||
    keycloakPayload?.phone ||
    authToken?.phone ||
    null;
  const phone = normalizePhoneE164(rawPhone);
  return { uid: String(uid || '').trim(), email, phone };
}

export function organizerContactMessage() {
  const contact =
    process.env.JEWELHEART_ORGANIZER_CONTACT?.trim() ||
    'the retreat organizers';
  return `You're not on the roster for this retreat, or the email/phone you signed in with doesn't match our records. Contact ${contact}.`;
}
