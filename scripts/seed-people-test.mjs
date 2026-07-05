#!/usr/bin/env node
/**
 * Seed jewelheart_volunteers + retreat links from People, test.xlsx (dev/test only).
 *
 * Run on the laptop private-server (dev DB):
 *   node --env-file=.env scripts/seed-people-test.mjs
 *   node --env-file=.env scripts/seed-people-test.mjs --dry-run
 *
 * From repo (copies xlsx + script to dev first):
 *   node scripts/seed-people-test-dev.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../src/db.js';
import { defaultPeopleTestXlsxPath, loadPeopleTestFromXlsx } from './lib/people-test-xlsx.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');
const xlsxArg = process.argv.find((a) => a.endsWith('.xlsx'));
const xlsxPath = xlsxArg ? path.resolve(xlsxArg) : defaultPeopleTestXlsxPath();

const FALLBACK_RETREAT_START = '2026-07-20';

async function resolveRetreatId() {
  const envId = process.env.JEWELHEART_PEOPLE_TEST_RETREAT_ID?.trim();
  if (envId) return envId;
  const { rows } = await query(
    `SELECT id, name, start_date::text AS start
     FROM jewelheart_retreats
     WHERE start_date = $1::date
     ORDER BY created_at
     LIMIT 1`,
    [FALLBACK_RETREAT_START],
  );
  if (rows[0]?.id) return rows[0].id;
  const any = await query(
    `SELECT id, name, start_date::text AS start FROM jewelheart_retreats ORDER BY start_date DESC LIMIT 1`,
  );
  if (!any.rows[0]?.id) throw new Error('No jewelheart_retreats row found');
  console.warn(`No retreat on ${FALLBACK_RETREAT_START}; using ${any.rows[0].name} (${any.rows[0].start})`);
  return any.rows[0].id;
}

async function findVolunteerByEmail(email) {
  const em = String(email || '').trim();
  if (!em) return null;
  const { rows } = await query(
    `SELECT id, display_name AS "displayName", email, phone
     FROM jewelheart_volunteers
     WHERE email IS NOT NULL AND lower(trim(email)) = lower(trim($1))
     LIMIT 1`,
    [em],
  );
  return rows[0] || null;
}

async function findVolunteerByName(displayName) {
  const { rows } = await query(
    `SELECT id, display_name AS "displayName", email, phone
     FROM jewelheart_volunteers
     WHERE display_name = $1
     ORDER BY created_at
     LIMIT 1`,
    [displayName],
  );
  return rows[0] || null;
}

async function findVolunteerByPhone(phone) {
  const ph = String(phone || '').replace(/\D/g, '');
  if (!ph) return null;
  const { rows } = await query(
    `SELECT id, display_name AS "displayName", email, phone
     FROM jewelheart_volunteers
     WHERE phone IS NOT NULL AND regexp_replace(phone, '\\D', '', 'g') = $1
     LIMIT 1`,
    [ph],
  );
  return rows[0] || null;
}

async function upsertVolunteer(person) {
  const displayName = person.displayName;
  const email = person.email || null;
  const phone = person.phone || null;
  const rosterAdmin = Boolean(person.admin);
  const rosterManage = Boolean(person.manage);

  if (!email && !phone) {
    return { id: null, action: 'skipped_no_contact', displayName };
  }

  let existing = email ? await findVolunteerByEmail(email) : null;
  if (!existing && phone) existing = await findVolunteerByPhone(phone);
  if (!existing && !email) existing = await findVolunteerByName(displayName);

  if (existing) {
    if (dryRun) return { id: existing.id, action: 'exists', displayName };
    await query(
      `UPDATE jewelheart_volunteers
       SET display_name = $2,
           email = COALESCE(NULLIF(trim($4), ''), email),
           phone = COALESCE(NULLIF(trim($3), ''), phone),
           roster_admin = $5,
           roster_manage = $6,
           updated_at = now()
       WHERE id = $1`,
      [existing.id, displayName, phone, email, rosterAdmin, rosterManage],
    );
    return { id: existing.id, action: 'updated', displayName };
  }

  if (dryRun) return { id: '(new)', action: 'insert', displayName };
  const { rows } = await query(
    `INSERT INTO jewelheart_volunteers (display_name, email, phone, roster_admin, roster_manage)
     VALUES ($1, NULLIF(trim($2), ''), NULLIF(trim($3), ''), $4, $5)
     RETURNING id`,
    [displayName, email, phone, rosterAdmin, rosterManage],
  );
  return { id: rows[0].id, action: 'inserted', displayName };
}

async function linkRetreatVolunteer(retreatId, volunteerId) {
  if (dryRun) return 'link';
  await query(
    `INSERT INTO jewelheart_retreat_volunteers (retreat_id, volunteer_id)
     VALUES ($1, $2)
     ON CONFLICT (retreat_id, volunteer_id) DO NOTHING`,
    [retreatId, volunteerId],
  );
  return 'linked';
}

const people = loadPeopleTestFromXlsx(xlsxPath);
console.log(`Source: ${xlsxPath}`);
console.log(`Rows: ${people.length}${dryRun ? ' (dry-run)' : ''}`);

const retreatId = await resolveRetreatId();
console.log(`Retreat: ${retreatId}`);

const stats = { inserted: 0, updated: 0, exists: 0, linked: 0, skipped: 0, skippedNoContact: 0 };
const seenEmail = new Set();
const seenNameOnly = new Set();

for (const person of people) {
  const emailKey = person.email ? person.email.toLowerCase() : '';
  if (emailKey) {
    if (seenEmail.has(emailKey)) {
      stats.skipped += 1;
      console.log(`  skip duplicate sheet row ${person.rowNum} ${person.displayName} (${person.email})`);
      continue;
    }
    seenEmail.add(emailKey);
  } else {
    const nameKey = person.displayName.toLowerCase();
    if (seenNameOnly.has(nameKey)) {
      stats.skipped += 1;
      console.log(`  skip duplicate sheet row ${person.rowNum} ${person.displayName} (no email)`);
      continue;
    }
    seenNameOnly.add(nameKey);
  }

  const row = await upsertVolunteer(person);
  if (row.action === 'skipped_no_contact') {
    stats.skippedNoContact += 1;
    console.log(`  skip row ${person.rowNum} ${person.displayName} (needs email or phone for self-service login)`);
    continue;
  }
  stats[row.action === 'inserted' ? 'inserted' : row.action === 'updated' ? 'updated' : 'exists'] += 1;

  if (row.id && row.id !== '(new)') {
    await linkRetreatVolunteer(retreatId, row.id);
    stats.linked += 1;
  }
}

const count = await query(`SELECT count(*)::int AS n FROM jewelheart_volunteers`);
const linked = await query(
  `SELECT count(*)::int AS n FROM jewelheart_retreat_volunteers WHERE retreat_id = $1`,
  [retreatId],
);

console.log('\nDone:', stats);
console.log(`jewelheart_volunteers total: ${count.rows[0].n}`);
console.log(`linked to retreat: ${linked.rows[0].n}`);
