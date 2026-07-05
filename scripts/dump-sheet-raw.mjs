import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const src = 'C:/Data/dev/RetreatVolunteer/Redesign/Retreat_Volunteer_Schedule v8, w abbrevs.xlsx';
const wantSheet = process.argv[2] || 'Instructions';
const maxRows = Number(process.argv[3] || 60);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsxraw-'));
const zipCopy = path.join(tmp, 'b.zip');
fs.copyFileSync(src, zipCopy);
execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${tmp}' -Force"`, { stdio: 'ignore' });
const xl = path.join(tmp, 'xl');
const ss = fs.readFileSync(path.join(xl, 'sharedStrings.xml'), 'utf8');
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));

const wb = fs.readFileSync(path.join(xl, 'workbook.xml'), 'utf8');
const rels = fs.readFileSync(path.join(xl, '_rels', 'workbook.xml.rels'), 'utf8');
const relMap = {};
for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
const sheets = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ name: m[1], target: relMap[m[2]] }));
console.log('SHEETS:', sheets.map((s) => s.name).join(' | '));
const sheet = sheets.find((s) => s.name === wantSheet);
if (!sheet) { console.log(`Sheet "${wantSheet}" not found`); process.exit(1); }
const file = path.join(xl, sheet.target.replace(/^\//, '').replace(/^xl\//, ''));
const data = fs.readFileSync(file, 'utf8');

function resolve(t, raw) {
  if (raw === null) return '(empty)';
  if (t === 's') return shared[Number(raw)] ?? `?SHARED[${raw}]`;
  if (t === 'str' || t === 'inlineStr') return unesc(raw);
  // numeric-typed: could be a real number OR a stray shared-string index
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0 && n < shared.length) {
    return `${raw}  («${shared[n]}»?)`;
  }
  return raw;
}

let printed = 0;
for (const rm of data.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const r = rm[1];
  const cells = [];
  for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const col = cm[1]; const attrs = cm[2] || ''; const inner = cm[3] || '';
    const t = (attrs.match(/t="([^"]+)"/) || [])[1] || 'n';
    const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
    const isM = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
    const raw = vm ? vm[1] : (isM ? isM[1] : null);
    cells.push(`${col}=${JSON.stringify(resolve(t, raw))}`);
  }
  if (cells.length) { console.log(`R${r}: ${cells.join('  ')}`); printed += 1; }
  if (printed >= maxRows) break;
}
