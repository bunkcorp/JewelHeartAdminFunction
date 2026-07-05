/**
 * Load QA roster from People, test.xlsx (docs/sdui/fixtures/people-test.md).
 */
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseDumpRows(dumpText) {
  const rows = [];
  for (const line of dumpText.split('\n')) {
    const m = line.match(/^r(\d+):\s*(.+)$/);
    if (!m) continue;
    const rowNum = parseInt(m[1], 10);
    const cells = {};
    for (const part of m[2].matchAll(/([A-Z])="([^"]*)"/g)) {
      cells[part[1]] = part[2];
    }
    rows.push({ rowNum, cells });
  }
  return rows;
}

/** @returns {{ rowNum: number, displayName: string, email: string, phone: string, admin: boolean, manage: boolean }[]} */
export function loadPeopleTestFromXlsx(file, options = {}) {
  const nodeBin = options.nodeBin || process.execPath;
  const dumpScript = path.join(__dirname, '..', 'dump-xlsx.mjs');
  const dump = execSync(`"${nodeBin}" "${dumpScript}" "${file}"`, {
    encoding: 'utf8',
  });
  const parsed = parseDumpRows(dump);
  const people = [];
  for (const { rowNum, cells } of parsed) {
    if (rowNum === 1) continue;
    const first = (cells.A || '').trim();
    const last = (cells.B || '').trim();
    if (!first && !last) continue;
    people.push({
      rowNum,
      displayName: `${first} ${last}`.trim(),
      email: (cells.C || '').trim(),
      phone: (cells.D || '').trim(),
      admin: String(cells.E || '').trim() === '1',
      manage: String(cells.F || '').trim() === '1',
    });
  }
  return people;
}

export function defaultPeopleTestXlsxPath() {
  return path.resolve(__dirname, '../../docs/sdui/fixtures/people-test.xlsx');
}
