#!/usr/bin/env node

/**
 * deploy-test: push server + web code into TEST (api-test.karmadots.org).
 * Same file set as deploy-dev.mjs but targets private-server-test / karmadots_test.
 *
 *   node scripts/deploy-test.mjs
 *   node scripts/deploy-test.mjs --migrate
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { nyDeployStamp, writeStampedTempCopy } from './deploy/stamp.mjs';
import { buildVolunteerAppHtml, buildVolunteerRedirectHtml } from './build-volunteer-app.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SSH = process.env.JH_SSH || 'karmadots-prod';
const TEST_DIR = process.env.JH_TEST_DIR || 'private-server-test';
const doMigrate = process.argv.includes('--migrate');
const deployStamp = nyDeployStamp();

process.stdout.write(`deploy-test stamp (America/New_York): ${deployStamp}\n`);

function run(cmd, args) {
  process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function scp(localRel, remoteRel) {
  const local = path.join(repoRoot, localRel);
  if (!fs.existsSync(local)) throw new Error(`missing local file: ${local}`);
  run('scp', ['-o', 'BatchMode=yes', local, `${SSH}:${TEST_DIR}/${remoteRel}`]);
}

function scpStamped(localRel, remoteRel, kind) {
  const tmp = writeStampedTempCopy(repoRoot, localRel, kind, deployStamp);
  run('scp', ['-o', 'BatchMode=yes', tmp, `${SSH}:${TEST_DIR}/${remoteRel}`]);
}

scpStamped(
  'integrations/private-server/jewelheart-sdui-home.js',
  'src/jewelheart/jewelheart-sdui-home.js',
  'api',
);

scp('integrations/private-server/jewelheart-shift-checkins.js', 'src/jewelheart/jewelheart-shift-checkins.js');
scp('integrations/private-server/jewelheart-poster-xlsx.js', 'src/jewelheart/jewelheart-poster-xlsx.js');
scp('integrations/private-server/jewelheart-volunteer-invite.fragment.js', 'src/jewelheart/jewelheart-volunteer-invite.js');
scp('integrations/private-server/jewelheart-volunteer-time-context.js', 'src/jewelheart/jewelheart-volunteer-time-context.js');
scp('integrations/private-server/jewelheart-volunteer-onboarding.fragment.js', 'src/jewelheart/jewelheart-volunteer-onboarding.js');
scp('integrations/private-server/jewelheart-volunteer-user-manage.fragment.js', 'src/jewelheart/jewelheart-volunteer-user-manage.js');
scp('shared/jewelheart-auth-identity.js', 'src/jewelheart/jewelheart-auth-identity.js');

scp('scripts/patch-volunteer-invite-route.mjs', 'scripts-inspect/patch-volunteer-invite-route.mjs');
scp('scripts/patch-volunteer-onboarding-route.mjs', 'scripts-inspect/patch-volunteer-onboarding-route.mjs');
scp('scripts/patch-volunteer-user-manage-route.mjs', 'scripts-inspect/patch-volunteer-user-manage-route.mjs');
scp('scripts/patch-volunteer-testing-route.mjs', 'scripts-inspect/patch-volunteer-testing-route.mjs');
scp('scripts/patch-volunteer-env-static.mjs', 'scripts-inspect/patch-volunteer-env-static.mjs');

scp('integrations/private-server/sduiHandlers.fragment.js', 'src/jewelheart/sduiHandlers.js');
scp('scripts/sduiScreens.prod.js', 'src/jewelheart/sduiScreens.js');

scpStamped('scripts/_prod-sdui.js', 'public/login/jewelheart-sdui.js', 'web');

function scpWebAppIcons(remoteRelDir = 'public/login') {
  const files = [
    'apple-touch-icon.png',
    'favicon-32.png',
    'icon-192.png',
    'icon-512.png',
    'manifest.webmanifest',
    'manifest-volunteer.webmanifest',
  ];
  for (const f of files) {
    scp(`assets/web-app/${f}`, `${remoteRelDir}/${f}`);
  }
}

function scpVolunteerWeb() {
  run('ssh', ['-o', 'BatchMode=yes', SSH, `mkdir -p ~/${TEST_DIR}/public/test`]);
  const indexHtml = buildVolunteerAppHtml('test', { mode: 'api', build: deployStamp });
  const indexTmp = path.join(os.tmpdir(), `jh-vol-test-index-${deployStamp}.html`);
  fs.writeFileSync(indexTmp, indexHtml, 'utf8');
  run('scp', ['-o', 'BatchMode=yes', indexTmp, `${SSH}:${TEST_DIR}/public/test/index.html`]);

  const redirectHtml = buildVolunteerRedirectHtml('/test/');
  const redirectTmp = path.join(os.tmpdir(), `jh-vol-redirect-${deployStamp}.html`);
  fs.writeFileSync(redirectTmp, redirectHtml, 'utf8');
  run('scp', ['-o', 'BatchMode=yes', redirectTmp, `${SSH}:${TEST_DIR}/public/login/volunteer.html`]);
}

scpVolunteerWeb();
scpWebAppIcons('public/login');
scp('scripts/_prod-admin.css', 'public/login/jewelheart-admin.css');
scp('scripts/_prod-index.html', 'public/login/index.html');

run('scp', ['-r', '-o', 'BatchMode=yes', path.join(repoRoot, 'migrations'), `${SSH}:${TEST_DIR}/`]);

const engine = path.join(repoRoot, 'scripts', 'deploy', 'jh-deploy.sh');
run('scp', ['-o', 'BatchMode=yes', engine, `${SSH}:jh-deploy.sh`]);
run('ssh', ['-o', 'BatchMode=yes', SSH,
  "tr -d '\\r' < jh-deploy.sh > jh-deploy.norm && mv jh-deploy.norm jh-deploy.sh && chmod +x jh-deploy.sh"]);

const NODE_BIN = process.env.JH_NODE_BIN || '/Users/kevinwoods/.nvm/versions/node/v20.20.0/bin/node';

const steps = [
  `grep -q '^JEWELHEART_VOLUNTEER_LOGIN_URL=' ~/${TEST_DIR}/.env 2>/dev/null || echo 'JEWELHEART_VOLUNTEER_LOGIN_URL=https://api-test.karmadots.org/test/' >> ~/${TEST_DIR}/.env`,
  `grep -q '^JEWELHEART_ACTIVE_RETREAT_ID=' ~/${TEST_DIR}/.env 2>/dev/null || echo 'JEWELHEART_ACTIVE_RETREAT_ID=34d43115-67b3-5fbf-9173-abb051c11ca7' >> ~/${TEST_DIR}/.env`,
  `cd ~/${TEST_DIR} && JEWELHEART_ROUTES_PATH=~/${TEST_DIR}/src/routes/jewelheart.js ${NODE_BIN} scripts-inspect/patch-volunteer-invite-route.mjs || true`,
  `cd ~/${TEST_DIR} && JEWELHEART_ROUTES_PATH=~/${TEST_DIR}/src/routes/jewelheart.js ${NODE_BIN} scripts-inspect/patch-volunteer-onboarding-route.mjs || true`,
  `cd ~/${TEST_DIR} && JEWELHEART_ROUTES_PATH=~/${TEST_DIR}/src/routes/jewelheart.js ${NODE_BIN} scripts-inspect/patch-volunteer-user-manage-route.mjs || true`,
  `cd ~/${TEST_DIR} && JEWELHEART_ROUTES_PATH=~/${TEST_DIR}/src/routes/jewelheart.js ${NODE_BIN} scripts-inspect/patch-volunteer-testing-route.mjs || true`,
  `cd ~/${TEST_DIR} && JH_INDEX_PATH=~/${TEST_DIR}/src/index.js ${NODE_BIN} scripts-inspect/patch-volunteer-env-static.mjs || true`,
  'bash ~/jh-deploy.sh patch-web test',
];

if (doMigrate) steps.push('bash ~/jh-deploy.sh migrate test');

steps.push('bash ~/jh-deploy.sh restart test');

run('ssh', ['-o', 'BatchMode=yes', SSH, steps.join(' && ')]);

process.stdout.write('\ndeploy-test complete -> https://api-test.karmadots.org/test/\n');
