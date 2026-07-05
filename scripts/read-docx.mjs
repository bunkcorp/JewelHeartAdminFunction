import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

const src = process.argv[2];
if (!src) { console.error('usage: node read-docx.mjs <file.docx>'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
const zipCopy = path.join(tmp, 'doc.zip');
fs.copyFileSync(src, zipCopy);
// Use PowerShell's compression to extract.
execSync(
  `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${tmp}' -Force"`,
  { stdio: 'inherit' },
);
const docXml = path.join(tmp, 'word', 'document.xml');
let xml = fs.readFileSync(docXml, 'utf8');
// Paragraph + break handling -> newlines, then strip tags.
xml = xml
  .replace(/<w:p[ >]/g, '\n<w:p ')
  .replace(/<w:tab\b[^>]*\/>/g, '\t')
  .replace(/<w:br\b[^>]*\/>/g, '\n')
  .replace(/<[^>]+>/g, '');
const text = xml
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\n{3,}/g, '\n\n')
  .trim();
console.log(text);
