import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const src = process.argv[2];
const wantSheet = process.argv[3] || null; // optional sheet name filter
if (!src) { console.error('usage: node dump-xlsx.mjs <file.xlsx> [sheetName]'); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-'));
const zipCopy = path.join(tmp, 'book.zip');
fs.copyFileSync(src, zipCopy);
if (process.platform === 'win32') {
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${tmp}' -Force"`,
    { stdio: 'inherit' },
  );
} else {
  execSync(`unzip -q -o "${zipCopy}" -d "${tmp}"`, { stdio: 'inherit' });
}

const xl = path.join(tmp, 'xl');
// shared strings
let shared = [];
const ssPath = path.join(xl, 'sharedStrings.xml');
if (fs.existsSync(ssPath)) {
  const ss = fs.readFileSync(ssPath, 'utf8');
  shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    return texts.join('')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  });
}

// workbook sheet name -> rId -> file
const wb = fs.readFileSync(path.join(xl, 'workbook.xml'), 'utf8');
const rels = fs.readFileSync(path.join(xl, '_rels', 'workbook.xml.rels'), 'utf8');
const relMap = {};
for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
const sheets = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({
  name: m[1], target: relMap[m[2]],
}));
console.log('SHEETS:', sheets.map((s) => s.name).join(' | '));

function colToNum(col) { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function numToCol(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

for (const sh of sheets) {
  if (wantSheet && sh.name !== wantSheet) continue;
  const file = path.join(xl, sh.target.replace(/^\//, '').replace(/^xl\//, ''));
  const data = fs.readFileSync(file, 'utf8');
  console.log(`\n===== SHEET: ${sh.name} (${sh.target}) =====`);
  const rows = [...data.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
  let maxCol = 0;
  const parsed = [];
  for (const rm of rows) {
    const rnum = Number(rm[1]);
    const cells = {};
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = cm[1];
      const attrs = cm[2] || '';
      const inner = cm[3] || '';
      const isStr = /t="s"/.test(attrs);
      const isInline = /t="inlineStr"/.test(attrs);
      let val = '';
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      if (isInline) {
        const tm = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        val = tm ? tm[1] : '';
      } else if (vm) {
        val = isStr ? (shared[Number(vm[1])] ?? '') : vm[1];
      }
      cells[col] = val;
      maxCol = Math.max(maxCol, colToNum(col));
    }
    parsed.push({ rnum, cells });
  }
  for (const { rnum, cells } of parsed) {
    const out = [];
    for (let c = 1; c <= maxCol; c++) {
      const col = numToCol(c);
      const v = cells[col];
      if (v !== undefined && v !== '') out.push(`${col}=${JSON.stringify(v)}`);
    }
    console.log(`r${rnum}: ${out.join('  ')}`);
  }
}
