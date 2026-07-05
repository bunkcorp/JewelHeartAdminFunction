import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const xlsx =
  process.argv[2] ||
  'C:/Data/dev/RetreatVolunteer/Redesign/Retreat_Volunteer_Schedule v8, w abbrevs.xlsx';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-style-'));
const zip = path.join(tmp, 't.zip');
fs.copyFileSync(xlsx, zip);
execSync(
  `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force"`,
  { stdio: 'pipe' },
);
const wb = fs.readFileSync(path.join(tmp, 'xl', 'workbook.xml'), 'utf8');
const rels = fs.readFileSync(path.join(tmp, 'xl', '_rels', 'workbook.xml.rels'), 'utf8');
const relMap = {};
for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
const master = [...wb.matchAll(/<sheet[^>]*name="Master"[^>]*r:id="([^"]+)"/g)][0];
const sheetPath = path.join(tmp, 'xl', relMap[master[1]].replace(/^\//, '').replace(/^xl\//, ''));
const sheet = fs.readFileSync(sheetPath, 'utf8');

for (const rowNum of [1, 2, 8]) {
  const rm = sheet.match(new RegExp(`<row r="${rowNum}"[^>]*>([\\s\\S]*?)</row>`));
  if (!rm) continue;
  console.log(`\nrow ${rowNum}:`);
  for (const col of 'ABCDEFGHI') {
    const cm = rm[1].match(new RegExp(`<c r="${col}${rowNum}"([^>]*)>([\\s\\S]*?)</c>|<c r="${col}${rowNum}"([^>]*)\\/>`));
    if (!cm) {
      console.log(`  ${col}${rowNum}: (missing)`);
      continue;
    }
    const attrs = cm[1] || cm[3] || '';
    const sm = attrs.match(/ s="(\d+)"/);
    console.log(`  ${col}${rowNum}: s=${sm ? sm[1] : '-'}`);
  }
}
