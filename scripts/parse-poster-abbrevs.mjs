import fs from 'fs';
import path from 'path';
import os from 'os';

const base = path.join(os.tmpdir(), 'xlsx-v8b', 'xl');
const xml = fs.readFileSync(path.join(base, 'sharedStrings.xml'), 'utf8');
const strings = [];
const re = /<si>([\s\S]*?)<\/si>/g;
let m;
while ((m = re.exec(xml))) {
  const block = m[1];
  if (block.includes('<t')) {
    const parts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) =>
      x[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#10;/g, '\n'),
    );
    strings.push(parts.join(''));
  } else strings.push('');
}

const sheet = fs.readFileSync(path.join(base, 'worksheets', 'sheet4.xml'), 'utf8');
const jobs = [];
for (let r = 2; r <= 18; r++) {
  const rowRe = new RegExp(`<row r="${r}"[\\s\\S]*?</row>`);
  const row = sheet.match(rowRe);
  if (!row) continue;
  const a = row[0].match(new RegExp(`<c r="A${r}"[^>]*t="s"[^>]*>\\s*<v>(\\d+)</v>`));
  const j = row[0].match(new RegExp(`<c r="J${r}"[^>]*t="s"[^>]*>\\s*<v>(\\d+)</v>`));
  const job = a ? strings[+a[1]] : '';
  const abbrev = j ? strings[+j[1]] : '';
  if (job) jobs.push({ job: job.replace(/\n/g, ' / '), abbrev });
}
console.log(JSON.stringify(jobs, null, 2));
