#!/usr/bin/env node
/**
 * Parse jobs v4.xlsx + instructions.docx → poster JSON bundle.
 * Usage:
 *   node scripts/parse-jobs-v4.mjs [jobs.xlsx] [instructions.docx] [outDir]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePosterBundleFromFiles } from '../integrations/private-server/jewelheart-poster-data.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const jobsXlsx =
  process.argv[2] || path.join(__dir, '../data/jewelheart/jobs-v4.xlsx');
const instructionsDocx =
  process.argv[3] || path.join(__dir, '../data/jewelheart/instructions.docx');
const outDir = process.argv[4] || path.join(__dir, '../data/jewelheart');

const bundle = parsePosterBundleFromFiles({
  jobsXlsxPath: jobsXlsx,
  instructionsDocxPath: instructionsDocx,
  strict: false,
});

fs.mkdirSync(outDir, { recursive: true });
const jobsPath = path.join(outDir, 'poster-jobs-v4.json');
const instrPath = path.join(outDir, 'poster-instructions-v4.json');
const bundlePath = path.join(outDir, 'poster-bundle-v4.json');

fs.writeFileSync(jobsPath, `${JSON.stringify({ version: 4, jobs: bundle.jobs }, null, 2)}\n`);
fs.writeFileSync(instrPath, `${JSON.stringify({ version: 4, instructions: bundle.instructions }, null, 2)}\n`);
fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);

console.log(`Wrote ${bundle.jobs.length} jobs → ${jobsPath}`);
console.log(`Wrote instructions → ${instrPath}`);
console.log(`Wrote bundle → ${bundlePath}`);

if (bundle.titleCheck.warnings.length) {
  console.warn('\nWarnings:');
  for (const w of bundle.titleCheck.warnings) console.warn(`  ${w}`);
}
if (bundle.titleCheck.errors.length) {
  console.error('\nErrors:');
  for (const e of bundle.titleCheck.errors) console.error(`  ${e}`);
  process.exitCode = 1;
}

const early = bundle.jobs.filter((j) => j.earlyAlert);
console.log(`\nEarly-alert (e): ${early.map((j) => j.id).join(', ') || 'none'}`);

const empty = bundle.jobs.filter((j) => (bundle.instructions[j.id] || [])[0] === '(instructions to be added)');
if (empty.length) {
  console.warn('Missing instructions for:', empty.map((j) => j.title).join('; '));
}
