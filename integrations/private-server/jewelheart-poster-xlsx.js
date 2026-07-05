/**
 * Build a populated Master-tab poster .xlsx from the v8 template + live assignments.
 * Output: P-mmdd-hhmm.xlsx (columns A–I only; J–M stripped).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { query } from '../db.js';
import * as acl from './acl.js';
import { HttpError } from './errors.js';

const POSTER_DAY_COL_BY_ISO = {
  '2026-07-20': 'B',
  '2026-07-21': 'C',
  '2026-07-22': 'D',
  '2026-07-23': 'E',
  '2026-07-24': 'F',
  '2026-07-25': 'G',
};

/** v8 Master rows 2–18 in spreadsheet order (matches DB created_at / VOLUNTEER_POSTER_SEARCH_JOBS). */
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
/** v8 Master template cellXfs — header/job/est cols left untouched; day cols styled below. */
const STYLE_NOT_SCHEDULED = '32'; // B–G: XXXXX
const STYLE_ASSIGNED = '36'; // B–G: volunteer name
const STYLE_DAY_EMPTY = '30'; // B–G: scheduled but open (fallback)

function normTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dayIsoOnly(raw) {
  return String(raw || '').slice(0, 10);
}

function defaultTemplatePath() {
  const env = (process.env.JEWELHEART_POSTER_TEMPLATE_PATH || '').trim();
  if (env) return env;
  return path.resolve('data/retreat-volunteer-schedule-v8-template.xlsx');
}

function posterFilename(now = new Date()) {
  const tz = process.env.JEWELHEART_POSTER_TIMEZONE || 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value || '00';
  const mm = get('month');
  const dd = get('day');
  let hh = get('hour');
  if (hh === '24') hh = '00';
  const mi = get('minute');
  return `P-${mm}${dd}-${hh}${mi}.xlsx`;
}

function unzipXlsx(xlsxPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    const zipCopy = path.join(destDir, '_src.zip');
    fs.copyFileSync(xlsxPath, zipCopy);
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'pipe' },
    );
    fs.unlinkSync(zipCopy);
    return;
  }
  execSync(`unzip -qo "${xlsxPath}" -d "${destDir}"`, { stdio: 'pipe' });
}

function zipXlsx(srcDir, outPath) {
  if (process.platform === 'win32') {
    const zipTmp = `${outPath}.zip`;
    if (fs.existsSync(zipTmp)) fs.unlinkSync(zipTmp);
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${path.join(srcDir, '*').replace(/'/g, "''")}' -DestinationPath '${zipTmp.replace(/'/g, "''")}' -Force"`,
      { stdio: 'pipe' },
    );
    fs.copyFileSync(zipTmp, outPath);
    fs.unlinkSync(zipTmp);
    return;
  }
  const cwd = process.cwd();
  process.chdir(srcDir);
  try {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    execSync(`zip -qr "${outPath}" .`, { stdio: 'pipe' });
  } finally {
    process.chdir(cwd);
  }
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
    } else {
      strings.push('');
    }
  }
  return strings;
}

