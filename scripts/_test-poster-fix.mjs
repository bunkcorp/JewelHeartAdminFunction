#!/usr/bin/env node
/**
 * Build poster xlsx locally without DB — verifies calcChain removal + formula flatten.
 *   node scripts/_test-poster-fix.mjs [outPath]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const template =
  process.env.JEWELHEART_POSTER_TEMPLATE_PATH ||
  'C:/Data/dev/RetreatVolunteer/Redesign/Retreat_Volunteer_Schedule v8, w abbrevs.xlsx';

// Inline the xlsx helpers (same as jewelheart-poster-xlsx.js) to avoid db.js import.
const POSTER_DAY_COL_BY_ISO = {
  '2026-07-20': 'B',
  '2026-07-21': 'C',
  '2026-07-22': 'D',
  '2026-07-23': 'E',
  '2026-07-24': 'F',
  '2026-07-25': 'G',
};
const POSTER_JOBS = [
  { title: 'Café, lunch break / Light cleanup', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Café, end of day / Full cleanup', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Kitchen, lunch brk / Light cleanup', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Kitchen, end of day / Full cleanup', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Coffee & snacks / Morning setup', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Coffee & snacks / Evening brkdwn', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Tara Paradse, store / Vacuum', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { title: 'JH off, main hallway / Vacuum', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { title: 'Coatrm, café hallwy / Vacuum', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Foyer & lobby / Vacuum', scheduledDayIsos: ['2026-07-22', '2026-07-25'] },
  { title: 'Lama offices / Clean', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
  { title: "Men's room / Clean & stock", scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Urinals / Check pads & mop', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: "Women's room / Clean & stock", scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Unisx, Lama bathrooms', scheduledDayIsos: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'] },
  { title: 'Front windows / Clean', scheduledDayIsos: ['2026-07-22', '2026-07-25'] },
  { title: 'Towels, mop pads / launder at home', scheduledDayIsos: ['2026-07-21', '2026-07-23', '2026-07-25'] },
];
const NOT_SCHEDULED_TEXT = 'XXXXX';
const DROP_COLS = ['J', 'K', 'L', 'M'];
const STYLE_NOT_SCHEDULED = '32';
const STYLE_ASSIGNED = '36';
const STYLE_DAY_EMPTY = '30';

function unzipXlsx(xlsxPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const zipCopy = path.join(destDir, '_src.zip');
  fs.copyFileSync(xlsxPath, zipCopy);
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`,
    { stdio: 'pipe' },
  );
  fs.unlinkSync(zipCopy);
}

function zipXlsx(srcDir, outPath) {
  const zipTmp = `${outPath}.zip`;
  if (fs.existsSync(zipTmp)) fs.unlinkSync(zipTmp);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${path.join(srcDir, '*').replace(/'/g, "''")}' -DestinationPath '${zipTmp.replace(/'/g, "''")}' -Force"`,
    { stdio: 'pipe' },
  );
  fs.copyFileSync(zipTmp, outPath);
  fs.unlinkSync(zipTmp);
}

function parseSharedStrings(xml) {
  const strings = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const block = m[1];
    if (block.includes('<t')) {
      strings.push(
        [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((x) =>
            x[1]
              .replace(/&#10;/g, '\n')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>'),
          )
          .join(''),
      );
    } else strings.push('');
  }
  return strings;
}

function buildSharedStringsXml(strings) {
  const items = strings.map((s) => {
    const esc = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const preserve = /^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : '';
    return `<si><t${preserve}>${esc}</t></si>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${items.join('')}</sst>`;
}

function sharedIndex(strings, text, cache) {
  const key = String(text);
  if (cache.has(key)) return cache.get(key);
  let idx = strings.indexOf(key);
  if (idx < 0) {
    idx = strings.length;
    strings.push(key);
  }
  cache.set(key, idx);
  return idx;
}

function masterSheetPath(xlDir) {
  const wb = fs.readFileSync(path.join(xlDir, 'workbook.xml'), 'utf8');
  const rels = fs.readFileSync(path.join(xlDir, '_rels', 'workbook.xml.rels'), 'utf8');
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
  const master = [...wb.matchAll(/<sheet[^>]*name="Master"[^>]*r:id="([^"]+)"/g)][0];
  const target = relMap[master[1]].replace(/^\//, '').replace(/^xl\//, '');
  return path.join(xlDir, target);
}

function cellXmlShared(col, rowNum, idx, style) {
  return `<c r="${col}${rowNum}" t="s" s="${style}"><v>${idx}</v></c>`;
}
function cellXmlEmpty(col, rowNum, style) {
  return `<c r="${col}${rowNum}" s="${style}"/>`;
}
function extractCellStyle(rowInner, col, rowNum, fallback) {
  const cellRe = new RegExp(`<c r="${col}${rowNum}"([^>]*)\\/>|<c r="${col}${rowNum}"([^>]*)>[\\s\\S]*?<\\/c>`);
  const m = rowInner.match(cellRe);
  if (!m) return fallback;
  const attrs = m[1] || m[2] || '';
  const sm = attrs.match(/ s="(\d+)"/);
  return sm ? sm[1] : fallback;
}
function replaceCell(rowInner, col, rowNum, newCell) {
  const re = new RegExp(`<c r="${col}${rowNum}"[^>]*/>|<c r="${col}${rowNum}"[^>]*>[\\s\\S]*?</c>`, 'g');
  if (re.test(rowInner)) return rowInner.replace(re, newCell);
  return rowInner.replace(/<\/row>/, `${newCell}</row>`);
}
function stripColsFromRow(rowInner, rowNum) {
  let out = rowInner;
  for (const col of DROP_COLS) {
    const re = new RegExp(`<c r="${col}${rowNum}"[^>]*/>|<c r="${col}${rowNum}"[^>]*>[\\s\\S]*?</c>`, 'g');
    out = out.replace(re, '');
  }
  return out;
}
function flattenFormulasInSheetXml(sheetXml) {
  return sheetXml.replace(/<c r="([^"]+)"([^>]*)>([\s\S]*?)<\/c>/g, (full, ref, attrs, inner) => {
    if (!/<f[\s>]/.test(inner)) return full;
    let body = inner.replace(/<f[\s\S]*?<\/f>/g, '').replace(/<f[^/]*\/>/g, '').trim();
    if (!body) return `<c r="${ref}"${attrs}/>`;
    return `<c r="${ref}"${attrs}>${body}</c>`;
  });
}
function flattenFormulasInMasterSheet(sheetPath) {
  fs.writeFileSync(sheetPath, flattenFormulasInSheetXml(fs.readFileSync(sheetPath, 'utf8')), 'utf8');
}
function sanitizeXlsxPackage(workDir) {
  const xlDir = path.join(workDir, 'xl');
  const calcPath = path.join(xlDir, 'calcChain.xml');
  if (fs.existsSync(calcPath)) fs.unlinkSync(calcPath);
  const relsPath = path.join(xlDir, '_rels', 'workbook.xml.rels');
  if (fs.existsSync(relsPath)) {
    let rels = fs.readFileSync(relsPath, 'utf8');
    rels = rels.replace(/<Relationship[^>]*Target="[^"]*calcChain\.xml"[^>]*\/>/g, '');
    rels = rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/g, '');
    fs.writeFileSync(relsPath, rels, 'utf8');
  }
  const ctPath = path.join(workDir, '[Content_Types].xml');
  if (fs.existsSync(ctPath)) {
    let ct = fs.readFileSync(ctPath, 'utf8');
    ct = ct.replace(/<Override[^>]*\/xl\/calcChain\.xml"[^>]*\/>/g, '');
    ct = ct.replace(/<Override[^>]*calcChain[^>]*\/>/g, '');
    fs.writeFileSync(ctPath, ct, 'utf8');
  }
}

function normTitle(s) {
  return String(s || '').toLowerCase().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function populateMasterSheet(sheetPath, assigneesByJobTitle, strings, stringCache) {
  let sheet = fs.readFileSync(sheetPath, 'utf8');
  const notScheduledIdx = sharedIndex(strings, NOT_SCHEDULED_TEXT, stringCache);
  POSTER_JOBS.forEach((job, jobIdx) => {
    const rowNum = jobIdx + 2;
    const rowRe = new RegExp(`<row r="${rowNum}"[^>]*>([\\s\\S]*?)</row>`);
    const rm = sheet.match(rowRe);
    if (!rm) return;
    let rowInner = rm[1];
    const titleKey = normTitle(job.title);
    const dayAssignees = assigneesByJobTitle.get(titleKey) || new Map();
    const scheduled = new Set(job.scheduledDayIsos);
    for (const [iso, col] of Object.entries(POSTER_DAY_COL_BY_ISO)) {
      const dayStyle = extractCellStyle(rowInner, col, rowNum, STYLE_DAY_EMPTY);
      let cell;
      if (!scheduled.has(iso)) {
        cell = cellXmlShared(col, rowNum, notScheduledIdx, STYLE_NOT_SCHEDULED);
      } else {
        const name = dayAssignees.get(iso);
        cell = name
          ? cellXmlShared(col, rowNum, sharedIndex(strings, name, stringCache), STYLE_ASSIGNED)
          : cellXmlEmpty(col, rowNum, dayStyle);
      }
      rowInner = replaceCell(rowInner, col, rowNum, cell);
    }
    rowInner = stripColsFromRow(rowInner, rowNum);
    sheet = sheet.replace(rm[0], `<row r="${rowNum}">${rowInner}</row>`);
  });
  const r1 = sheet.match(/<row r="1"[^>]*>([\s\S]*?)<\/row>/);
  if (r1) sheet = sheet.replace(r1[0], `<row r="1">${stripColsFromRow(r1[1], 1)}</row>`);
  fs.writeFileSync(sheetPath, sheet, 'utf8');
}

function inspectOutput(xlsxPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-'));
  const zip = path.join(tmp, 'z.zip');
  fs.copyFileSync(xlsxPath, zip);
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force"`,
    { stdio: 'pipe' },
  );
  const xl = path.join(tmp, 'xl');
  const calc = fs.existsSync(path.join(xl, 'calcChain.xml'));
  const rels = fs.readFileSync(path.join(xl, '_rels', 'workbook.xml.rels'), 'utf8');
  const ct = fs.readFileSync(path.join(tmp, '[Content_Types].xml'), 'utf8');
  const sheet = fs.readFileSync(masterSheetPath(xl), 'utf8');
  const formulas = (sheet.match(/<f[\s>]/g) || []).length;
  const jCells = (sheet.match(/<c r="J\d+"/g) || []).length;
  return { calc, relsCalc: /calcChain/.test(rels), ctCalc: /calcChain/.test(ct), formulas, jCells };
}

