#!/usr/bin/env node
/** One-time patch: serve docs/login from GET /login on the API host (bypass stale GitHub Pages). */
import fs from 'fs';
import path from 'path';

const indexPath = process.argv[2] || '/Users/kevinwoods/private-server/src/index.js';
let src = fs.readFileSync(indexPath, 'utf8');

if (src.includes("express.static(path.join(__dirname, '../public/login')")) {
  console.log('index.js already patched for /login static');
  process.exit(0);
}

if (!src.includes("import path from 'path'")) {
  src = src.replace(
    "import express from 'express';",
    "import express from 'express';\nimport path from 'path';\nimport { fileURLToPath } from 'url';",
  );
}

if (!src.includes('const __dirname = path.dirname')) {
  src = src.replace(
    'const app = express();',
    "const __dirname = path.dirname(fileURLToPath(import.meta.url));\nconst app = express();",
  );
}

const marker = 'app.use(express.urlencoded({ extended: false }));';
const insert = `${marker}

app.use(
  '/login',
  express.static(path.join(__dirname, '../public/login'), {
    index: 'index.html',
    maxAge: 0,
    etag: true,
  }),
);`;

if (!src.includes(marker)) {
  console.error('Could not find urlencoded middleware marker in index.js');
  process.exit(1);
}

src = src.replace(marker, insert);
fs.writeFileSync(indexPath, src);
console.log('Patched', indexPath);
