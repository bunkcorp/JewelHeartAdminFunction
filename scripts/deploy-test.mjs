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

import { nyDeployStamp, writeStampedTempCopy } from './deploy/stamp.mjs';



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

scp('shared/jewelheart-auth-identity.js', 'src/jewelheart/jewelheart-auth-identity.js');

scp('scripts/patch-volunteer-invite-route.mjs', 'scripts-inspect/patch-volunteer-invite-route.mjs');

scp('scripts/sduiScreens.prod.js', 'src/jewelheart/sduiScreens.js');



run('scp', ['-r', '-o', 'BatchMode=yes', path.join(repoRoot, 'migrations'), `${SSH}:${TEST_DIR}/`]);



const engine = path.join(repoRoot, 'scripts', 'deploy', 'jh-deploy.sh');

run('scp', ['-o', 'BatchMode=yes', engine, `${SSH}:jh-deploy.sh`]);

run('ssh', ['-o', 'BatchMode=yes', SSH,

  "tr -d '\\r' < jh-deploy.sh > jh-deploy.norm && mv jh-deploy.norm jh-deploy.sh && chmod +x jh-deploy.sh"]);



const NODE_BIN = process.env.JH_NODE_BIN || '/Users/kevinwoods/.nvm/versions/node/v20.20.0/bin/node';



const steps = [

  `cd ~/${TEST_DIR} && JEWELHEART_ROUTES_PATH=~/${TEST_DIR}/src/routes/jewelheart.js ${NODE_BIN} scripts-inspect/patch-volunteer-invite-route.mjs || true`,

];

if (doMigrate) steps.push('bash ~/jh-deploy.sh migrate test');

steps.push('bash ~/jh-deploy.sh restart test');

run('ssh', ['-o', 'BatchMode=yes', SSH, steps.join(' && ')]);



process.stdout.write('\ndeploy-test complete -> https://api-test.karmadots.org/jewelheart\n');

