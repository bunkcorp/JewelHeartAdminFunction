import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const src =
  process.argv[2] ||
  'C:/Data/dev/RetreatVolunteer/Redesign/Retreat_Volunteer_Schedule v9.xlsx';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsxraw-'));
const zipCopy = path.join(tmp, 'b.zip');
fs.copyFileSync(src, zipCopy);
execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${tmp}' -Force"`, { stdio: 'ignore' });
const xl = path.join(tmp, 'xl');
const ss = fs.readFileSync(path.join(xl, 'sharedStrings.xml'), 'utf8');
const shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));

// Identify the Master sheet file via workbook rels
const wb = fs.readFileSync(path.join(xl, 'workbook.xml'), 'utf8');
const rels = fs.readFileSync(path.join(xl, '_rels', 'workbook.xml.rels'), 'utf8');
const relMap = {};
for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
const sheets = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ name: m[1], target: relMap[m[2]] }));
const master = sheets.find((s) => s.name === 'Master');
const file = path.join(xl, master.target.replace(/^\//, '').replace(/^xl\//, ''));
const data = fs.readFileSync(file, 'utf8');

// Check for merged cells
const merges = [...data.matchAll(/<mergeCell ref="([^"]+)"/g)].map((m) => m[1]);
console.log('MERGES:', merges.length ? merges.join(' ') : '(none)');

function cellVal(rowInner, col, r) {
  const cm = rowInner.match(new RegExp(`<c r="${col}${r}"([^>]*)(?:/>|>([\\s\\S]*?)</c>)`));
  if (!cm) return '(empty)';
  const attrs = cm[1] || ''; const inner = cm[2] || '';
  const t = (attrs.match(/t="([^"]+)"/) || [])[1] || 'n';
  const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
  if (!vm) return '(empty)';
  if (t === 's') return shared[Number(vm[1])];
  // numeric-typed cell whose value is actually a shared-string index
  const n = Number(vm[1]);
  if (Number.isInteger(n) && shared[n] !== undefined && !/^\d+$/.test(String(vm[1]).length > 3 ? '' : '')) {
    // ambiguous; just show raw
  }
  return vm[1];
}

for (let r = 1; r <= 18; r++) {
  const rm = data.match(new RegExp(`<row r="${r}"[^>]*>([\\s\\S]*?)</row>`));
  if (!rm) { console.log(`ROW ${r}: (missing)`); continue; }
  const A = cellVal(rm[1], 'A', r);
  const J = cellVal(rm[1], 'J', r);
  const K = cellVal(rm[1], 'K', r);
  const M = cellVal(rm[1], 'M', r);
  console.log(`ROW ${r}: A=${JSON.stringify(A)}  J=${JSON.stringify(J)}  K=${JSON.stringify(K)}  M=${JSON.stringify(M)}`);
}
