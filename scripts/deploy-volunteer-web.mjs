#!/usr/bin/env node
/**
 * Deploy volunteer web app to karmadots.org Pages paths and/or API servers.
 *
 * URLs (after Pages push):
 *   https://karmadots.org/dev/
 *   https://karmadots.org/test/
 *   https://karmadots.org/retreat/
 *
 * API mirrors (when --remote):
 *   https://api-dev.karmadots.org/dev/
 *   https://api-test.karmadots.org/test/
 *   https://api.karmadots.org/retreat/
 *
 * Usage:
 *   node scripts/deploy-volunteer-web.mjs                    # stage pages-deploy only
 *   node scripts/deploy-volunteer-web.mjs --env dev          # one env
 *   node scripts/deploy-volunteer-web.mjs --env all --remote # scp to API servers
 *   node scripts/deploy-volunteer-web.mjs --push             # commit+push Pages repo
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VOLUNTEER_ENVS,
  buildVolunteerAppHtml,
  buildVolunteerManifest,
  buildVolunteerRedirectHtml,
} from './build-volunteer-app.mjs';
import { nyDeployStamp, stampWebSduiSource } from './deploy/stamp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const doPush = args.includes('--push');
const doRemote = args.includes('--remote');
const envArg = args.find((a) => a.startsWith('--env='))?.split('=')[1]
  || (args.includes('--env') ? args[args.indexOf('--env') + 1] : 'all');

const SSH = process.env.JH_SSH || 'karmadots-prod';

const defaultPagesRepo =
  process.platform === 'win32'
    ? path.join('C:', 'Users', os.userInfo().username, 'buddhist-stone-ios-app')
    : path.join(os.homedir(), 'buddhist-stone-ios-app');

const pagesRepo = process.env.JH_PAGES_REPO || defaultPagesRepo;
const pagesBranch = process.env.JH_PAGES_BRANCH || 'working-branch';
const build = nyDeployStamp();

/** @type {Array<'dev'|'test'|'retreat'>} */
const envs =
  envArg === 'all' ? ['dev', 'test', 'retreat'] : [/** @type {'dev'|'test'|'retreat'} */ (envArg)];

function run(cmd, runArgs, opts = {}) {
  process.stdout.write(`$ ${cmd} ${runArgs.join(' ')}\n`);
  execFileSync(cmd, runArgs, { stdio: 'inherit', ...opts });
}

function copyFile(srcRel, destAbs) {
  const src = path.join(repoRoot, srcRel);
  if (!fs.existsSync(src)) throw new Error(`missing: ${src}`);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(src, destAbs);
}

function writeStampedSdui(destAbs) {
  const src = fs.readFileSync(path.join(repoRoot, 'scripts', '_prod-sdui.js'), 'utf8');
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.writeFileSync(destAbs, stampWebSduiSource(src, build), 'utf8');
}

function copyWebAppIcons(destDir, manifestJson) {
  const files = [
    'apple-touch-icon.png',
    'favicon-32.png',
    'icon-192.png',
    'icon-512.png',
  ];
  for (const f of files) {
    copyFile(`assets/web-app/${f}`, path.join(destDir, f));
  }
  fs.writeFileSync(
    path.join(destDir, 'manifest-volunteer.webmanifest'),
    `${JSON.stringify(manifestJson, null, 2)}\n`,
    'utf8',
  );
}

function deployPagesDir(env) {
  const cfg = VOLUNTEER_ENVS[env];
  const destDir = path.join(repoRoot, 'pages-deploy', 'docs', cfg.path);
  const indexHtml = buildVolunteerAppHtml(env, { mode: 'pages', build });
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, 'index.html'), indexHtml, 'utf8');
  writeStampedSdui(path.join(destDir, 'jewelheart-sdui.js'));
  copyFile('scripts/_prod-admin.css', path.join(destDir, 'jewelheart-admin.css'));
  copyWebAppIcons(destDir, buildVolunteerManifest(env, 'pages'));
  process.stdout.write(`  pages -> ${destDir} (${cfg.pagesUrl})\n`);
  return destDir;
}

function scpToRemote(localAbs, remoteRel, remoteDir) {
  run('scp', ['-o', 'BatchMode=yes', localAbs, `${SSH}:${remoteDir}/${remoteRel}`]);
}

