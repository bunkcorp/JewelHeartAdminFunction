import fs from 'fs';
import path from 'path';
import os from 'os';

const base = path.join(os.tmpdir(), 'xlsx-v8b', 'xl');
const xml = fs.readFileSync(path.join(base, 'sharedStrings.xml'), 'utf8');
const strings = [];
for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  const block = m[1];
  strings.push(
    block.includes('<t')
      ? [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')
      : '',
  );
}
console.log('string 179:', JSON.stringify(strings[179]));

const sheet = fs.readFileSync(path.join(base, 'worksheets', 'sheet4.xml'), 'utf8');
for (const r of [2, 6, 8, 13, 14]) {
  const row = sheet.match(new RegExp(`<row r="${r}"[\\s\\S]*?</row>`))[0];
  console.log('\n--- row', r, '---');
  for (const col of ['B', 'C', 'D', 'E', 'F', 'G']) {
    const cm = row.match(new RegExp(`<c r="${col}${r}"([^>]*)>[\\s\\S]*?</c>`));
    if (!cm) {
      console.log(col, 'MISSING');
      continue;
    }
    const attrs = cm[1];
    const v = cm[0].match(/<v>([^<]*)<\/v>/);
    let val = '';
    if (v) {
      val = attrs.includes('t="s"') ? strings[+v[1]] : v[1];
    }
    console.log(col, attrs.trim(), JSON.stringify(val || '(empty)'));
  }
}
