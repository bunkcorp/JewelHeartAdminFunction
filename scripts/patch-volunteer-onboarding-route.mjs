#!/usr/bin/env node
/**
 * Wire volunteer onboarding routes into private-server routes/jewelheart.js.
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

if (!src.includes('jewelheart-volunteer-onboarding')) {
  const importAnchor = "import { HttpError } from '../jewelheart/errors.js';";
  if (!src.includes(importAnchor)) throw new Error('import anchor not found');
  src = src.replace(
    importAnchor,
    `${importAnchor}\nimport { createJewelHeartVolunteerOnboardingHandlers } from '../jewelheart/jewelheart-volunteer-onboarding.js';`,
  );
  console.log('added onboarding import');
}

const factoryBlock =
  'const volunteerOnboardingHandlers = createJewelHeartVolunteerOnboardingHandlers({ query });\n';

if (!src.includes('volunteerOnboardingHandlers')) {
  const factoryAnchor = 'const volunteerUserManageHandlers = createJewelHeartVolunteerUserManageHandlers({ query });';
  if (src.includes(factoryAnchor)) {
    src = src.replace(factoryAnchor, `${factoryAnchor}\n${factoryBlock}`);
  } else {
    const routerAnchor = 'const router = Router();';
    if (!src.includes(routerAnchor)) throw new Error('router anchor not found');
    src = src.replace(routerAnchor, `${routerAnchor}\n${factoryBlock}`);
  }
  console.log('added onboarding handler factory');
}

const routes = `router.post('/volunteer/bootstrap', volunteerOnboardingHandlers.postBootstrap);
router.get('/volunteer/onboarding', volunteerOnboardingHandlers.getOnboarding);
router.post('/volunteer/onboarding/send-otp', volunteerOnboardingHandlers.postSendOtp);
router.post('/volunteer/onboarding/verify-otp', volunteerOnboardingHandlers.postVerifyOtp);
router.post('/volunteer/onboarding/complete', volunteerOnboardingHandlers.postComplete);
`;

if (!src.includes("router.post('/volunteer/bootstrap'")) {
  const anchor = "router.get('/volunteer/session', volunteerInviteHandlers.getVolunteerSession);";
  if (src.includes(anchor)) {
    src = src.replace(anchor, `${routes}${anchor}`);
  } else {
    const authAnchor = 'router.use(requireAuthDual);';
    if (!src.includes(authAnchor)) throw new Error('requireAuthDual anchor not found');
    src = src.replace(authAnchor, `${authAnchor}\n\n${routes}`);
  }
  console.log('added onboarding routes');
}

if (src === orig) {
  console.log('already wired; no change');
} else {
  fs.writeFileSync(PATH, src, 'utf8');
  console.log('wrote', PATH);
}
