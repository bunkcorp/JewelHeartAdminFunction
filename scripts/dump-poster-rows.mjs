import fs from 'fs';
import path from 'path';
import os from 'os';

const sheet = fs.readFileSync(
  path.join(os.tmpdir(), 'xlsx-v8b', 'xl', 'worksheets', 'sheet4.xml'),
  'utf8',
);
for (const r of [2, 6, 8, 13, 14]) {
  const row = sheet.match(new RegExp(`<row r="${r}"[\\s\\S]*?</row>`))[0];
  console.log('\nROW', r);
  for (const col of ['B', 'C', 'D', 'E', 'F', 'G']) {
    const m = row.match(new RegExp(`<c r="${col}${r}"[^/]*/?>`));
    console.log(col, m ? m[0] : 'none');
  }
}