function buildSharedStringsXml(strings) {
  const items = strings.map((s) => {
    const esc = String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relMap[m[1]] = m[2];
  }
  const master = [...wb.matchAll(/<sheet[^>]*name="Master"[^>]*r:id="([^"]+)"/g)][0];
  if (!master) throw new HttpError(500, 'Master sheet not found in poster template');
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

async function loadAssigneeMap(retreatId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (t.id)
            j.title,
            left(s.slot_date::text, 10) AS day,
            v.display_name AS name
     FROM jewelheart_assignments a
     JOIN jewelheart_tasks t ON t.id = a.task_id
     JOIN jewelheart_jobs j ON j.id = t.job_id
     JOIN jewelheart_slots s ON s.id = t.slot_id
     JOIN jewelheart_volunteers v ON v.id = a.volunteer_id
     WHERE t.retreat_id = $1
     ORDER BY t.id, a.created_at DESC`,
    [retreatId],
  );
  const map = new Map();
  for (const r of rows) {
    const key = normTitle(r.title);
    const day = dayIsoOnly(r.day);
    if (!key || !day) continue;
    if (!map.has(key)) map.set(key, new Map());
    map.get(key).set(day, String(r.name || '').trim());
  }
  return map;
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
        if (name) {
          cell = cellXmlShared(col, rowNum, sharedIndex(strings, name, stringCache), STYLE_ASSIGNED);
        } else {
          cell = cellXmlEmpty(col, rowNum, dayStyle);
        }
      }
      rowInner = replaceCell(rowInner, col, rowNum, cell);
    }
    rowInner = stripColsFromRow(rowInner, rowNum);
    sheet = sheet.replace(rm[0], `<row r="${rowNum}">${rowInner}</row>`);
  });

  // Header row: drop J–M
  const r1 = sheet.match(/<row r="1"[^>]*>([\s\S]*?)<\/row>/);
  if (r1) {
    let h = stripColsFromRow(r1[1], 1);
    sheet = sheet.replace(r1[0], `<row r="1">${h}</row>`);
  }

  fs.writeFileSync(sheetPath, sheet, 'utf8');
}

/** Drop stale calcChain (template formulas in removed J–M cols trigger Excel repair). */
function sanitizeXlsxPackage(workDir) {
  const xlDir = path.join(workDir, 'xl');
  const calcPath = path.join(xlDir, 'calcChain.xml');
  if (fs.existsSync(calcPath)) fs.unlinkSync(calcPath);

  const relsPath = path.join(xlDir, '_rels', 'workbook.xml.rels');
  if (fs.existsSync(relsPath)) {
    let rels = fs.readFileSync(relsPath, 'utf8');
    rels = rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/g, '');
    fs.writeFileSync(relsPath, rels, 'utf8');
  }

  const ctPath = path.join(workDir, '[Content_Types].xml');
  if (fs.existsSync(ctPath)) {
    let ct = fs.readFileSync(ctPath, 'utf8');
    ct = ct.replace(/<Override[^>]*calcChain[^>]*\/>/g, '');
    fs.writeFileSync(ctPath, ct, 'utf8');
  }
}

/**
 * @returns {{ buffer: Buffer, filename: string, assignedCells: number }}
 */
export async function buildPosterMasterXlsxBuffer(retreatId) {
  const templatePath = defaultTemplatePath();
  if (!fs.existsSync(templatePath)) {
    throw new HttpError(
      500,
      `Poster template missing (${templatePath}). Set JEWELHEART_POSTER_TEMPLATE_PATH.`,
    );
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-poster-'));
  const outPath = path.join(workDir, 'poster.xlsx');
  try {
    unzipXlsx(templatePath, workDir);
    const xlDir = path.join(workDir, 'xl');
    const sheetPath = masterSheetPath(xlDir);
    const ssPath = path.join(xlDir, 'sharedStrings.xml');
    const strings = parseSharedStrings(fs.readFileSync(ssPath, 'utf8'));
    const stringCache = new Map();
    const assignees = await loadAssigneeMap(retreatId);
    populateMasterSheet(sheetPath, assignees, strings, stringCache);
    fs.writeFileSync(ssPath, buildSharedStringsXml(strings), 'utf8');
    sanitizeXlsxPackage(workDir);
    zipXlsx(workDir, outPath);
    const buffer = fs.readFileSync(outPath);
    let assignedCells = 0;
    for (const jobMap of assignees.values()) assignedCells += jobMap.size;
    return { buffer, filename: posterFilename(), assignedCells };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export async function buildPosterMasterXlsx(firebaseUid, retreatId, authToken = undefined) {
  const admin = await acl.isGlobalAdmin(firebaseUid);
  if (!admin) throw new HttpError(403, 'Admin access required');
  await acl.assertRetreatReadAccess(firebaseUid, retreatId, authToken);
  return buildPosterMasterXlsxBuffer(retreatId);
}
