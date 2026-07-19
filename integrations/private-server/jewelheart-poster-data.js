/**
 * Hot-loadable poster job catalog + per-job instructions from jobs v4.xlsx + Word doc.
 *
 * Paths (override via env):
 *   JEWELHEART_JOBS_XLSX_PATH       — default data/jewelheart/jobs-v4.xlsx
 *   JEWELHEART_INSTRUCTIONS_DOCX_PATH — default data/jewelheart/instructions.docx
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const POSTER_DAY_COL_ISOS = {
  B: '2026-07-20',
  C: '2026-07-21',
  D: '2026-07-22',
  E: '2026-07-23',
  F: '2026-07-24',
  G: '2026-07-25',
};

const JOB_SLUGS = [
  'poster-cafe-lunch-light',
  'poster-cafe-eod-full',
  'poster-kitchen-lunch-light',
  'poster-kitchen-eod-full',
  'poster-coffee-morning',
  'poster-coffee-evening',
  'poster-towels-launder',
  'poster-trash-recycling',
  'poster-tara-vacuum',
  'poster-jh-hallway-vacuum',
  'poster-coatrm-vacuum',
  'poster-foyer-vacuum',
  'poster-front-windows',
  'poster-mens-room',
  'poster-urinals',
  'poster-womens-room',
  'poster-unisex-lama',
];

const ABBREV_FALLBACK = {
  'poster-cafe-lunch-light': 'Café, lunch, light clean',
  'poster-cafe-eod-full': 'Café, end of day, clean',
  'poster-kitchen-lunch-light': 'Ktchn, lunch, light clean',
  'poster-kitchen-eod-full': 'Ktchn, end of day, clean',
  'poster-coffee-morning': 'Coffee, sncks - morn - setup',
  'poster-coffee-evening': 'Coffee, snacks Eve brkdwn',
  'poster-towels-launder': 'Towels, mop pads launder',
  'poster-trash-recycling': 'Trash & recycle EOD',
  'poster-tara-vacuum': 'Tara Paradse, store, Vacuum',
  'poster-jh-hallway-vacuum': 'JH office, hallway Vacuum',
  'poster-coatrm-vacuum': 'Coatrm, café, Vacuum',
  'poster-foyer-vacuum': 'Foyer,lobby Vacuum',
  'poster-front-windows': 'Front windows Clean',
  'poster-mens-room': "Men's room Clean & stock",
  'poster-urinals': 'Urinals Check pads, mop',
  'poster-womens-room': "Women's room Clean, stock",
  'poster-unisex-lama': 'Unisx, Lama bathrooms',
};

/** @type {{ jobs: object[], instructions: Record<string, string[]>, orderMap: Map<string, number>, loadedAt: string|null, sources: object, loadError: string|null }} */
let cache = {
  jobs: [],
  instructions: {},
  orderMap: new Map(),
  loadedAt: null,
  sources: {},
  loadError: null,
};

let loadPromise = null;

function defaultJobsPath() {
  const env = String(process.env.JEWELHEART_JOBS_XLSX_PATH || '').trim();
  if (env) return path.resolve(env);
  return path.resolve(__dir, '../../data/jewelheart/jobs-v4.xlsx');
}

function defaultInstructionsPath() {
  const env = String(process.env.JEWELHEART_INSTRUCTIONS_DOCX_PATH || '').trim();
  if (env) return path.resolve(env);
  return path.resolve(__dir, '../../data/jewelheart/instructions.docx');
}

function defaultBundlePath() {
  return path.resolve(__dir, '../../data/jewelheart/poster-bundle-v4.json');
}

function foldAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function normPosterTitle(s) {
  return foldAccents(String(s || ''))
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[–—]/g, '-')
    .replace(/\s*\/\s*/g, ' ')
    .replace(/[^a-z0-9&'()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unzipOfficeFile(srcPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    const zipCopy = path.join(destDir, '_src.zip');
    fs.copyFileSync(srcPath, zipCopy);
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'pipe' },
    );
    fs.unlinkSync(zipCopy);
    return;
  }
  execSync(`unzip -qo "${srcPath}" -d "${destDir}"`, { stdio: 'pipe' });
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

function parseSheetRows(sheetXml, shared) {
  const rows = [];
  for (const rm of sheetXml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
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
        val = isStr ? shared[Number(vm[1])] ?? '' : vm[1];
      }
      cells[col] = String(val || '')
        .replace(/&amp;/g, '&')
        .replace(/&#10;/g, '\n');
    }
    rows.push({ rnum: Number(rm[1]), cells });
  }
  return rows;
}

