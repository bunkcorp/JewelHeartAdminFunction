import fs from 'fs';
import path from 'path';
import os from 'os';

const xlsxPath =
  process.argv[2] ||
  'c:/Data/dev/RetreatVolunteer/Redesign/Retreat_Volunteer_Schedule v8, w abbrevs.xlsx';

const POSTER_DAY_COL_ISOS = {
  B: '2026-07-20',
  C: '2026-07-21',
  D: '2026-07-22',
  E: '2026-07-23',
  F: '2026-07-24',
  G: '2026-07-25',
};

const JOB_IDS = [
  'poster-cafe-lunch-light',
  'poster-cafe-eod-full',
  'poster-kitchen-lunch-light',
  'poster-kitchen-eod-full',
  'poster-coffee-morning',
  'poster-coffee-evening',
  'poster-tara-vacuum',
  'poster-jh-hallway-vacuum',
  'poster-coatrm-vacuum',
  'poster-foyer-vacuum',
  'poster-lama-offices',
  'poster-mens-room',
  'poster-urinals',
  'poster-womens-room',
  'poster-unisex-lama',
  'poster-front-windows',
  'poster-towels-launder',
];

function parseSharedStrings(xml) {
  const strings = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const block = m[1];
    if (block.includes('<t')) {
      strings.push(
        [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((x) => x[1].replace(/&#10;/g, '\n').replace(/&amp;/g, '&'))
          .join(''),
      );
    } else strings.push('');
  }
  return strings;
}

function cellValue(cellXml, strings) {
  const t = cellXml.match(/ t="([^"]+)"/);
  const v = cellXml.match(/<v>([^<]*)<\/v>/);
  if (v) {
    if (t && t[1] === 's') return strings[+v[1]] || '';
    return v[1];
  }
  const is = cellXml.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
  if (is) return is[1].replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
  return '';
}

/** Poster convention: blank cell = scheduled; XXXXX = not scheduled. */
function isScheduledCell(cellXml, strings) {
  if (!cellXml) return false;
  if (/<c[^>]*\/>/.test(cellXml)) return true;
  const val = cellValue(cellXml, strings).trim();
  if (!val) return true;
  if (/^X+$/i.test(val)) return false;
  return true;
}

function rowCellXml(rowXml, col, rowNum) {
  const self = rowXml.match(new RegExp(`<c r="${col}${rowNum}"[^>]*/>`));
  if (self) return self[0];
  const open = rowXml.match(new RegExp(`<c r="${col}${rowNum}"[^>]*>[\\s\\S]*?</c>`));
  return open ? open[0] : null;
}

function rowCells(rowXml, rowNum, strings) {
  const out = {};
  for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J']) {
    const xml = rowCellXml(rowXml, col, rowNum);
    out[col] = xml ? cellValue(xml, strings) : '';
    out[`_${col}_xml`] = xml;
  }
  return out;
}

const tmpZip = path.join(os.tmpdir(), 'poster-v8.zip');
fs.copyFileSync(xlsxPath, tmpZip);

const base = path.join(os.tmpdir(), 'xlsx-v8b', 'xl');
const strings = parseSharedStrings(fs.readFileSync(path.join(base, 'sharedStrings.xml'), 'utf8'));
const sheet = fs.readFileSync(path.join(base, 'worksheets', 'sheet4.xml'), 'utf8');

const jobs = [];
for (let r = 2; r <= 18; r++) {
  const rowXml = sheet.match(new RegExp(`<row r="${r}"[\\s\\S]*?</row>`));
  if (!rowXml) continue;
  const cells = rowCells(rowXml[0], r, strings);
  const job = (cells.A || '').replace(/\r?\n/g, ' / ').trim();
  const abbrev = (cells.J || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  const scheduledDayIsos = [];
  for (const [col, iso] of Object.entries(POSTER_DAY_COL_ISOS)) {
    const xml = cells[`_${col}_xml`];
    if (isScheduledCell(xml, strings)) scheduledDayIsos.push(iso);
  }
  jobs.push({ id: JOB_IDS[r - 2], title: job, abbrev, scheduledDayIsos });
}

console.log(JSON.stringify(jobs, null, 2));

// Quick sanity: Tue+Wed × first 4 daily jobs
const tueWed = ['2026-07-21', '2026-07-22'];
const pick = jobs.slice(0, 4);
let n = 0;
for (const j of pick) {
  for (const d of tueWed) if (j.scheduledDayIsos.includes(d)) n++;
}
console.error('sanity first4jobs TueWed shifts:', n);
