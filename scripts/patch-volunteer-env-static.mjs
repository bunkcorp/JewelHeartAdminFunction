#!/usr/bin/env node
/**
 * Patch private-server src/index.js: serve volunteer app at /dev, /test, /retreat.
 * Maps public/{env}/index.html -> https://api-{env}.karmadots.org/{env}/
 */
import fs from 'node:fs';

const indexPath = process.env.JH_INDEX_PATH || process.argv[2];
if (!indexPath) {
  console.error('usage: JH_INDEX_PATH=src/index.js node patch-volunteer-env-static.mjs');
  process.exit(1);
}

const MARKER = '/* jh-volunteer-env-static */';
let src = fs.readFileSync(indexPath, 'utf8');

if (src.includes(MARKER)) {
  console.log('already patched for volunteer env static');
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

const block = `
${MARKER}
for (const jhVolEnv of ['dev', 'test', 'retreat']) {
  app.use(
    \`/\${jhVolEnv}\`,
    express.static(path.join(__dirname, \`../public/\${jhVolEnv}\`), {
      index: 'index.html',
      maxAge: 0,
      etag: true,
    }),
  );
}
`;

const loginStatic = "express.static(path.join(__dirname, '../public/login')";
const urlencoded = 'app.use(express.urlencoded({ extended: false }));';

if (src.includes(loginStatic)) {
  const idx = src.indexOf(loginStatic);
  const close = src.indexOf(');', idx);
  if (close === -1) {
    console.error('could not find end of /login static block');
    process.exit(1);
  }
  const after = close + 3;
  src = `${src.slice(0, after)}\n${block}${src.slice(after)}`;
} else if (src.includes(urlencoded)) {
  src = src.replace(urlencoded, `${urlencoded}\n${block}`);
} else {
  console.error('could not find insertion point in index.js');
  process.exit(1);
}

fs.writeFileSync(indexPath, src);
console.log('Patched volunteer env static routes in', indexPath);
