#!/usr/bin/env node
/**
 * Idempotently wire volunteer invite routes into private-server routes/jewelheart.js.
 * Run on laptop: node scripts-inspect/patch-volunteer-invite-route.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function resolveRoutesPath() {
  if (process.env.JEWELHEART_ROUTES_PATH) {
    return path.resolve(process.env.JEWELHEART_ROUTES_PATH);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../src/routes/jewelheart.js'),
    path.resolve(process.env.HOME || '', 'private-server-dev/src/routes/jewelheart.js'),
    path.resolve(process.env.HOME || '', 'private-server-test/src/routes/jewelheart.js'),
    path.resolve(process.env.HOME || '', 'private-server/src/routes/jewelheart.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('jewelheart.js routes file not found; set JEWELHEART_ROUTES_PATH');
}

const PATH = resolveRoutesPath();
let src = fs.readFileSync(PATH, 'utf8');
const orig = src;

if (!src.includes('jewelheart-volunteer-invite')) {
  const importAnchor = "import { HttpError } from '../jewelheart/errors.js';";
  if (!src.includes(importAnchor)) throw new Error('import anchor not found');
  src = src.replace(
    importAnchor,
    `${importAnchor}\nimport { createJewelHeartVolunteerInviteHandlers } from '../jewelheart/jewelheart-volunteer-invite.js';`,
  );
  console.log('added invite import');
}

const factoryBlock = `const volunteerInviteHandlers = createJewelHeartVolunteerInviteHandlers({ query });\n`;

if (!src.includes('volunteerInviteHandlers')) {
  const factoryAnchor = 'const router = Router();';
  if (!src.includes(factoryAnchor)) throw new Error('router anchor not found');
  src = src.replace(factoryAnchor, `${factoryAnchor}\n${factoryBlock}`);
  console.log('added invite handler factory');
}

const publicRoute = "router.get('/invites/:token/preview', volunteerInviteHandlers.getInvitePreview);";
if (!src.includes(publicRoute)) {
  const publicAnchor = 'router.use(requireAuthDual);';
  if (!src.includes(publicAnchor)) throw new Error('requireAuthDual anchor not found');
  src = src.replace(publicAnchor, `${publicRoute}\n\n${publicAnchor}`);
  console.log('added public invite preview route');
}

const authRoutes = `router.post('/invites/redeem', volunteerInviteHandlers.postInviteRedeem);
router.get('/volunteer/session', volunteerInviteHandlers.getVolunteerSession);
router.patch('/volunteer/me', volunteerInviteHandlers.patchVolunteerMe);
router.post('/retreats/:retreatId/volunteers/:volunteerId/invite', volunteerInviteHandlers.postMintVolunteerInvite);
`;

const meRoute = "router.patch('/volunteer/me', volunteerInviteHandlers.patchVolunteerMe);";
if (!src.includes(meRoute)) {
  const anchor = "router.get('/volunteer/session', volunteerInviteHandlers.getVolunteerSession);";
  if (src.includes(anchor)) {
    src = src.replace(anchor, `${anchor}\n${meRoute}`);
    console.log('added PATCH volunteer/me route');
  } else if (src.includes("router.use(requireAuthDual);")) {
    src = src.replace(
      "router.use(requireAuthDual);",
      `router.use(requireAuthDual);\n\n${meRoute}`,
    );
    console.log('added PATCH volunteer/me route (fallback anchor)');
  } else {
    throw new Error('volunteer/me route anchor not found');
  }
}

if (!src.includes("router.post('/invites/redeem'")) {
  const authAnchor = 'router.use(requireAuthDual);';
  if (!src.includes(authAnchor)) throw new Error('requireAuthDual anchor not found');
  src = src.replace(authAnchor, `${authAnchor}\n\n${authRoutes}`);
  console.log('added authenticated invite routes');
}

if (src === orig) {
  console.log('already wired; no change');
} else {
  fs.writeFileSync(PATH, src, 'utf8');
  console.log('wrote', PATH);
}