if (!fs.existsSync(template)) {
  console.error('Template missing:', template);
  process.exit(1);
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-poster-fix-'));
const outPath =
  process.argv[2] || path.join('C:/Data/dev/RetreatVolunteer/Redesign/posters', 'P-fix-test.xlsx');
try {
  unzipXlsx(template, workDir);
  const xlDir = path.join(workDir, 'xl');
  const sheetPath = masterSheetPath(xlDir);
  const ssPath = path.join(xlDir, 'sharedStrings.xml');
  const strings = parseSharedStrings(fs.readFileSync(ssPath, 'utf8'));
  const stringCache = new Map();
  populateMasterSheet(sheetPath, new Map(), strings, stringCache);
  flattenFormulasInMasterSheet(sheetPath);
  fs.writeFileSync(ssPath, buildSharedStringsXml(strings), 'utf8');
  sanitizeXlsxPackage(workDir);
  zipXlsx(workDir, outPath);
  const check = inspectOutput(outPath);
  console.log('wrote', outPath);
  console.log('verify:', check);
  if (check.calc || check.relsCalc || check.ctCalc || check.formulas || check.jCells) {
    console.error('FAIL — poster package still has calcChain or formulas');
    process.exit(1);
  }
  console.log('OK — no calcChain, no formulas, no J-column cells');
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
