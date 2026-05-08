#!/usr/bin/env node
/**
 * Applies integrations/private-server fragments to a KarmaDots private-server checkout:
 *   - mappers.js  → mapTaskRow (jobTitle / slotLabel)
 *   - service.js  → taskRowWithMeta + listTasks (JOIN slots + job title/label)
 *
 * Default target (sibling of this repo):
 *   ../buddhist-stone-ios-app/private-server/src/jewelheart
 *
 * Override:
 *   JEWELHEART_PRIVATE_SERVER_SRC=/path/to/private-server/src/jewelheart node scripts/apply-jewelheart-task-list-fragments.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const integrationDir = path.join(repoRoot, 'integrations', 'private-server');

const defaultJewelDir = path.resolve(repoRoot, '..', 'buddhist-stone-ios-app', 'private-server', 'src', 'jewelheart');
const jewelDir = process.env.JEWELHEART_PRIVATE_SERVER_SRC || defaultJewelDir;

const mappersPath = path.join(jewelDir, 'mappers.js');
const servicePath = path.join(jewelDir, 'service.js');
const fragmentMapper = path.join(integrationDir, 'jewelheart-mappers-mapTaskRow.fragment.js');
const fragmentService = path.join(integrationDir, 'jewelheart-service-listTasks.fragment.js');

function stripLeadingBlockComment(s) {
  return s.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, '');
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function replaceBlock(source, startNeedle, endNeedle, replacement, label) {
  const endIdx = source.indexOf(endNeedle);
  if (endIdx === -1) die(`${label}: end anchor not found: ${JSON.stringify(endNeedle)}`);
  const startIdx = source.lastIndexOf(startNeedle, endIdx);
  if (startIdx === -1) die(`${label}: start anchor not found before end: ${JSON.stringify(startNeedle)}`);
  return source.slice(0, startIdx) + replacement + source.slice(endIdx);
}

if (!fs.existsSync(jewelDir)) {
  die(
    `JewelHeart private-server src not found:\n  ${jewelDir}\n` +
      'Set JEWELHEART_PRIVATE_SERVER_SRC to your …/private-server/src/jewelheart directory.'
  );
}
for (const p of [mappersPath, servicePath, fragmentMapper, fragmentService]) {
  if (!fs.existsSync(p)) die(`Missing file: ${p}`);
}

let mapBody = stripLeadingBlockComment(fs.readFileSync(fragmentMapper, 'utf8')).trimEnd();
let svcBody = stripLeadingBlockComment(fs.readFileSync(fragmentService, 'utf8')).trimEnd();

let mappers = fs.readFileSync(mappersPath, 'utf8');
const mappersNext = replaceBlock(
  mappers,
  'export function mapTaskRow',
  'export function mapAssignment',
  mapBody + '\n\n',
  'mappers.js'
);

let service = fs.readFileSync(servicePath, 'utf8');
const serviceNext = replaceBlock(
  service,
  'async function taskRowWithMeta',
  'export async function createTask',
  svcBody + '\n\n',
  'service.js'
);

if (mappersNext === mappers && serviceNext === service) {
  console.log('Already up to date (anchors + bodies match). Nothing to write.');
  process.exit(0);
}

if (mappersNext !== mappers) {
  fs.writeFileSync(mappersPath, mappersNext, 'utf8');
  console.log(`Wrote ${mappersPath}`);
}
if (serviceNext !== service) {
  fs.writeFileSync(servicePath, serviceNext, 'utf8');
  console.log(`Wrote ${servicePath}`);
}

console.log('Done. Restart the private-server process and rebuild admin clients if needed.');
