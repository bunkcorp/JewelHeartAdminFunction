#!/usr/bin/env node
/**
 * Copy KarmaDots iOS AppIcon PNGs into assets/web-app/ for volunteer PWA icons.
 *
 * Source (first match wins):
 *   clients/ios/Assets.xcassets/AppIcon.appiconset/
 *   Mac CI checkout on karmadots-prod (see script body)
 *
 * Usage:
 *   node scripts/sync-web-app-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'assets', 'web-app');

const localIconDir = path.join(
  repoRoot,
  'clients',
  'ios',
  'Assets.xcassets',
  'AppIcon.appiconset',
);

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function resolveSource1024() {
  const local = path.join(localIconDir, 'KarmaDotsICON-iOS-Default-1024x1024@1x.png');
  if (fs.existsSync(local)) return local;
  const ssh = process.env.JH_SSH || 'karmadots-prod';
  const remote =
    '/Users/kevinwoods/actions-runner/_work/JewelHeartAdminFunction/JewelHeartAdminFunction/clients/ios/Assets.xcassets/AppIcon.appiconset/KarmaDotsICON-iOS-Default-1024x1024@1x.png';
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = path.join(outDir, '.icon-1024-source.png');
  run('scp', ['-o', 'BatchMode=yes', `${ssh}:${remote}`, tmp]);
  return tmp;
}

function resolveSource180() {
  const local = path.join(localIconDir, 'KarmaDotsICON-iOS-Default-60x60@3x.png');
  if (fs.existsSync(local)) return local;
  const ssh = process.env.JH_SSH || 'karmadots-prod';
  const remote =
    '/Users/kevinwoods/actions-runner/_work/JewelHeartAdminFunction/JewelHeartAdminFunction/clients/ios/Assets.xcassets/AppIcon.appiconset/KarmaDotsICON-iOS-Default-60x60@3x.png';
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = path.join(outDir, '.icon-180-source.png');
  run('scp', ['-o', 'BatchMode=yes', `${ssh}:${remote}`, tmp]);
  return tmp;
}

fs.mkdirSync(outDir, { recursive: true });

const src1024 = resolveSource1024();
const src180 = resolveSource180();

if (process.platform === 'darwin') {
  run('sips', ['-z', '512', '512', src1024, '--out', path.join(outDir, 'icon-512.png')]);
  run('sips', ['-z', '192', '192', src1024, '--out', path.join(outDir, 'icon-192.png')]);
  run('sips', ['-z', '32', '32', src1024, '--out', path.join(outDir, 'favicon-32.png')]);
} else {
  const ssh = process.env.JH_SSH || 'karmadots-prod';
  run('ssh', [
    '-o',
    'BatchMode=yes',
    ssh,
    `sips -z 512 512 ${src1024.replace(/\\/g, '/')} --out /tmp/kd-icon-512.png && sips -z 192 192 ${src1024.replace(/\\/g, '/')} --out /tmp/kd-icon-192.png && sips -z 32 32 ${src1024.replace(/\\/g, '/')} --out /tmp/kd-icon-32.png`,
  ]);
  run('scp', ['-o', 'BatchMode=yes', `${ssh}:/tmp/kd-icon-512.png`, path.join(outDir, 'icon-512.png')]);
  run('scp', ['-o', 'BatchMode=yes', `${ssh}:/tmp/kd-icon-192.png`, path.join(outDir, 'icon-192.png')]);
  run('scp', ['-o', 'BatchMode=yes', `${ssh}:/tmp/kd-icon-32.png`, path.join(outDir, 'favicon-32.png')]);
}

const touchOut = path.join(outDir, 'apple-touch-icon.png');
fs.copyFileSync(src180, touchOut);
flattenAppleTouchIcon(touchOut);

process.stdout.write(`Web app icons written to ${outDir}\n`);

/** iOS home screen rejects RGBA apple-touch-icon (preview ok, installed icon → Safari compass). */
function flattenAppleTouchIcon(pngPath) {
  if (process.platform === 'win32') {
    const ps1 = path.join(__dirname, 'flatten-apple-touch-icon.ps1');
    run('powershell', ['-NoProfile', '-File', ps1]);
    return;
  }
  const py = path.join(__dirname, 'flatten-apple-touch-icon.py');
  if (fs.existsSync(py)) {
    run('python3', [py, pngPath]);
  }
}
