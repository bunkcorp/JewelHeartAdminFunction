#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
const xlsx = process.argv[2] || '/tmp/test-poster.xlsx';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-'));
execSync(`unzip -qo "${xlsx}" -d "${tmp}"`, { stdio: 'pipe' });
const sheet = fs.readFileSync(path.join(tmp, 'xl/worksheets/sheet4.xml'), 'utf8');
const row = process.argv[3] || '2';
const m = sheet.match(new RegExp(`<row r="${row}"[^>]*>([\\s\\S]*?)<\\/row>`));
if (m) {
  for (const c of m[1].match(new RegExp(`<c r="[A-I]${row}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`, 'g')) || []) {
    console.log(c);
  }
}
