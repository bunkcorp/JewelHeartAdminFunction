import fs from 'fs';
import path from 'path';
import os from 'os';

const sheet = fs.readFileSync(
  path.join(os.tmpdir(), 'xlsx-v8b', 'xl', 'worksheets', 'sheet4.xml'),
  'utf8',
);
const row = sheet.match(/<row r="2"[\s\S]*?<\/row>/)[0];
console.log(row);
