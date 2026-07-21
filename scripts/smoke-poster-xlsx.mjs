#!/usr/bin/env node
import { buildPosterMasterXlsxBuffer } from '../src/jewelheart/jewelheart-poster-xlsx.js';

const rid = process.env.JEWELHEART_ACTIVE_RETREAT_ID || '34d43115-67b3-5fbf-9173-abb051c11ca7';
const out = await buildPosterMasterXlsxBuffer(rid);
console.log('ok', out.filename, 'bytes', out.buffer.length, 'assigned', out.assignedCells, 'roster', out.rosterRows);
