#!/usr/bin/env node
/**
 * Wire volunteer testing / time-context routes into private-server routes/jewelheart.js.
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

if (!src.includes('jewelheart-volunteer-time-context')) {
  const importAnchor = "import { HttpError } from '../jewelheart/errors.js';";
  if (!src.includes(importAnchor)) throw new Error('import anchor not found');
  src = src.replace(
    importAnchor,
    `${importAnchor}\nimport { createJewelHeartVolunteerTestingHandlers } from '../jewelheart/jewelheart-volunteer-time-context.js';`,
  );
  console.log('added testing import');
}

const factoryBlock =
  'const volunteerTestingHandlers = createJewelHeartVolunteerTestingHandlers({ query });\n';

if (!src.includes('volunteerTestingHandlers')) {
  const factoryAnchor = 'const volunteerOnboardingHandlers = createJewelHeartVolunteerOnboardingHandlers({ query });';
  if (src.includes(factoryAnchor)) {
    src = src.replace(factoryAnchor, `${factoryAnchor}\n${factoryBlock}`);
  } else {
    const routerAnchor = 'const router = Router();';
    if (!src.includes(routerAnchor)) throw new Error('router anchor not found');
    src = src.replace(routerAnchor, `${routerAnchor}\n${factoryBlock}`);
  }
  console.log('added testing handler factory');
}

const publicRoute =
  "router.get('/volunteer/time-context', volunteerTestingHandlers.getTimeContext);";
const authRoutes = `router.get('/volunteer/testing-settings', volunteerTestingHandlers.getSettings);
router.put('/volunteer/testing-settings', volunteerTestingHandlers.putSettings);
`;

if (!src.includes("router.get('/volunteer/time-context'")) {
  const publicAnchor = "router.post('/volunteer/bootstrap', volunteerOnboardingHandlers.postBootstrap);";
  if (src.includes(publicAnchor)) {
    src = src.replace(publicAnchor, `${publicRoute}\n${publicAnchor}`);
  } else {
    const sessionAnchor = "router.get('/volunteer/session', volunteerInviteHandlers.getVolunteerSession);";
    if (src.includes(sessionAnchor)) {
      src = src.replace(sessionAnchor, `${publicRoute}\n${sessionAnchor}`);
    }
  }
  console.log('added public time-context route');
}

if (!src.includes("router.get('/volunteer/testing-settings'")) {
  const authAnchor = 'router.use(requireAuthDual);';
  if (!src.includes(authAnchor)) throw new Error('requireAuthDual anchor not found');
  src = src.replace(authAnchor, `${authAnchor}\n\n${authRoutes}`);
  console.log('added auth testing-settings routes');
}

if (src === orig) {
  console.log('already wired; no change');
} else {
  fs.writeFileSync(PATH, src, 'utf8');
  console.log('wrote', PATH);
}
