#!/usr/bin/env node
/**
 * Run person-picker matcher against People, test.xlsx (see docs/sdui/fixtures/people-test.md).
 */
import { defaultPeopleTestXlsxPath, loadPeopleTestFromXlsx } from './lib/people-test-xlsx.mjs';
import { filterPersonRoster, PERSON_PICKER_MAX_VISIBLE } from '../shared/jewelheart-person-search.js';

const xlsxPath = process.argv[2] || defaultPeopleTestXlsxPath();

function formatResult({ items, total, capped }, maxShow = 12) {
  const names = items.slice(0, maxShow).map((r) => r.displayName);
  const suffix = capped ? ` (${total} total — capped at ${PERSON_PICKER_MAX_VISIBLE})` : total ? ` (${total} match${total === 1 ? '' : 'es'})` : '';
  return names.length ? `${names.join(', ')}${suffix}` : `(no matches)${suffix}`;
}

const roster = loadPeopleTestFromXlsx(xlsxPath).map((p) => ({
  id: `row-${p.rowNum}`,
  displayName: p.displayName,
  email: p.email,
}));
console.log(`Source: ${xlsxPath}`);
console.log(`Roster: ${roster.length} people\n`);

const queries = [
  ['john', 'Moran, Madison, Schramm, Reese (may cap if >12)'],
  ['john m', 'Moran, Madison'],
  ['jo mo', 'Moran'],
  ['nancy', 'Beachum (×2), Foth'],
  ['kathy', 'Laritz (×2 emails)'],
  ['kevin', 'Woods (×2 rows in sheet)'],
  ['david', 'Bolitho, Lewis (×2)'],
  ['moore', "Moore, Moore-O'Leary"],
  ['kara', "Moore-O'Leary"],
  ['j t', 'Tseten only'],
  ['andy', 'JH'],
  ['ann', 'Anne* only (not Mann-Devos)'],
  ['x', 'no matches'],
];

console.log('=== Spec queries (person-picker.md / people-test.md) ===');
for (const [q, expectNote] of queries) {
  const result = filterPersonRoster(roster, q);
  console.log(`  "${q}" → ${formatResult(result)}`);
  console.log(`         expect: ${expectNote}`);
}

console.log('\n=== Single-letter smoke (should not all fail except rare letters) ===');
for (const letter of 'aejknm') {
  const result = filterPersonRoster(roster, letter);
  console.log(`  "${letter}" → ${result.total} matches${result.capped ? ' (capped)' : ''}`);
}

console.log('\n=== Every row reachable by first name prefix ===');
const unreachable = [];
for (const person of roster) {
  const firstWord = person.displayName.split(/\s+/)[0].toLowerCase();
  const prefix = firstWord.slice(0, Math.min(3, firstWord.length));
  if (!prefix) continue;
  const { total } = filterPersonRoster(roster, prefix);
  if (total === 0) unreachable.push(`${person.displayName} (tried "${prefix}")`);
}
if (unreachable.length) {
  console.log('  UNREACHABLE:', unreachable.join('; '));
} else {
  console.log(`  OK — all ${roster.length} rows match at least a 3-char first-name prefix`);
}
