#!/usr/bin/env node
/**
 * Mint a volunteer invite QR/link (dev/test laptop with DATABASE_URL).
 *
 *   node --env-file=.env scripts/generate-volunteer-invite.mjs --volunteer-id <uuid> [--retreat-id <uuid>]
 *   node --env-file=.env scripts/generate-volunteer-invite.mjs --email lewis@example.com
 */
import { query } from '../src/db.js';
import { mintVolunteerInviteForRetreat } from '../src/jewelheart/jewelheart-volunteer-invite.js';

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

async function resolveRetreatId() {
  const id = arg('--retreat-id') || process.env.JEWELHEART_PEOPLE_TEST_RETREAT_ID?.trim();
  if (id) return id;
  const { rows } = await query(
    `SELECT id FROM jewelheart_retreats ORDER BY start_date DESC NULLS LAST LIMIT 1`,
  );
  if (!rows[0]?.id) throw new Error('No retreat found; pass --retreat-id');
  return rows[0].id;
}

async function resolveVolunteerId() {
  const vid = arg('--volunteer-id');
  if (vid) return vid;
  const email = arg('--email');
  if (email) {
    const { rows } = await query(
      `SELECT id FROM jewelheart_volunteers WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
      [email],
    );
    if (!rows[0]?.id) throw new Error(`No volunteer for email ${email}`);
    return rows[0].id;
  }
  const name = arg('--name');
  if (name) {
    const { rows } = await query(
      `SELECT id FROM jewelheart_volunteers WHERE display_name ILIKE $1 ORDER BY created_at LIMIT 1`,
      [name],
    );
    if (!rows[0]?.id) throw new Error(`No volunteer matching name ${name}`);
    return rows[0].id;
  }
  throw new Error('Pass --volunteer-id, --email, or --name');
}

const retreatId = await resolveRetreatId();
const volunteerId = await resolveVolunteerId();
const out = await mintVolunteerInviteForRetreat(query, retreatId, volunteerId, 'cli-script');
console.log(JSON.stringify({ retreatId, volunteerId, ...out }, null, 2));
