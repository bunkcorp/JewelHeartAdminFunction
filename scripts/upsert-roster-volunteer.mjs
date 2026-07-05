#!/usr/bin/env node
/**
 * Upsert a volunteer on the roster (email + phone) and link to a retreat.
 * Run on laptop: cd ~/private-server-dev && node --env-file=.env scripts/upsert-roster-volunteer.mjs ...
 */
import { query } from '../src/db.js';

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const displayName = arg('--name');
const email = arg('--email');
const phone = arg('--phone');
const volunteerId = arg('--id');
const retreatIdArg = arg('--retreat-id');

if (!displayName && !email && !volunteerId) {
  console.error('usage: upsert-roster-volunteer.mjs --name "..." --email ... --phone "..." [--id uuid] [--retreat-id uuid]');
  process.exit(1);
}

async function resolveRetreatId() {
  if (retreatIdArg) return retreatIdArg;
  const envId = process.env.JEWELHEART_PEOPLE_TEST_RETREAT_ID?.trim();
  if (envId) return envId;
  const { rows } = await query(
    `SELECT id FROM jewelheart_retreats WHERE start_date = '2026-07-20'::date ORDER BY created_at LIMIT 1`,
  );
  if (rows[0]?.id) return rows[0].id;
  const any = await query(`SELECT id FROM jewelheart_retreats ORDER BY start_date DESC LIMIT 1`);
  if (!any.rows[0]?.id) throw new Error('No retreat found');
  return any.rows[0].id;
}

async function upsertVolunteer() {
  if (volunteerId) {
    const { rows } = await query(
      `UPDATE jewelheart_volunteers
       SET display_name = COALESCE($2, display_name),
           email = COALESCE($3, email),
           phone = COALESCE($4, phone),
           updated_at = now()
       WHERE id = $1
       RETURNING id, display_name, email, phone`,
      [volunteerId, displayName || null, email || null, phone || null],
    );
    if (!rows[0]) throw new Error(`Volunteer not found: ${volunteerId}`);
    return rows[0];
  }

  if (email) {
    const { rows: byEmail } = await query(
      `SELECT id FROM jewelheart_volunteers WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
      [email],
    );
    if (byEmail[0]?.id) {
      const { rows } = await query(
        `UPDATE jewelheart_volunteers
         SET display_name = $2, phone = COALESCE($3, phone), updated_at = now()
         WHERE id = $1
         RETURNING id, display_name, email, phone`,
        [byEmail[0].id, displayName, phone],
      );
      return rows[0];
    }
  }

  const phoneDigits = String(phone || '').replace(/\D/g, '');
  if (phoneDigits) {
    const { rows: byPhone } = await query(
      `SELECT id FROM jewelheart_volunteers
       WHERE phone IS NOT NULL
         AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = right($1, 10)
       LIMIT 1`,
      [phoneDigits],
    );
    if (byPhone[0]?.id) {
      const { rows } = await query(
        `UPDATE jewelheart_volunteers
         SET display_name = $2, email = COALESCE($3, email), phone = $4, updated_at = now()
         WHERE id = $1
         RETURNING id, display_name, email, phone`,
        [byPhone[0].id, displayName, email, phone],
      );
      return rows[0];
    }
  }

  const { rows: byName } = await query(
    `SELECT id FROM jewelheart_volunteers WHERE display_name ILIKE $1 LIMIT 1`,
    [displayName],
  );
  if (byName[0]?.id) {
    const { rows } = await query(
      `UPDATE jewelheart_volunteers
       SET email = COALESCE($2, email), phone = COALESCE($3, phone), updated_at = now()
       WHERE id = $1
       RETURNING id, display_name, email, phone`,
      [byName[0].id, email || null, phone || null],
    );
    return rows[0];
  }

  const { rows } = await query(
    `INSERT INTO jewelheart_volunteers (display_name, email, phone)
     VALUES ($1, $2, $3)
     RETURNING id, display_name, email, phone`,
    [displayName, email || null, phone || null],
  );
  return rows[0];
}

async function linkRetreat(retreatId, vid) {
  await query(
    `INSERT INTO jewelheart_retreat_volunteers (retreat_id, volunteer_id)
     VALUES ($1, $2)
     ON CONFLICT (retreat_id, volunteer_id) DO NOTHING`,
    [retreatId, vid],
  );
}

const retreatId = await resolveRetreatId();
const volunteer = await upsertVolunteer();
await linkRetreat(retreatId, volunteer.id);

console.log(JSON.stringify({ ok: true, retreatId, volunteer }, null, 2));
