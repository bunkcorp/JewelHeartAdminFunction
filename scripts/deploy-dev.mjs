#!/usr/bin/env node

/**

 * deploy-dev: push the current repo's server + web code into the DEV environment

 * on the laptop (private-server-dev, api-dev.karmadots.org), then restart it.

 *

 * What it deploys:

 *   integrations/private-server/jewelheart-sdui-home.js -> src/jewelheart/jewelheart-sdui-home.js

 *   integrations/private-server/jewelheart-poster-xlsx.js -> src/jewelheart/jewelheart-poster-xlsx.js

 *   scripts/_prod-sdui.js                               -> public/login/jewelheart-sdui.js

 *   scripts/_prod-admin.css                             -> public/login/jewelheart-admin.css

 *   scripts/_prod-index.html                            -> public/login/index.html  (then same-origin patched)

 *   migrations/                                         -> migrations/              (files only; applied with --migrate)

 *

 * Usage:

 *   node scripts/deploy-dev.mjs            # code-only deploy + restart dev

 *   node scripts/deploy-dev.mjs --migrate  # also apply any new migrations to karmadots_dev

 *

 * Config (env vars):

 *   JH_SSH        ssh host alias for the laptop        (default: karmadots-prod)

 *   JH_DEV_DIR    remote dev dir                       (default: private-server-dev)

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

const DEV_DIR = process.env.JH_DEV_DIR || 'private-server-dev';

const doMigrate = process.argv.includes('--migrate');

const deployStamp = nyDeployStamp();



process.stdout.write(`deploy-dev stamp (America/New_York): ${deployStamp}\n`);



function run(cmd, args) {

  process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);

  execFileSync(cmd, args, { stdio: 'inherit' });

}



function scp(localRel, remoteRel) {

  const local = path.join(repoRoot, localRel);

  if (!fs.existsSync(local)) throw new Error(`missing local file: ${local}`);

  run('scp', ['-o', 'BatchMode=yes', local, `${SSH}:${DEV_DIR}/${remoteRel}`]);

}



function scpStamped(localRel, remoteRel, kind) {

  const tmp = writeStampedTempCopy(repoRoot, localRel, kind, deployStamp);

  run('scp', ['-o', 'BatchMode=yes', tmp, `${SSH}:${DEV_DIR}/${remoteRel}`]);

}



// 1) Server SDUI builder + web bundle (stamped at deploy time, EDT/EST)

scpStamped(

  'integrations/private-server/jewelheart-sdui-home.js',

  'src/jewelheart/jewelheart-sdui-home.js',

  'api',

);

scp('integrations/private-server/jewelheart-shift-checkins.js', 'src/jewelheart/jewelheart-shift-checkins.js');

scp('integrations/private-server/jewelheart-poster-xlsx.js', 'src/jewelheart/jewelheart-poster-xlsx.js');

scp('integrations/private-server/jewelheart-volunteer-invite.fragment.js', 'src/jewelheart/jewelheart-volunteer-invite.js');

scpStamped('integrations/private-server/jewelheart-volunteer-time-context.js', 'src/jewelheart/jewelheart-volunteer-time-context.js', 'api');

scp('integrations/private-server/jewelheart-volunteer-onboarding.fragment.js', 'src/jewelheart/jewelheart-volunteer-onboarding.js');

scp('integrations/private-server/jewelheart-volunteer-user-manage.fragment.js', 'src/jewelheart/jewelheart-volunteer-user-manage.js');

scp('integrations/private-server/jewelheart-volunteer-admin-tools.fragment.js', 'src/jewelheart/jewelheart-volunteer-admin-tools.js');

scp('shared/jewelheart-auth-identity.js', 'src/jewelheart/jewelheart-auth-identity.js');

scp('scripts/patch-volunteer-invite-route.mjs', 'scripts-inspect/patch-volunteer-invite-route.mjs');

scp('scripts/patch-volunteer-onboarding-route.mjs', 'scripts-inspect/patch-volunteer-onboarding-route.mjs');

scp('scripts/patch-volunteer-user-manage-route.mjs', 'scripts-inspect/patch-volunteer-user-manage-route.mjs');
scp('scripts/patch-volunteer-admin-tools-route.mjs', 'scripts-inspect/patch-volunteer-admin-tools-route.mjs');
scp('scripts/patch-volunteer-testing-route.mjs', 'scripts-inspect/patch-volunteer-testing-route.mjs');
scp('scripts/clear-assignments.mjs', 'scripts-inspect/clear-assignments.mjs');
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
  run('ssh', ['-o', 'BatchMode=yes', SSH, `mkdir -p ~/${DEV_DIR}/public/dev`]);
  const indexHtml = buildVolunteerAppHtml('dev', { mode: 'api', build: deployStamp });
  const indexTmp = path.join(os.tmpdir(), `jh-vol-dev-index-${deployStamp}.html`);
  fs.writeFileSync(indexTmp, indexHtml, 'utf8');
  run('scp', ['-o', 'BatchMode=yes', indexTmp, `${SSH}:${DEV_DIR}/public/dev/index.html`]);

  const redirectHtml = buildVolunteerRedirectHtml('/dev/');
  const redirectTmp = path.join(os.tmpdir(), `jh-vol-redirect-${deployStamp}.html`);
  fs.writeFileSync(redirectTmp, redirectHtml, 'utf8');
  run('scp', ['-o', 'BatchMode=yes', redirectTmp, `${SSH}:${DEV_DIR}/public/login/volunteer.html`]);
}

scpVolunteerWeb();

scpWebAppIcons('public/login');

scp('scripts/_prod-admin.css', 'public/login/jewelheart-admin.css');

scp('scripts/_prod-index.html', 'public/login/index.html');



// 2) Migrations (copy files only; applied separately with --migrate)

run('scp', ['-r', '-o', 'BatchMode=yes', path.join(repoRoot, 'migrations'), `${SSH}:${DEV_DIR}/`]);



// 3) Ship the engine and run patch-web + (optional) migrate + restart on the laptop

scpEngine();

const NODE_BIN = process.env.JH_NODE_BIN || '/Users/kevinwoods/.nvm/versions/node/v20.20.0/bin/node';



const steps = [

  `grep -q '^JEWELHEART_VOLUNTEER_LOGIN_URL=' ~/${DEV_DIR}/.env 2>/dev/null || echo 'JEWELHEART_VOLUNTEER_LOGIN_URL=https://api-dev.karmadots.org/dev/' >> ~/${DEV_DIR}/.env`,

  `grep -q '^JEWELHEART_ACTIVE_RETREAT_ID=' ~/${DEV_DIR}/.env 2>/dev/null || echo 'JEWELHEART_ACTIVE_RETREAT_ID=34d43115-67b3-5fbf-9173-abb051c11ca7' >> ~/${DEV_DIR}/.env`,

  `cd ~/${DEV_DIR} && JEWELHEART_ROUTES_PATH=~/${DEV_DIR}/src/routes/jewelheart.js ${NODE_BIN} scripts-inspect/patch-volunteer-invite-route.mjs || true`,

  `cd ~/${DEV_DIR} && JEWELHEART_ROUTES_PATH=~/${DEV_DIR}/src/routes/jewelheart.js ${NODE_BIN} scripts-inspect/patch-volunteer-onboarding-route.mjs || true`,

  `cd ~/${DEV_DIR} && JEWELHEART_ROUTES_PATH=~/${DEV_DIR}/src/routes/jewelheart.js ${NODE_BIN} scripts-inspect/patch-volunteer-user-manage-route.mjs || true`,

  `cd ~/${DEV_DIR} && JEWELHEART_ROUTES_PATH=~/${DEV_DIR}/src/routes/jewelheart.js ${NODE_BIN} scripts-inspect/patch-volunteer-admin-tools-route.mjs || true`,

  `cd ~/${DEV_DIR} && JEWELHEART_ROUTES_PATH=~/${DEV_DIR}/src/routes/jewelheart.js ${NODE_BIN} scripts-inspect/patch-volunteer-testing-route.mjs || true`,

  `cd ~/${DEV_DIR} && JH_INDEX_PATH=~/${DEV_DIR}/src/index.js ${NODE_BIN} scripts-inspect/patch-volunteer-env-static.mjs || true`,

  'bash ~/jh-deploy.sh patch-web dev',

];

if (doMigrate) steps.push('bash ~/jh-deploy.sh migrate dev');

steps.push('bash ~/jh-deploy.sh restart dev');

run('ssh', ['-o', 'BatchMode=yes', SSH, steps.join(' && ')]);



process.stdout.write('\ndeploy-dev complete -> https://api-dev.karmadots.org/dev/\n');



function scpEngine() {

  const engine = path.join(repoRoot, 'scripts', 'deploy', 'jh-deploy.sh');

  if (!fs.existsSync(engine)) throw new Error(`missing engine: ${engine}`);

  run('scp', ['-o', 'BatchMode=yes', engine, `${SSH}:jh-deploy.sh`]);

  // Normalize CRLF -> LF (file authored on Windows) and make executable.

  run('ssh', ['-o', 'BatchMode=yes', SSH,

    "tr -d '\\r' < jh-deploy.sh > jh-deploy.norm && mv jh-deploy.norm jh-deploy.sh && chmod +x jh-deploy.sh"]);

}

