import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const src = 'C:/Data/dev/RetreatVolunteer/Redesign/Retreat_Volunteer_Schedule v8, w abbrevs.xlsx';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsxi-'));
const zipCopy = path.join(tmp, 'book.zip');
fs.copyFileSync(src, zipCopy);
execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${tmp}' -Force"`, { stdio: 'ignore' });
const xl = path.join(tmp, 'xl');
const ss = fs.readFileSync(path.join(xl, 'sharedStrings.xml'), 'utf8');
const shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
console.log('shared count', shared.length);
const data = fs.readFileSync(path.join(xl, 'worksheets', 'sheet6.xml'), 'utf8');
const rows = [...data.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
for (const rm of rows) {
  const rnum = rm[1];
  const out = [];
  for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const col = cm[1]; const attrs = cm[2] || ''; const inner = cm[3] || '';
    const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
    let val = '';
    if (/t="s"/.test(attrs)) val = vm ? (shared[Number(vm[1])] ?? `#${vm[1]}`) : '';
    else if (/t="str"/.test(attrs)) { const f = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); val = f ? f[1] : (vm ? vm[1] : ''); }
    else if (/t="inlineStr"/.test(attrs)) { const f = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); val = f ? f[1] : ''; }
    else val = vm ? vm[1] : '';
    if (val !== '') out.push(`${col}: ${JSON.stringify(val)}`);
  }
  if (out.length) console.log(`r${rnum} | ${out.join('  ||  ')}`);
}
