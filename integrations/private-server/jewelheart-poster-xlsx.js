/**
 * Build a populated jobs v4.xlsx: Poster + Compact (assignments, checkmarks) + Roster.
 * Template: jobs v4.xlsx (Poster / Compact / Roster tabs; Jobs tab unchanged).
 * Output: P-mmdd-hhmm.xlsx
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { query } from '../db.js';
import * as acl from './acl.js';
import { HttpError } from './errors.js';
import { getPosterSearchJobs, normPosterTitle } from './jewelheart-poster-data.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const POSTER_DAY_COL_BY_ISO = {
  '2026-07-20': 'B',
  '2026-07-21': 'C',
  '2026-07-22': 'D',
  '2026-07-23': 'E',
  '2026-07-24': 'F',
  '2026-07-25': 'G',
};

const DAY_COLS = ['B', 'C', 'D', 'E', 'F', 'G'];
const NOT_SCHEDULED_TEXT = 'XXXXX';
const CHECKIN_PREFIX = '✓ ';
const ROSTER_COLS = ['A', 'B', 'C', 'D', 'E', 'F'];
const ROSTER_DATA_STYLE = '25';
const ROSTER_Y_STYLE = '25';

function dayIsoOnly(raw) {
  return String(raw || '').slice(0, 10);
}

function defaultTemplatePath() {
  const env =
    (process.env.JEWELHEART_POSTER_TEMPLATE_PATH || '').trim() ||
    (process.env.JEWELHEART_JOBS_XLSX_PATH || '').trim();
  if (env) return path.resolve(env);
  return path.resolve(__dir, '../../data/jewelheart/jobs-v4.xlsx');
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

function sheetPathByName(xlDir, sheetName) {
  const wb = fs.readFileSync(path.join(xlDir, 'workbook.xml'), 'utf8');
  const rels = fs.readFileSync(path.join(xlDir, '_rels', 'workbook.xml.rels'), 'utf8');
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relMap[m[1]] = m[2];
  }
  const match = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find(
    (m) => m[1] === sheetName,
  );
  if (!match) throw new HttpError(500, `${sheetName} sheet not found in Excel template`);
  const target = relMap[match[2]].replace(/^\//, '').replace(/^xl\//, '');
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

function rowInner(sheet, rowNum) {
  const rowRe = new RegExp(`<row r="${rowNum}"[^>]*>([\\s\\S]*?)</row>`);
  const rm = sheet.match(rowRe);
  return rm ? { full: rm[0], inner: rm[1] } : null;
}

function writeRow(sheet, rowNum, rowInnerContent) {
  const rowRe = new RegExp(`<row r="${rowNum}"[^>]*>[\\s\\S]*?</row>`);
  if (rowRe.test(sheet)) {
    return sheet.replace(rowRe, `<row r="${rowNum}">${rowInnerContent}</row>`);
  }
  return sheet.replace('</sheetData>', `<row r="${rowNum}">${rowInnerContent}</row></sheetData>`);
}

function splitDisplayName(displayName) {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/** @returns {Map<string, Map<string, { name: string, hasCheckin: boolean }>>} */
async function loadAssignmentCellMap(retreatId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (t.id)
            j.title,
            left(s.slot_date::text, 10) AS day,
            v.display_name AS name,
            EXISTS (
              SELECT 1 FROM jewelheart_shift_checkins c
              WHERE c.assignment_id = a.id
            ) AS has_checkin
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
    const key = normPosterTitle(r.title);
    const day = dayIsoOnly(r.day);
    const name = String(r.name || '').trim();
    if (!key || !day || !name) continue;
    if (!map.has(key)) map.set(key, new Map());
    map.get(key).set(day, { name, hasCheckin: r.has_checkin === true });
  }
  return map;
}

function dayCellsForJob(job, cellByTitle) {
  for (const key of [normPosterTitle(job.title), normPosterTitle(job.dbTitle)]) {
    if (cellByTitle.has(key)) return cellByTitle.get(key);
  }
  return new Map();
}

function populateScheduleSheet(sheetPath, jobs, cellByTitle, strings, stringCache) {
  let sheet = fs.readFileSync(sheetPath, 'utf8');
  const notScheduledIdx = sharedIndex(strings, NOT_SCHEDULED_TEXT, stringCache);
  let assignedCells = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const rowNum = i + 2;
    const row = rowInner(sheet, rowNum);
    if (!row) continue;
    let rowInnerContent = row.inner;
    const scheduled = new Set(job.scheduledDayIsos || []);
    const dayAssignees = dayCellsForJob(job, cellByTitle);

    for (const [iso, col] of Object.entries(POSTER_DAY_COL_BY_ISO)) {
      const style = extractCellStyle(rowInnerContent, col, rowNum, '17');
      let cell;
      if (!scheduled.has(iso)) {
        cell = cellXmlShared(col, rowNum, notScheduledIdx, style);
      } else {
        const entry = dayAssignees.get(iso);
        if (entry?.name) {
          assignedCells += 1;
          const label = entry.hasCheckin ? `${CHECKIN_PREFIX}${entry.name}` : entry.name;
          cell = cellXmlShared(col, rowNum, sharedIndex(strings, label, stringCache), style);
        } else {
          cell = cellXmlEmpty(col, rowNum, style);
        }
      }
      rowInnerContent = replaceCell(rowInnerContent, col, rowNum, cell);
    }
    sheet = writeRow(sheet, rowNum, rowInnerContent);
  }

  fs.writeFileSync(sheetPath, sheet, 'utf8');
  return assignedCells;
}