function extractXlsxSheets(xlsxPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-poster-xlsx-'));
  try {
    unzipOfficeFile(xlsxPath, tmp);
    const xl = path.join(tmp, 'xl');
    let shared = [];
    const ssPath = path.join(xl, 'sharedStrings.xml');
    if (fs.existsSync(ssPath)) {
      shared = parseSharedStrings(fs.readFileSync(ssPath, 'utf8'));
    }
    const wb = fs.readFileSync(path.join(xl, 'workbook.xml'), 'utf8');
    const rels = fs.readFileSync(path.join(xl, '_rels', 'workbook.xml.rels'), 'utf8');
    const relMap = {};
    for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
      relMap[m[1]] = m[2];
    }
    const byName = {};
    for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
      const file = path.join(xl, relMap[m[2]].replace(/^\//, ''));
      byName[m[1]] = parseSheetRows(fs.readFileSync(file, 'utf8'), shared);
    }
    return byName;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function rowByNum(rows, n) {
  return rows.find((r) => r.rnum === n) || { rnum: n, cells: {} };
}

function scheduledFromPosterCells(cells) {
  const days = [];
  for (const [col, iso] of Object.entries(POSTER_DAY_COL_ISOS)) {
    const v = String(cells[col] || '').trim();
    if (/^X+$/i.test(v)) continue;
    if (!v) continue;
    days.push(iso);
  }
  return days;
}

function readDocxText(docxPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-poster-docx-'));
  try {
    unzipOfficeFile(docxPath, tmp);
    let xml = fs.readFileSync(path.join(tmp, 'word', 'document.xml'), 'utf8');
    xml = xml
      .replace(/<w:p[ >]/g, '\n<w:p ')
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<[^>]+>/g, '');
    return xml
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalized title tail/subtitle lines that sometimes repeat in docx/subjobs before real steps. */
export function posterTitleLeadFragments(title, dbTitle) {
  const frags = new Set();
  for (const raw of [title, dbTitle]) {
    if (!raw) continue;
    const t = String(raw).trim();
    frags.add(normPosterTitle(t.replace(/\s*[-–—]\s*/g, ' ')));
    const dashParts = t.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
    if (dashParts.length > 1) {
      frags.add(normPosterTitle(dashParts[dashParts.length - 1]));
    }
    const commaParts = t.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
    if (commaParts.length > 1) {
      frags.add(normPosterTitle(commaParts[commaParts.length - 1]));
    }
  }
  frags.delete('');
  return frags;
}

/** Drop leading lines that duplicate the job title or its trailing subtitle. */
export function stripLeadingTitleFragments(lines, title, dbTitle) {
  const frags = posterTitleLeadFragments(title, dbTitle);
  const normLead = (s) =>
    normPosterTitle(String(s || '').replace(/^[-–—\s]+/, ''));
  const out = (lines || []).map((l) => String(l || '').trim()).filter(Boolean);
  while (out.length) {
    const norm = normLead(out[0]);
    if (!norm || ![...frags].some((f) => f && f === norm)) break;
    out.shift();
  }
  return out;
}

/** Match job title in raw docx text (hyphen/en-dash/spacing tolerant). */
function findTitleMatch(text, title, startAt = 0) {
  const words = normPosterTitle(title)
    .split(' ')
    .filter((w) => w && !/^[-–—,&/]+$/.test(w));
  if (!words.length) return null;
  const hay = foldAccents(text.slice(startAt));
  const body = words.map(escapeRegExp).join('[\\s\\-–—,/&]+');
  let m = hay.match(new RegExp(body, 'i'));
  if (!m && words.length >= 3) {
    const short = words.slice(0, Math.min(4, words.length)).map(escapeRegExp).join('[\\s\\-–—,/&]+');
    m = hay.match(new RegExp(short, 'i'));
  }
  if (!m) return null;
  return { index: startAt + m.index, length: m[0].length };
}

function findTitleIndex(text, title, startAt = 0) {
  const m = findTitleMatch(text, title, startAt);
  return m ? m.index : -1;
}

function parseInstructionsByJobOrder(text, jobs) {
  const jobTitles = jobs.map((j) => j.title);
  const matches = [];
  let searchFrom = 0;
  for (const title of jobTitles) {
    const m = findTitleMatch(text, title, searchFrom);
    matches.push(m);
    if (m) searchFrom = m.index + m.length;
  }

  return jobs.map((job, i) => {
    const cur = matches[i];
    if (!cur || cur.index < 0) return [];
    let end = text.length;
    for (let j = i + 1; j < jobTitles.length; j++) {
      const next = matches[j];
      if (next && next.index > cur.index) {
        end = next.index;
        break;
      }
    }
    const lines = text
      .slice(cur.index + cur.length, end)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^[a-z]$/i.test(l));
    return stripLeadingTitleFragments(lines, job.title, job.dbTitle);
  });
}

function validateInstructionTitles(jobs, docxText) {
  const errors = [];
  const warnings = [];
  for (const job of jobs) {
    const title = String(job.title || '').trim();
    if (docxText.includes(title) || docxText.includes(title.replace(/-/g, '\u2013'))) {
      continue;
    }
    const trimmed = title.trim();
    if (docxText.includes(trimmed)) {
      warnings.push(`Jobs row ${job.index}: leading/trailing space in title`);
      continue;
    }
    const enDash = title.replace(/-/g, '\u2013');
    if (docxText.includes(enDash)) {
      warnings.push(`Jobs row ${job.index}: hyphen vs en-dash (${JSON.stringify(title)})`);
      continue;
    }
    if (findTitleIndex(docxText, title) >= 0) continue;
    errors.push(`Instructions doc missing section for job ${job.index}: ${JSON.stringify(title)}`);
  }
  return { errors, warnings };
}

function rebuildOrderMap(jobs) {
  const orderMap = new Map();
  jobs.forEach((j, i) => {
    orderMap.set(normPosterTitle(j.title), i);
    if (j.dbTitle) orderMap.set(normPosterTitle(j.dbTitle), i);
    if (j.id) orderMap.set(String(j.id), i);
  });
  return orderMap;
}

function applyBundle(bundle) {
  cache.jobs = bundle.jobs || [];
  cache.instructions = bundle.instructions || {};
  cache.orderMap = rebuildOrderMap(cache.jobs);
  cache.loadedAt = bundle.source?.generatedAt || new Date().toISOString();
  cache.sources = bundle.source || {};
  cache.loadError = null;
}

/**
 * Parse jobs v4.xlsx + instructions.docx into jobs + instruction map.
 * @param {{ jobsXlsxPath?: string, instructionsDocxPath?: string, strict?: boolean }} [opts]
 */
export function parsePosterBundleFromFiles(opts = {}) {
  const jobsXlsxPath = path.resolve(opts.jobsXlsxPath || defaultJobsPath());
  const instructionsDocxPath = path.resolve(opts.instructionsDocxPath || defaultInstructionsPath());
  if (!fs.existsSync(jobsXlsxPath)) {
    throw new Error(`Jobs workbook not found: ${jobsXlsxPath}`);
  }
  if (!fs.existsSync(instructionsDocxPath)) {
    throw new Error(`Instructions doc not found: ${instructionsDocxPath}`);
  }

  const sheets = extractXlsxSheets(jobsXlsxPath);
  const jobsRows = sheets.Jobs || sheets.all || Object.values(sheets)[0] || [];
  const posterRows = sheets.Poster || sheets.Master || [];
  const compactRows = sheets.Compact || [];

  const jobs = [];
  for (let i = 0; i < 17; i++) {
    const rowNum = i + 2;
    const jobsRow = rowByNum(jobsRows, rowNum);
    const posterRow = rowByNum(posterRows, rowNum);
    const compactRow = rowByNum(compactRows, rowNum);

    const index = i + 1;
    const id = JOB_SLUGS[i];
    const title = String(jobsRow.cells.B || '').trim();
    if (!title) continue;

    const checkinsRequired = Math.max(1, parseInt(jobsRow.cells.J || '1', 10) || 1);
    const jobType = String(jobsRow.cells.K || 'f').trim().toLowerCase();
    const earlyAlert = String(jobsRow.cells.L || '').trim().toLowerCase() === 'e';
    let abbrev = String(jobsRow.cells.M || '').trim();
    if (!abbrev || /^\d+$/.test(abbrev)) abbrev = ABBREV_FALLBACK[id] || title.slice(0, 28);

    const dbTitle = String(compactRow.cells.A || posterRow.cells.A || title)
      .replace(/\r?\n/g, ', ')
      .trim();
    const estMinutes = parseInt(posterRow.cells.I || jobsRow.cells.I || '15', 10) || 15;
    let scheduledDayIsos = scheduledFromPosterCells(posterRow.cells);
    if (!scheduledDayIsos.length && id === 'poster-trash-recycling') {
      scheduledDayIsos = Object.values(POSTER_DAY_COL_ISOS);
    }

    jobs.push({
      index,
      id,
      title,
      dbTitle,
      abbrev: abbrev || title.slice(0, 28),
      jobType,
      checkinsRequired,
      earlyAlert,
      estMinutes,
      scheduledDayIsos,
    });
  }

  const docxText = readDocxText(instructionsDocxPath);
  const titleCheck = validateInstructionTitles(jobs, docxText);
  if (opts.strict && titleCheck.errors.length) {
    throw new Error(titleCheck.errors.join('; '));
  }

  const instrLists = parseInstructionsByJobOrder(docxText, jobs);
  const instructions = {};
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const lines = instrLists[i];
    instructions[job.id] = lines?.length ? lines : ['(instructions to be added)'];
  }

  return {
    version: 4,
    jobs,
    instructions,
    source: {
      jobsXlsx: jobsXlsxPath,
      instructionsDocx: instructionsDocxPath,
      generatedAt: new Date().toISOString(),
    },
    titleCheck,
  };
}

function loadFromBundleFile(bundlePath) {
  const raw = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  applyBundle(raw);
  cache.sources = { ...cache.sources, bundleFallback: bundlePath };
}

function loadPosterDataSync(opts = {}) {
  const jobsXlsxPath = opts.jobsXlsxPath || defaultJobsPath();
  const instructionsDocxPath = opts.instructionsDocxPath || defaultInstructionsPath();
  const bundlePath = defaultBundlePath();

  try {
    const bundle = parsePosterBundleFromFiles({ jobsXlsxPath, instructionsDocxPath, strict: false });
    applyBundle(bundle);
    return {
      ok: true,
      jobs: cache.jobs,
      instructionsCount: Object.keys(cache.instructions).length,
      warnings: bundle.titleCheck.warnings,
      errors: bundle.titleCheck.errors,
      sources: cache.sources,
    };
  } catch (e) {
    if (fs.existsSync(bundlePath)) {
      loadFromBundleFile(bundlePath);
      return {
        ok: true,
        jobs: cache.jobs,
        instructionsCount: Object.keys(cache.instructions).length,
        warnings: [`Loaded JSON fallback: ${e.message}`],
        errors: [],
        sources: cache.sources,
      };
    }
    cache.loadError = e.message || String(e);
    throw e;
  }
}

function ensureLoadedSync() {
  if (cache.jobs.length) return cache;
  loadPosterDataSync();
  return cache;
}

export async function ensurePosterDataLoadedAsync(opts = {}) {
  if (cache.jobs.length && !opts.force) return cache;
  if (loadPromise && !opts.force) {
    await loadPromise;
    return cache;
  }
  loadPromise = Promise.resolve().then(() => {
    if (opts.force) cache.jobs = [];
    return loadPosterDataSync(opts);
  });
  await loadPromise;
  loadPromise = null;
  return cache;
}

export async function reloadPosterData(opts = {}) {
  loadPromise = null;
  cache.jobs = [];
  const result = loadPosterDataSync(opts);
  console.log(
    `[jewelheart.poster-data] reloaded ${result.jobs.length} jobs from ${cache.sources.jobsXlsx || 'fallback'}`,
  );
  return result;
}

export function getPosterDataStatus() {
  return {
    loaded: cache.jobs.length > 0,
    jobCount: cache.jobs.length,
    loadedAt: cache.loadedAt,
    sources: cache.sources,
    loadError: cache.loadError,
  };
}

export function getPosterSearchJobs() {
  try {
    ensureLoadedSync();
  } catch {
    return [];
  }
  return cache.jobs;
}

export function getPosterJobInstructions(posterId) {
  return cache.instructions[String(posterId || '')] || null;
}

export function getPosterJobInstructionsMap() {
  return cache.instructions;
}

export function posterJobMetaByTitle(title) {
  const want = normPosterTitle(title);
  if (!want) return null;
  return getPosterSearchJobs().find(
    (j) =>
      normPosterTitle(j.title) === want ||
      normPosterTitle(j.dbTitle) === want ||
      normPosterTitle(j.id) === want,
  ) || null;
}

export function posterJobOrderIndex(titleOrId) {
  const key = normPosterTitle(titleOrId);
  if (cache.orderMap.has(key)) return cache.orderMap.get(key);
  if (cache.orderMap.has(String(titleOrId))) return cache.orderMap.get(String(titleOrId));
  return Number.MAX_SAFE_INTEGER;
}

export function posterCheckinsRequired(posterJobOrTitle) {
  if (posterJobOrTitle && typeof posterJobOrTitle === 'object') {
    return posterJobOrTitle.checkinsRequired ?? 1;
  }
  const meta = posterJobMetaByTitle(posterJobOrTitle) ||
    getPosterSearchJobs().find((j) => j.id === posterJobOrTitle);
  return meta?.checkinsRequired ?? 1;
}

// Warm cache on module import (non-blocking).
ensurePosterDataLoadedAsync().catch(() => {});
