#!/usr/bin/env node
/**
 * Copy people-test fixture + seed script to api-dev or api-test and run seed.
 *
 * Usage:
 *   node scripts/seed-people-test-remote.mjs dev
 *   node scripts/seed-people-test-remote.mjs test
 *   node scripts/seed-people-test-remote.mjs test --dry-run
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const SSH = process.env.JH_SSH || 'karmadots-prod';
const NODE = process.env.JH_REMOTE_NODE || '/Users/kevinwoods/.nvm/versions/node/v20.20.0/bin/node';
const dryRun = process.argv.includes('--dry-run');
const envArg = process.argv.find((a) => a === 'dev' || a === 'test') || 'dev';
const REMOTE_DIR =
  envArg === 'test'
    ? process.env.JH_TEST_DIR || 'private-server-test'
    : process.env.JH_DEV_DIR || 'private-server-dev';

function run(cmd, args) {
  process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function scp(localRel, remoteRel) {
  run('scp', ['-o', 'BatchMode=yes', path.join(repoRoot, localRel), `${SSH}:${REMOTE_DIR}/${remoteRel}`]);
}

scp('docs/sdui/fixtures/people-test.xlsx', 'people-test.xlsx');
run('ssh', ['-o', 'BatchMode=yes', SSH, `mkdir -p ${REMOTE_DIR}/scripts/lib`]);
scp('scripts/seed-people-test.mjs', 'scripts/seed-people-test.mjs');
scp('scripts/lib/people-test-xlsx.mjs', 'scripts/lib/people-test-xlsx.mjs');
scp('scripts/dump-xlsx.mjs', 'scripts/dump-xlsx.mjs');

run('ssh', [
  '-o',
  'BatchMode=yes',
  SSH,
  `cd ${REMOTE_DIR} && ${NODE} --env-file=.env scripts/seed-people-test.mjs people-test.xlsx${dryRun ? ' --dry-run' : ''}`,
]);

process.stdout.write(`\nseed-people-test-${envArg} complete\n`);
