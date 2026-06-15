import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const json = execSync(`node "${path.join(dir, 'parse-poster-schedule.mjs')}"`, { encoding: 'utf8' });
const jobs = JSON.parse(json.split('\n').filter((l) => !l.startsWith('sanity')).join('\n'));
const lines = jobs.map((j) => {
  const days = j.scheduledDayIsos.map((d) => `'${d}'`).join(', ');
  const title = j.title.replace(/'/g, "\\'");
  const abbrev = j.abbrev.replace(/'/g, "\\'");
  return `  { id: '${j.id}', title: '${title}', abbrev: '${abbrev}', scheduledDayIsos: [${days}] },`;
});
console.log('const VOLUNTEER_POSTER_SEARCH_JOBS = [\n' + lines.join('\n') + '\n];');