async function loadRetreatRoster(retreatId) {
  const { rows } = await query(
    `SELECT v.display_name AS "displayName",
            v.email,
            v.phone,
            v.roster_manage AS "rosterManage",
            v.roster_admin AS "rosterAdmin"
     FROM jewelheart_retreat_volunteers rv
     JOIN jewelheart_volunteers v ON v.id = rv.volunteer_id
     WHERE rv.retreat_id = $1
     ORDER BY v.display_name`,
    [retreatId],
  );
  return rows;
}

function populateRosterSheet(sheetPath, volunteers, strings, stringCache) {
  let sheet = fs.readFileSync(sheetPath, 'utf8');
  const yIdx = sharedIndex(strings, 'y', stringCache);
  const maxRow = Math.max(volunteers.length + 1, 10);

  for (let i = 0; i < maxRow - 1; i++) {
    const rowNum = i + 2;
    const v = volunteers[i];
    const row = rowInner(sheet, rowNum);
    let rowInnerContent = row?.inner || '';
    const style = row
      ? extractCellStyle(rowInnerContent, 'A', rowNum, ROSTER_DATA_STYLE)
      : ROSTER_DATA_STYLE;

    if (v) {
      const { first, last } = splitDisplayName(v.displayName);
      const cols = {
        A: first,
        B: last,
        C: String(v.email || '').trim(),
        D: String(v.phone || '').trim(),
        E: v.rosterManage === true ? 'y' : '',
        F: v.rosterAdmin === true ? 'y' : '',
      };
      for (const col of ROSTER_COLS) {
        const text = cols[col];
        const colStyle = col === 'E' || col === 'F' ? ROSTER_Y_STYLE : style;
        const cell =
          text === 'y' && (col === 'E' || col === 'F')
            ? cellXmlShared(col, rowNum, yIdx, colStyle)
            : text
              ? cellXmlShared(col, rowNum, sharedIndex(strings, text, stringCache), colStyle)
              : cellXmlEmpty(col, rowNum, colStyle);
        rowInnerContent = row ? replaceCell(rowInnerContent, col, rowNum, cell) : `${rowInnerContent}${cell}`;
      }
    } else {
      for (const col of ROSTER_COLS) {
        const colStyle = col === 'E' || col === 'F' ? ROSTER_Y_STYLE : style;
        const cell = cellXmlEmpty(col, rowNum, colStyle);
        rowInnerContent = row ? replaceCell(rowInnerContent, col, rowNum, cell) : `${rowInnerContent}${cell}`;
      }
    }
    sheet = writeRow(sheet, rowNum, rowInnerContent);
  }

  fs.writeFileSync(sheetPath, sheet, 'utf8');
}

function sanitizeXlsxPackage(workDir) {
  const xlDir = path.join(workDir, 'xl');
  const calcPath = path.join(xlDir, 'calcChain.xml');
  if (fs.existsSync(calcPath)) fs.unlinkSync(calcPath);

  const relsPath = path.join(xlDir, '_rels', 'workbook.xml.rels');
  if (fs.existsSync(relsPath)) {
    let rels = fs.readFileSync(relsPath, 'utf8');
    rels = rels.replace(/<Relationship[^>]*Target="[^"]*calcChain\.xml"[^>]*\/>/g, '');
    fs.writeFileSync(relsPath, rels, 'utf8');
  }

  const ctPath = path.join(workDir, '[Content_Types].xml');
  if (fs.existsSync(ctPath)) {
    let ct = fs.readFileSync(ctPath, 'utf8');
    ct = ct.replace(/<Override[^>]*\/xl\/calcChain\.xml"[^>]*\/>/g, '');
    fs.writeFileSync(ctPath, ct, 'utf8');
  }
}

/**
 * @returns {{ buffer: Buffer, filename: string, assignedCells: number, rosterRows: number }}
 */
export async function buildPosterMasterXlsxBuffer(retreatId) {
  const templatePath = defaultTemplatePath();
  if (!fs.existsSync(templatePath)) {
    throw new HttpError(
      500,
      `Excel template missing (${templatePath}). Set JEWELHEART_POSTER_TEMPLATE_PATH or JEWELHEART_JOBS_XLSX_PATH.`,
    );
  }

  const jobs = getPosterSearchJobs();
  if (!jobs.length) {
    throw new HttpError(500, 'Poster job catalog not loaded (jobs v4.xlsx).');
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-poster-'));
  const outPath = path.join(workDir, 'poster.xlsx');
  try {
    unzipXlsx(templatePath, workDir);
    const xlDir = path.join(workDir, 'xl');
    const posterPath = sheetPathByName(xlDir, 'Poster');
    const compactPath = sheetPathByName(xlDir, 'Compact');
    const rosterPath = sheetPathByName(xlDir, 'Roster');
    const ssPath = path.join(xlDir, 'sharedStrings.xml');
    const strings = parseSharedStrings(fs.readFileSync(ssPath, 'utf8'));
    const stringCache = new Map();

    const cellByTitle = await loadAssignmentCellMap(retreatId);
    const roster = await loadRetreatRoster(retreatId);

    let assignedCells = populateScheduleSheet(posterPath, jobs, cellByTitle, strings, stringCache);
    assignedCells += populateScheduleSheet(compactPath, jobs, cellByTitle, strings, stringCache);
    populateRosterSheet(rosterPath, roster, strings, stringCache);

    fs.writeFileSync(ssPath, buildSharedStringsXml(strings), 'utf8');
    sanitizeXlsxPackage(workDir);
    zipXlsx(workDir, outPath);
    const buffer = fs.readFileSync(outPath);
    return {
      buffer,
      filename: posterFilename(),
      assignedCells,
      rosterRows: roster.length,
    };
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