function deployRemoteEnv(env) {
  const cfg = VOLUNTEER_ENVS[env];
  const remoteDir = cfg.remoteDir;
  run('ssh', ['-o', 'BatchMode=yes', SSH, `mkdir -p ~/${remoteDir}/public/${cfg.path}`]);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `jh-vol-${env}-`));
  const indexHtml = buildVolunteerAppHtml(env, { mode: 'api', build });
  const indexPath = path.join(tmpDir, 'index.html');
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  scpToRemote(indexPath, `public/${cfg.path}/index.html`, remoteDir);

  if (env === 'dev') {
    const redirectPath = path.join(tmpDir, 'volunteer-redirect.html');
    fs.writeFileSync(redirectPath, buildVolunteerRedirectHtml('/dev/'), 'utf8');
    scpToRemote(redirectPath, 'public/login/volunteer.html', remoteDir);
  }

  // Shared /login/manifest is what /retreat/ (and siblings) link for Add to Home Screen / PWA.
  // Keep prod's start_url on /retreat/ (not legacy volunteer.html).
  if (env === 'retreat') {
    const manifestPath = path.join(tmpDir, 'manifest-volunteer.webmanifest');
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(buildVolunteerManifest(env, 'api'), null, 2)}\n`,
      'utf8',
    );
    run('ssh', ['-o', 'BatchMode=yes', SSH, `mkdir -p ~/${remoteDir}/public/login`]);
    scpToRemote(manifestPath, 'public/login/manifest-volunteer.webmanifest', remoteDir);
  }

  process.stdout.write(`  api   -> ${cfg.loginUrl} (${remoteDir})\n`);
}

function pushPages(envsToPush) {
  const paths = envsToPush.flatMap((env) => {
    const p = VOLUNTEER_ENVS[env].path;
    return [
      `docs/${p}/index.html`,
      `docs/${p}/jewelheart-sdui.js`,
      `docs/${p}/jewelheart-admin.css`,
      `docs/${p}/manifest-volunteer.webmanifest`,
      `docs/${p}/favicon-32.png`,
      `docs/${p}/apple-touch-icon.png`,
      `docs/${p}/icon-192.png`,
      `docs/${p}/icon-512.png`,
    ];
  });

  if (!fs.existsSync(path.join(pagesRepo, '.git'))) {
    process.stdout.write(`Pages repo not found at ${pagesRepo} — staged only under pages-deploy/docs/\n`);
    return;
  }

  run('git', ['-C', pagesRepo, 'fetch', 'origin']);
  run('git', ['-C', pagesRepo, 'checkout', pagesBranch]);
  run('git', ['-C', pagesRepo, 'pull', '--ff-only', 'origin', pagesBranch]);

  for (const env of envsToPush) {
    const cfg = VOLUNTEER_ENVS[env];
    const staging = path.join(repoRoot, 'pages-deploy', 'docs', cfg.path);
    const dest = path.join(pagesRepo, 'docs', cfg.path);
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(staging)) {
      fs.copyFileSync(path.join(staging, name), path.join(dest, name));
    }
  }

  run('git', ['-C', pagesRepo, 'add', ...paths]);
  try {
    execFileSync('git', ['-C', pagesRepo, 'diff', '--cached', '--quiet']);
    process.stdout.write('No changes to commit on Pages repo.\n');
    return;
  } catch {
    /* staged changes */
  }
  const msg = `Deploy volunteer web (${envsToPush.join(', ')}, web ${build}).`;
  run('git', ['-C', pagesRepo, 'commit', '-m', msg]);
  run('git', ['-C', pagesRepo, 'push', 'origin', pagesBranch]);
}

process.stdout.write(`deploy-volunteer-web (web ${build}, envs: ${envs.join(', ')})\n`);

for (const env of envs) {
  if (!VOLUNTEER_ENVS[env]) {
    process.stderr.write(`unknown env: ${env}\n`);
    process.exit(1);
  }
  deployPagesDir(env);
  if (doRemote) deployRemoteEnv(env);
}

if (doPush) pushPages(envs);

process.stdout.write('\nVolunteer URLs:\n');
for (const env of envs) {
  const cfg = VOLUNTEER_ENVS[env];
  process.stdout.write(`  ${cfg.pagesUrl}\n`);
  process.stdout.write(`  ${cfg.loginUrl}\n`);
}
process.stdout.write('\ndeploy-volunteer-web complete\n');
