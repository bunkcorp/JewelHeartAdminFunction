#!/usr/bin/env node
/** @deprecated use seed-people-test-remote.mjs dev */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-people-test-remote.mjs'), 'dev', ...args], {
  stdio: 'inherit',
});