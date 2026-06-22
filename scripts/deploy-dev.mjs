#!/usr/bin/env node
/**
 * deploy-dev: push the current repo's server + web code into the DEV environment
 * on the laptop (private-server-dev, api-dev.karmadots.org), then restart it.
 *
 * What it deploys:
 *   integrations/private-server/jewelheart-sdui-home.js -> src/jewelheart/jewelheart-sdui-home.js
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SSH = process.env.JH_SSH || 'karmadots-prod';
const DEV_DIR = process.env.JH_DEV_DIR || 'private-server-dev';
const doMigrate = process.argv.includes('--migrate');

function run(cmd, args) {
  process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function scp(localRel, remoteRel) {
  const local = path.join(repoRoot, localRel);
  if (!fs.existsSync(local)) throw new Error(`missing local file: ${local}`);
  run('scp', ['-o', 'BatchMode=yes', local, `${SSH}:${DEV_DIR}/${remoteRel}`]);
}

// 1) Server SDUI builder + web bundle
scp('integrations/private-server/jewelheart-sdui-home.js', 'src/jewelheart/jewelheart-sdui-home.js');
scp('scripts/_prod-sdui.js', 'public/login/jewelheart-sdui.js');
scp('scripts/_prod-admin.css', 'public/login/jewelheart-admin.css');
scp('scripts/_prod-index.html', 'public/login/index.html');

// 2) Migrations (copy files only; applied separately with --migrate)
run('scp', ['-r', '-o', 'BatchMode=yes', path.join(repoRoot, 'migrations'), `${SSH}:${DEV_DIR}/`]);

// 3) Ship the engine and run patch-web + (optional) migrate + restart on the laptop
scpEngine();
const steps = ['bash ~/jh-deploy.sh patch-web dev'];
if (doMigrate) steps.push('bash ~/jh-deploy.sh migrate dev');
steps.push('bash ~/jh-deploy.sh restart dev');
run('ssh', ['-o', 'BatchMode=yes', SSH, steps.join(' && ')]);

process.stdout.write('\ndeploy-dev complete -> https://api-dev.karmadots.org/login\n');

function scpEngine() {
  const engine = path.join(repoRoot, 'scripts', 'deploy', 'jh-deploy.sh');
  if (!fs.existsSync(engine)) throw new Error(`missing engine: ${engine}`);
  run('scp', ['-o', 'BatchMode=yes', engine, `${SSH}:jh-deploy.sh`]);
  // Normalize CRLF -> LF (file authored on Windows) and make executable.
  run('ssh', ['-o', 'BatchMode=yes', SSH,
    "tr -d '\\r' < jh-deploy.sh > jh-deploy.norm && mv jh-deploy.norm jh-deploy.sh && chmod +x jh-deploy.sh"]);
}
