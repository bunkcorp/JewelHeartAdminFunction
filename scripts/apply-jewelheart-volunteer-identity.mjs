#!/usr/bin/env node
/**
 * Deploy volunteer identity linking to KarmaDots private-server:
 * - copies jewelheart-volunteer-identity.js + jewelheart-sdui-home.js
 * - patches service.js listRetreats, acl.js read access, routes volunteer profile
 *
 *   JEWELHEART_PRIVATE_SERVER_SRC=~/private-server/src/jewelheart node scripts/apply-jewelheart-volunteer-identity.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const integrationDir = path.join(repoRoot, 'integrations', 'private-server');

const defaultJewelDir = path.resolve(repoRoot, '..', 'buddhist-stone-ios-app', 'private-server', 'src', 'jewelheart');
const jewelDir = process.env.JEWELHEART_PRIVATE_SERVER_SRC || defaultJewelDir;
const serverSrc = path.resolve(jewelDir, '..');

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function copyIfChanged(src, dest) {
  const body = fs.readFileSync(src, 'utf8');
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === body) {
    console.log(`Up to date: ${dest}`);
    return false;
  }
  fs.writeFileSync(dest, body, 'utf8');
  console.log(`Wrote ${dest}`);
  return true;
}

function patchServiceListRetreats() {
  const p = path.join(jewelDir, 'service.js');
  let src = fs.readFileSync(p, 'utf8');
  const importLine = "import { resolveVolunteerIdForAccess } from './jewelheart-volunteer-identity.js';";
  if (!src.includes(importLine)) {
    const anchor = "import * as acl from './acl.js';";
    if (!src.includes(anchor)) die(`service.js: missing anchor ${anchor}`);
    src = src.replace(anchor, `${anchor}\n${importLine}`);
  }

  const oldFn = `export async function listRetreats(firebaseUid, authToken = undefined) {
  const global = (await acl.isGlobalAdmin(firebaseUid)) || acl.isFirebaseAnonymousToken(authToken);
  let sql;
  let params;
  if (global) {
    sql = 'SELECT * FROM jewelheart_retreats ORDER BY created_at DESC';
    params = [];
  } else {
    sql = \`SELECT r.* FROM jewelheart_retreats r
      INNER JOIN jewelheart_retreat_admins a ON a.retreat_id = r.id AND a.firebase_uid = $1
      ORDER BY r.created_at DESC\`;
    params = [firebaseUid];
  }
  const { rows } = await query(sql, params);
  return { items: rows.map(m.mapRetreat), nextCursor: null };
}`;

  const newFn = `export async function listRetreats(firebaseUid, authToken = undefined) {
  const global = (await acl.isGlobalAdmin(firebaseUid)) || acl.isFirebaseAnonymousToken(authToken);
  let sql;
  let params;
  if (global) {
    sql = 'SELECT * FROM jewelheart_retreats ORDER BY created_at DESC';
    params = [];
  } else {
    const volunteerId = await resolveVolunteerIdForAccess(firebaseUid, authToken);
    sql = \`SELECT DISTINCT r.* FROM jewelheart_retreats r
      WHERE EXISTS (
        SELECT 1 FROM jewelheart_retreat_admins a
        WHERE a.retreat_id = r.id AND a.firebase_uid = $1
      )
      OR ($2::uuid IS NOT NULL AND EXISTS (
        SELECT 1 FROM jewelheart_retreat_volunteers rv
        WHERE rv.retreat_id = r.id AND rv.volunteer_id = $2
      ))
      ORDER BY r.start_date DESC NULLS LAST, r.created_at DESC\`;
    params = [firebaseUid, volunteerId];
  }
  const { rows } = await query(sql, params);
  return { items: rows.map(m.mapRetreat), nextCursor: null };
}`;

  if (src.includes(newFn)) {
    console.log('service.js listRetreats already patched.');
  } else if (src.includes(oldFn)) {
    src = src.replace(oldFn, newFn);
    fs.writeFileSync(p, src, 'utf8');
    console.log('Patched service.js listRetreats');
  } else if (src.includes('resolveVolunteerIdForAccess')) {
    console.log('service.js listRetreats appears patched (non-exact match).');
  } else {
    die('service.js: listRetreats block not found — patch manually.');
  }
}

function patchAclReadAccess() {
  const p = path.join(jewelDir, 'acl.js');
  let src = fs.readFileSync(p, 'utf8');
  const importLine = "import { isVolunteerLinkedToRetreat } from './jewelheart-volunteer-identity.js';";
  if (!src.includes(importLine)) {
    const anchor = "import { HttpError } from './errors.js';";
    if (!src.includes(anchor)) die(`acl.js: missing anchor ${anchor}`);
    src = src.replace(anchor, `${importLine}\n${anchor}`);
  }

  const old = `export async function canAccessRetreatRead(firebaseUid, retreatId, authToken) {
  if (isFirebaseAnonymousToken(authToken)) return true;
  return await canAccessRetreat(firebaseUid, retreatId);
}`;

  const neu = `export async function canAccessRetreatRead(firebaseUid, retreatId, authToken) {
  if (isFirebaseAnonymousToken(authToken)) return true;
  if (await canAccessRetreat(firebaseUid, retreatId)) return true;
  return isVolunteerLinkedToRetreat(firebaseUid, retreatId, authToken);
}`;

  if (src.includes(neu)) {
    console.log('acl.js canAccessRetreatRead already patched.');
  } else if (src.includes(old)) {
    src = src.replace(old, neu);
    fs.writeFileSync(p, src, 'utf8');
    console.log('Patched acl.js canAccessRetreatRead');
  } else if (src.includes('isVolunteerLinkedToRetreat')) {
    console.log('acl.js appears patched (non-exact match).');
  } else {
    die('acl.js: canAccessRetreatRead block not found — patch manually.');
  }
}

function patchRoutesVolunteerProfile() {
  const p = path.join(serverSrc, 'routes', 'jewelheart.js');
  let src = fs.readFileSync(p, 'utf8');
  const importLine = "import { findVolunteerByAuth, ensureVolunteerFirebaseUid } from '../jewelheart/jewelheart-volunteer-identity.js';";
  if (!src.includes(importLine)) {
    const anchor = "import * as acl from '../jewelheart/acl.js';";
    if (!src.includes(anchor)) die(`jewelheart routes: missing anchor ${anchor}`);
    src = src.replace(anchor, `${importLine}\n${anchor}`);
  }

  const oldFn = `async function attachJewelheartVolunteerProfile(req, res, next) {
  try {
    const uid = req.uid;
    if (!uid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    let { rows } = await query(\`SELECT id FROM jewelheart_volunteers WHERE firebase_uid = $1 LIMIT 1\`, [uid]);
    if (!rows.length) {
      const email =
        (req.authToken && typeof req.authToken.email === 'string' && req.authToken.email.trim()) ||
        (req.keycloakPayload && typeof req.keycloakPayload.email === 'string' && req.keycloakPayload.email.trim()) ||
        null;
      if (email) {
        const r2 = await query(
          \`SELECT id FROM jewelheart_volunteers WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1\`,
          [email],
        );
        rows = r2.rows;
      }
    }
    if (!rows.length) {
      res.status(403).json({
        error:
          'No volunteer profile is linked to this sign-in. Ask a coordinator to set your volunteer firebase_uid (or a matching email) in JewelHeart.',
      });
      return;
    }
    req.volunteerId = rows[0].id;
    next();
  } catch (e) {
    console.error('attachJewelheartVolunteerProfile', e);
    res.status(500).json({ error: 'Could not resolve volunteer profile' });
  }
}`;

  const newFn = `async function attachJewelheartVolunteerProfile(req, res, next) {
  try {
    const uid = req.uid;
    if (!uid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const volunteer = await findVolunteerByAuth(uid, req.authToken, req.keycloakPayload);
    if (!volunteer) {
      res.status(403).json({
        error:
          'No volunteer profile is linked to this sign-in. Ask a coordinator to add your phone or email to the volunteer roster.',
      });
      return;
    }
    await ensureVolunteerFirebaseUid(volunteer.id, uid);
    req.volunteerId = volunteer.id;
    next();
  } catch (e) {
    console.error('attachJewelheartVolunteerProfile', e);
    res.status(500).json({ error: 'Could not resolve volunteer profile' });
  }
}`;

  if (src.includes('findVolunteerByAuth(uid, req.authToken')) {
    console.log('routes/jewelheart.js volunteer profile already patched.');
  } else if (src.includes(oldFn)) {
    src = src.replace(oldFn, newFn);
    fs.writeFileSync(p, src, 'utf8');
    console.log('Patched routes/jewelheart.js attachJewelheartVolunteerProfile');
  } else {
    die('routes/jewelheart.js: attachJewelheartVolunteerProfile block not found — patch manually.');
  }
}

if (!fs.existsSync(jewelDir)) {
  die(`JewelHeart src not found: ${jewelDir}`);
}

copyIfChanged(
  path.join(integrationDir, 'jewelheart-volunteer-identity.js'),
  path.join(jewelDir, 'jewelheart-volunteer-identity.js'),
);
copyIfChanged(
  path.join(integrationDir, 'jewelheart-sdui-home.js'),
  path.join(jewelDir, 'jewelheart-sdui-home.js'),
);

patchServiceListRetreats();
patchAclReadAccess();
patchRoutesVolunteerProfile();

console.log('Done. Restart private-server so api.karmadots.org picks up volunteer linking.');
