#!/usr/bin/env node
/**
 * Wire volunteer user-management routes into private-server routes/jewelheart.js.
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

if (!src.includes('jewelheart-volunteer-user-manage')) {
  const importAnchor = "import { HttpError } from '../jewelheart/errors.js';";
  if (!src.includes(importAnchor)) throw new Error('import anchor not found');
  src = src.replace(
    importAnchor,
    `${importAnchor}\nimport { createJewelHeartVolunteerUserManageHandlers } from '../jewelheart/jewelheart-volunteer-user-manage.js';`,
  );
  console.log('added user-manage import');
}

const factoryBlock =
  'const volunteerUserManageHandlers = createJewelHeartVolunteerUserManageHandlers({ query });\n';

if (!src.includes('volunteerUserManageHandlers')) {
  const factoryAnchor = 'const volunteerInviteHandlers = createJewelHeartVolunteerInviteHandlers({ query });';
  if (src.includes(factoryAnchor)) {
    src = src.replace(factoryAnchor, `${factoryAnchor}\n${factoryBlock}`);
  } else {
    const routerAnchor = 'const router = Router();';
    if (!src.includes(routerAnchor)) throw new Error('router anchor not found');
    src = src.replace(routerAnchor, `${routerAnchor}\n${factoryBlock}`);
  }
  console.log('added user-manage handler factory');
}

const routes = `router.get('/retreats/:retreatId/volunteers/:volunteerId/user-access', volunteerUserManageHandlers.getUserAccess);
router.post('/retreats/:retreatId/volunteers/:volunteerId/unlink-auth', volunteerUserManageHandlers.postUnlinkAuth);
router.post('/retreats/:retreatId/volunteers/:volunteerId/reset-onboarding', volunteerUserManageHandlers.postResetOnboarding);
`;

if (!src.includes("router.get('/retreats/:retreatId/volunteers/:volunteerId/user-access'")) {
  const anchor = "router.post('/retreats/:retreatId/volunteers/:volunteerId/invite', volunteerInviteHandlers.postMintVolunteerInvite);";
  if (src.includes(anchor)) {
    src = src.replace(anchor, `${anchor}\n${routes}`);
  } else {
    const authAnchor = 'router.use(requireAuthDual);';
    if (!src.includes(authAnchor)) throw new Error('requireAuthDual anchor not found');
    src = src.replace(authAnchor, `${authAnchor}\n\n${routes}`);
  }
  console.log('added user-manage routes');
}

const resetRoute =
  "router.post('/retreats/:retreatId/volunteers/:volunteerId/reset-onboarding', volunteerUserManageHandlers.postResetOnboarding);";
if (!src.includes(resetRoute)) {
  const anchor = "router.post('/retreats/:retreatId/volunteers/:volunteerId/unlink-auth', volunteerUserManageHandlers.postUnlinkAuth);";
  if (src.includes(anchor)) {
    src = src.replace(anchor, `${anchor}\n${resetRoute}`);
    console.log('added reset-onboarding route');
  }
}

if (src === orig) {
  console.log('already wired; no change');
} else {
  fs.writeFileSync(PATH, src, 'utf8');
  console.log('wrote', PATH);
}
