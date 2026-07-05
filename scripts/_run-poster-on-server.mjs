#!/usr/bin/env node
import fs from 'fs';
import { buildPosterMasterXlsxBuffer } from '../src/jewelheart/jewelheart-poster-xlsx.js';

const retreatId = process.argv[2] || '34d43115-67b3-5fbf-9173-abb051c11ca7';
const outPath = process.argv[3] || '/tmp/poster-test-out.xlsx';
const out = await buildPosterMasterXlsxBuffer(retreatId);
fs.writeFileSync(outPath, out.buffer);
console.log(JSON.stringify({ outPath, filename: out.filename, assignedCells: out.assignedCells, bytes: out.buffer.length }));
