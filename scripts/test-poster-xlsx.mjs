#!/usr/bin/env node
/**
 * Generate poster xlsx locally or on prod (no auth — direct buffer build).
 *   node scripts/test-poster-xlsx.mjs [retreatId] [outPath]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Default template for local test
if (!process.env.JEWELHEART_POSTER_TEMPLATE_PATH) {
  const local = 'C:/Data/dev/RetreatVolunteer/Redesign/Retreat_Volunteer_Schedule v8, w abbrevs.xlsx';
  if (fs.existsSync(local)) process.env.JEWELHEART_POSTER_TEMPLATE_PATH = local;
}

const retreatId = process.argv[2] || '34d43115-67b3-5fbf-9173-abb051c11ca7';
const outArg = process.argv[3];

// Dynamic import: prod uses ../jewelheart/, local uses integrations/
let mod;
try {
  mod = await import('../src/jewelheart/jewelheart-poster-xlsx.js');
} catch {
  mod = await import('../integrations/private-server/jewelheart-poster-xlsx.js');
}

const { buildPosterMasterXlsxBuffer } = mod;
const out = await buildPosterMasterXlsxBuffer(retreatId);
const outPath = outArg || path.join(repoRoot, out.filename);
fs.writeFileSync(outPath, out.buffer);
console.log('wrote', outPath, 'bytes', out.buffer.length, 'assignedCells', out.assignedCells);
