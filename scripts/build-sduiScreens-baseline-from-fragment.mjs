import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fragmentPath = path.join(repoRoot, 'integrations/private-server/jewelheart-service-sdui.fragment.js');
const outDir = path.resolve(repoRoot, '..', 'buddhist-stone-ios-app', 'private-server', 'src', 'jewelheart');
const outPath = path.join(outDir, 'sduiScreens.js');

let src = fs.readFileSync(fragmentPath, 'utf8');
src = src.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, '');

const homeStart = src.indexOf('/** JewelHeart default IANA zone');
const homeEnd = src.indexOf('async function retreatListSdui');
if (homeStart === -1 || homeEnd === -1) {
  console.error('Could not slice home block');
  process.exit(1);
}
src = src.slice(0, homeStart) + src.slice(homeEnd);

src = src.replace(
  /function scheduleDeps\(\) \{[\s\S]*?\n\}/,
  'function scheduleDeps() {\n  return { listSlots, listTasks, getScheduleByDay };\n}',
);

const header = `/**
 * KarmaDots private-server SDUI router (generated baseline from integrations fragment).
 * Volunteer home: scripts/apply-jewelheart-sdui-fragment.mjs wires jewelheart-home-sdui.module.js.
 */
import { listRetreats, getRetreat, getScheduleByDay, listSlots, listTasks } from './service.js';
import * as acl from './acl.js';
import { assertUuid } from './validate.js';
import { HttpError } from './errors.js';
import { query } from '../db.js';

`;

src = header + src.trimStart();
src = src.replace(/^export async function sduiScreen/m, 'export async function sduiScreen');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, src, 'utf8');
console.log('Wrote', outPath, 'bytes', src.length);
