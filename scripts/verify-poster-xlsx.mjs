#!/usr/bin/env node
/** Quick verify generated poster xlsx. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const xlsx = process.argv[2] || '/tmp/test-poster.xlsx';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-'));
execSync(`unzip -qo "${xlsx}" -d "${tmp}"`, { stdio: 'pipe' });
const xl = path.join(tmp, 'xl');
const ss = fs.readFileSync(path.join(xl, 'sharedStrings.xml'), 'utf8');
const strings = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
const wb = fs.readFileSync(path.join(xl, 'workbook.xml'), 'utf8');
const rels = fs.readFileSync(path.join(xl, '_rels', 'workbook.xml.rels'), 'utf8');
const relMap = {};
for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
const master = [...wb.matchAll(/<sheet[^>]*name="Master"[^>]*r:id="([^"]+)"/g)][0];
const sheetPath = path.join(xl, relMap[master[1]].replace(/^\//, '').replace(/^xl\//, ''));
const sheet = fs.readFileSync(sheetPath, 'utf8');

function cell(col, r) {
  const rm = sheet.match(new RegExp(`<row r="${r}"[^>]*>([\\s\\S]*?)</row>`));
  if (!rm) return null;
  const cm = rm[1].match(new RegExp(`<c r="${col}${r}"([^>]*)(?:/>|>([\\s\\S]*?)</c>)`));
  if (!cm) return '(missing)';
  const t = (cm[1].match(/t="([^"]+)"/) || [])[1];
  const v = (cm[2] || '').match(/<v>([^<]*)<\/v>/);
  if (t === 's' && v) return strings[+v[1]] || `?${v[1]}`;
  if (!v && cm[0].endsWith('/>')) return '(empty)';
  return v ? v[1] : '?';
}

console.log('Sample cells:');
console.log('  B2 (Café lunch Mon):', cell('B', 2));
console.log('  G8 (Tara Sat):', cell('G', 8));
console.log('  B8 (Tara Mon unsched):', cell('B', 8));
console.log('  J2 (should be missing):', cell('J', 2));
const calcChain = path.join(tmp, 'xl', 'calcChain.xml');
console.log('  calcChain.xml present:', fs.existsSync(calcChain) ? 'YES (bad)' : 'no (good)');
const relsRaw = fs.readFileSync(path.join(tmp, 'xl', '_rels', 'workbook.xml.rels'), 'utf8');
console.log('  workbook.xml.rels calcChain ref:', /calcChain/.test(relsRaw) ? 'YES (bad)' : 'no (good)');
const formulaTags = (sheet.match(/<f[\s>]/g) || []).length;
console.log('  formula tags in Master sheet:', formulaTags, formulaTags ? '(bad)' : '(good)');
const b2xml = sheet.match(/<c r="B2"[^>]*\/>|<c r="B2"[^>]*>[\s\S]*?<\/c>/);
const a1xml = sheet.match(/<c r="A1"[^>]*\/>|<c r="A1"[^>]*>[\s\S]*?<\/c>/);
if (b2xml) {
  const sm = b2xml[0].match(/ s="(\d+)"/);
  console.log('  B2 style index:', sm ? sm[1] : '(none)');
}
if (a1xml) {
  const sm = a1xml[0].match(/ s="(\d+)"/);
  console.log('  A1 style index:', sm ? sm[1] : '(none)', '(expect 27 header)');
}
for (const r of [2, 8, 13]) {
  const rm = sheet.match(new RegExp(`<row r="${r}"[^>]*>([\\s\\S]*?)</row>`));
  const jCells = rm ? (rm[1].match(/<c r="J\d+"/g) || []) : [];
  console.log(`  row ${r} J-column cells:`, jCells.length ? jCells : 'none');
}
