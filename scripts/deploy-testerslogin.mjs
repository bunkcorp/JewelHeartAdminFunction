#!/usr/bin/env node
/**
 * Deploy volunteer-only testerslogin static assets.
 * Live URL: https://karmadots.org/testerslogin/
 * GitHub Pages branch: working-branch (not main)
 *
 * Copies:
 *   scripts/_testers-index.html  -> index.html
 *   scripts/_prod-sdui.js        -> jewelheart-sdui.js
 *   scripts/_prod-admin.css      -> jewelheart-admin.css
 *
 * Targets (in order):
 *   1. pages-deploy/docs/testerslogin/  (staging in this repo)
 *   2. JH_PAGES_REPO/docs/testerslogin/ (bunkcorp/buddhist-stone-ios-app for GitHub Pages)
 *
 * Usage:
 *   node scripts/deploy-testerslogin.mjs          # copy files only
 *   node scripts/deploy-testerslogin.mjs --push   # copy + commit + push working-branch on Pages repo
 *
 * Config:
 *   JH_PAGES_REPO    path to buddhist-stone-ios-app clone
 *   JH_PAGES_BRANCH  GitHub Pages branch (default: working-branch)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nyDeployStamp, stampWebSduiSource } from './deploy/stamp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const doPush = process.argv.includes('--push');

const defaultPagesRepo =
  process.platform === 'win32'
    ? path.join('C:', 'Users', os.userInfo().username, 'buddhist-stone-ios-app')
    : path.join(os.homedir(), 'buddhist-stone-ios-app');

const pagesRepo = process.env.JH_PAGES_REPO || defaultPagesRepo;

const pagesBranch = process.env.JH_PAGES_BRANCH || 'working-branch';

function readWebBuild() {
  return nyDeployStamp();
}

function buildIndexHtml(build) {
  const tpl = fs.readFileSync(path.join(repoRoot, 'scripts', '_testers-index.html'), 'utf8');
  return tpl.replaceAll('__JH_WEB_BUILD__', build);
}

function copyFile(srcRel, destAbs) {
  const src = path.join(repoRoot, srcRel);
  if (!fs.existsSync(src)) throw new Error(`missing: ${src}`);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(src, destAbs);
}

function writeIndex(destDir, indexHtml) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, 'index.html'), indexHtml, 'utf8');
}

function writeStampedSdui(destAbs, stamp) {
  const src = fs.readFileSync(path.join(repoRoot, 'scripts', '_prod-sdui.js'), 'utf8');
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.writeFileSync(destAbs, stampWebSduiSource(src, stamp), 'utf8');
}

function copyWebAppIcons(destDir) {
  const files = [
    'apple-touch-icon.png',
    'favicon-32.png',
    'icon-192.png',
    'icon-512.png',
    'manifest.webmanifest',
    'manifest-volunteer.webmanifest',
  ];
  for (const f of files) {
    copyFile(`assets/web-app/${f}`, path.join(destDir, f));
  }
}

function deployToDir(destDir, build, indexHtml) {
  writeIndex(destDir, indexHtml);
  writeStampedSdui(path.join(destDir, 'jewelheart-sdui.js'), build);
  copyFile('scripts/_prod-admin.css', path.join(destDir, 'jewelheart-admin.css'));
  copyWebAppIcons(destDir);
  process.stdout.write(`  -> ${destDir} (web ${build})\n`);
}

function run(cmd, args, opts = {}) {
  process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function pushViaGitCheckout(pagesRepo, build) {
  run('git', ['-C', pagesRepo, 'fetch', 'origin']);
  run('git', ['-C', pagesRepo, 'checkout', pagesBranch]);
  run('git', ['-C', pagesRepo, 'pull', '--ff-only', 'origin', pagesBranch]);
  run('git', ['-C', pagesRepo, 'add', 'docs/testerslogin/index.html', 'docs/testerslogin/jewelheart-sdui.js', 'docs/testerslogin/jewelheart-admin.css']);
  try {
    execFileSync('git', ['-C', pagesRepo, 'diff', '--cached', '--quiet']);
    process.stdout.write('No changes to commit on Pages repo.\n');
    return;
  } catch {
    /* has staged changes */
  }
  const msg = `Deploy testerslogin volunteer SDUI (api-test, web ${build}).`;
  run('git', ['-C', pagesRepo, 'commit', '-m', msg]);
  run('git', ['-C', pagesRepo, 'push', 'origin', pagesBranch]);
}

function pushViaSparseClone(stagingDir, build) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-pages-sparse-'));
  try {
    run('git', ['clone', '--filter=blob:none', '--sparse', '--depth', '1', '--branch', pagesBranch, 'https://github.com/bunkcorp/buddhist-stone-ios-app.git', tmp]);
    run('git', ['-C', tmp, 'sparse-checkout', 'set', 'docs/testerslogin']);
    for (const name of ['index.html', 'jewelheart-sdui.js', 'jewelheart-admin.css']) {
      fs.copyFileSync(path.join(stagingDir, name), path.join(tmp, 'docs', 'testerslogin', name));
    }
    run('git', ['-C', tmp, 'add', 'docs/testerslogin/index.html', 'docs/testerslogin/jewelheart-sdui.js', 'docs/testerslogin/jewelheart-admin.css']);
    try {
      execFileSync('git', ['-C', tmp, 'diff', '--cached', '--quiet']);
      process.stdout.write('No changes to commit on Pages repo.\n');
      return;
    } catch {
      /* has staged changes */
    }
    const msg = `Deploy testerslogin volunteer SDUI (api-test, web ${build}).`;
    run('git', ['-C', tmp, 'commit', '-m', msg]);
    run('git', ['-C', tmp, 'push', 'origin', pagesBranch]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const build = readWebBuild();
const indexHtml = buildIndexHtml(build);

process.stdout.write(`deploy-testerslogin (web build ${build})\n`);

const stagingDir = path.join(repoRoot, 'pages-deploy', 'docs', 'testerslogin');
deployToDir(stagingDir, build, indexHtml);

const pagesDest = path.join(pagesRepo, 'docs', 'testerslogin');
if (!fs.existsSync(path.join(pagesRepo, '.git'))) {
  process.stdout.write(
    `\nPages repo not found at ${pagesRepo} — staged only under pages-deploy/docs/testerslogin/\n` +
      'Set JH_PAGES_REPO or clone bunkcorp/buddhist-stone-ios-app, then re-run.\n',
  );
} else {
  deployToDir(pagesDest, build, indexHtml);

  if (doPush) {
    if (process.platform === 'win32') {
      pushViaSparseClone(stagingDir, build);
    } else {
      pushViaGitCheckout(pagesRepo, build);
    }
  } else {
    process.stdout.write(
      `\nCopied to ${pagesDest}. Commit with:\n` +
        `  cd "${pagesRepo}" && git add docs/testerslogin && git commit -m "Deploy testerslogin (api-test, web ${build})."\n` +
        'Or re-run: node scripts/deploy-testerslogin.mjs --push\n',
    );
  }
}

process.stdout.write('\ndeploy-testerslogin complete -> https://karmadots.org/testerslogin/\n');
