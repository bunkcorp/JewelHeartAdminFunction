#!/usr/bin/env node
/**
 * Wire admin-only volunteer tools routes into private-server routes/jewelheart.js.
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

if (!src.includes('jewelheart-volunteer-admin-tools')) {
  const importAnchor = "import { HttpError } from '../jewelheart/errors.js';";
  if (!src.includes(importAnchor)) throw new Error('import anchor not found');
  src = src.replace(
    importAnchor,
    `${importAnchor}\nimport { createJewelHeartVolunteerAdminToolsHandlers } from '../jewelheart/jewelheart-volunteer-admin-tools.js';`,
  );
  console.log('added admin-tools import');
}

const factoryBlock =
  'const volunteerAdminToolsHandlers = createJewelHeartVolunteerAdminToolsHandlers({ query });\n';

if (!src.includes('volunteerAdminToolsHandlers')) {
  const factoryAnchor = 'const volunteerUserManageHandlers = createJewelHeartVolunteerUserManageHandlers({ query });';
  if (src.includes(factoryAnchor)) {
    src = src.replace(factoryAnchor, `${factoryAnchor}\n${factoryBlock}`);
  } else {
    const routerAnchor = 'const router = Router();';
    if (!src.includes(routerAnchor)) throw new Error('router anchor not found');
    src = src.replace(routerAnchor, `${routerAnchor}\n${factoryBlock}`);
  }
  console.log('added admin-tools handler factory');
}

const routes = `router.get('/retreats/:retreatId/volunteers/:volunteerId/privileges', volunteerAdminToolsHandlers.getPrivileges);
router.put('/retreats/:retreatId/volunteers/:volunteerId/privileges', volunteerAdminToolsHandlers.putPrivileges);
router.get('/retreats/:retreatId/admin/assignments-summary', volunteerAdminToolsHandlers.getAssignmentsSummary);
router.post('/retreats/:retreatId/admin/clear-assignments', volunteerAdminToolsHandlers.postClearAssignments);
router.post('/retreats/:retreatId/admin/reload-poster-data', volunteerAdminToolsHandlers.postReloadPosterData);
`;

if (!src.includes("router.get('/retreats/:retreatId/volunteers/:volunteerId/privileges'")) {
  const anchor = "router.post('/retreats/:retreatId/volunteers/:volunteerId/reset-onboarding', volunteerUserManageHandlers.postResetOnboarding);";
  if (src.includes(anchor)) {
    src = src.replace(anchor, `${anchor}\n${routes}`);
  } else {
    const authAnchor = 'router.use(requireAuthDual);';
    if (!src.includes(authAnchor)) throw new Error('requireAuthDual anchor not found');
    src = src.replace(authAnchor, `${authAnchor}\n\n${routes}`);
  }
  console.log('added admin-tools routes');
}

if (!src.includes("router.post('/retreats/:retreatId/admin/reload-poster-data'")) {
  const anchor = "router.post('/retreats/:retreatId/admin/clear-assignments', volunteerAdminToolsHandlers.postClearAssignments);";
  if (src.includes(anchor)) {
    src = src.replace(
      anchor,
      `${anchor}\nrouter.post('/retreats/:retreatId/admin/reload-poster-data', volunteerAdminToolsHandlers.postReloadPosterData);`,
    );
    console.log('added reload-poster-data route');
  }
}

if (src === orig) {
  console.log('already wired; no change');
} else {
  fs.writeFileSync(PATH, src, 'utf8');
  console.log('wrote', PATH);
}
