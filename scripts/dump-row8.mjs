import fs from 'fs';
import path from 'path';
import os from 'os';

const sheet = fs.readFileSync(
  path.join(os.tmpdir(), 'xlsx-v8b', 'xl', 'worksheets', 'sheet4.xml'),
  'utf8',
);
const row = sheet.match(/<row r="8"[\s\S]*?<\/row>/)[0];
for (const col of ['B', 'C', 'D', 'E', 'F', 'G']) {
  const re = new RegExp(`<c r="${col}8"[^>]*>([\\s\\S]*?)</c>|<c r="${col}8"[^>]*/>`);
  const m = row.match(re);
  console.log(col, m ? m[0] : 'none');
}
