#!/usr/bin/env node
/**
 * Deploy jewelheart.home volunteer SDUI to KarmaDots private-server sduiScreens.js.
 *
 * Copies integrations/private-server/jewelheart-home-sdui.module.js into the target
 * jewelheart folder and wires createJewelheartHomeSdui + jewelheart.home case.
 *
 * Default target (sibling of this repo):
 *   ../buddhist-stone-ios-app/private-server/src/jewelheart
 *
 * Production laptop (typical):
 *   JEWELHEART_PRIVATE_SERVER_SRC=~/private-server/src/jewelheart
 *
 * Override:
 *   JEWELHEART_PRIVATE_SERVER_SRC=/path/to/private-server/src/jewelheart \
 *     node scripts/apply-jewelheart-sdui-fragment.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const integrationDir = path.join(repoRoot, 'integrations', 'private-server');

const defaultJewelDir = path.resolve(repoRoot, '..', 'buddhist-stone-ios-app', 'private-server', 'src', 'jewelheart');
const jewelDir = process.env.JEWELHEART_PRIVATE_SERVER_SRC || defaultJewelDir;

const sduiPath = path.join(jewelDir, 'sduiScreens.js');
const moduleSrc = path.join(integrationDir, 'jewelheart-home-sdui.module.js');
const moduleDest = path.join(jewelDir, 'jewelheart-home-sdui.module.js');

const MARKER = 'jewelheart-home-sdui.module.js';
const HOME_CASE =
  "  if (screenId === 'jewelheart.home') {\n" +
  '    if (retreatId) {\n' +
  "      assertUuid(retreatId, 'retreatId');\n" +
  '      await acl.assertRetreatAccess(firebaseUid, retreatId);\n' +
  '    }\n' +
  '    return jewelheartHomeSdui(firebaseUid);\n' +
  '  }\n';

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function usesEsm(source) {
  return /^\s*import\s+/m.test(source) || /^\s*export\s+/m.test(source);
}

function addNamedImport(source, esm, { from, names }) {
  const missing = names.filter((n) => !new RegExp(`\\b${n}\\b`).test(source));
  if (!missing.length) return source;

  if (esm) {
    const re = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${from.replace(/\./g, '\\.')}['"]`);
    const m = source.match(re);
    if (m) {
      const merged = `${m[1].trim().replace(/,\s*$/, '')}, ${missing.join(', ')}`;
      return source.replace(re, `import { ${merged} } from '${from}'`);
    }
    return `import { ${missing.join(', ')} } from '${from}';\n${source}`;
  }

  const re = new RegExp(
    `(?:const|let)\\s*\\{([^}]+)\\}\\s*=\\s*require\\(['"]${from.replace(/\./g, '\\.')}(?:\\.js)?['"]\\)`,
  );
  const m = source.match(re);
  if (m) {
    const merged = `${m[1].trim().replace(/,\s*$/, '')}, ${missing.join(', ')}`;
    return source.replace(re, `const { ${merged} } = require('${from}')`);
  }
  return `const { ${missing.join(', ')} } = require('${from}');\n${source}`;
}

function ensureImports(source, esm) {
  if (source.includes(MARKER) && source.includes('createJewelheartHomeSdui')) {
    return source;
  }

  const head = esm
    ? "import { createJewelheartHomeSdui } from './jewelheart-home-sdui.module.js';\n"
    : "const { createJewelheartHomeSdui } = require('./jewelheart-home-sdui.module.js');\n";

  let next = source.includes(MARKER) ? source : head + source;
  next = addNamedImport(next, esm, { from: './service.js', names: ['listRetreats', 'getScheduleByDay'] });
  next = addNamedImport(next, esm, { from: '../db.js', names: ['query'] });
  if (!esm) {
    next = next.replace("from './service.js'", "from './service'");
    next = next.replace("from '../db.js'", "from '../db'");
    next = next.replace("require('./service.js')", "require('./service')");
    next = next.replace("require('../db.js')", "require('../db')");
  }
  return next;
}

function ensureFactory(source) {
  if (source.includes('const jewelheartHomeSdui = createJewelheartHomeSdui')) {
    return source;
  }
  const block =
    '\nconst jewelheartHomeSdui = createJewelheartHomeSdui({ listRetreats, getScheduleByDay, query });\n';
  const anchor = /export\s+async\s+function\s+sduiScreen|async\s+function\s+sduiScreen|function\s+sduiScreen/;
  const m = source.match(anchor);
  if (!m) die('sduiScreens.js: could not find sduiScreen function to insert factory before.');
  return source.slice(0, m.index) + block + source.slice(m.index);
}

function replaceHomeCase(source) {
  const re = /if\s*\(\s*screenId\s*===\s*['"]jewelheart\.home['"]\s*\)\s*\{[\s\S]*?\n\s*\}/;
  if (re.test(source)) {
    return source.replace(re, HOME_CASE.trimEnd());
  }
  const anchor = /if\s*\(\s*screenId\s*===\s*['"]retreat\.list['"]\s*\)/;
  if (!anchor.test(source)) {
    die("sduiScreens.js: add jewelheart.home case manually next to other screenId branches.");
  }
  return source.replace(anchor, HOME_CASE + '\n  ' + source.match(anchor)[0]);
}

function alreadyApplied(source) {
  return (
    source.includes(MARKER) &&
    source.includes('return jewelheartHomeSdui(firebaseUid)') &&
    source.includes('createJewelheartHomeSdui')
  );
}

if (!fs.existsSync(jewelDir)) {
  die(
    `JewelHeart private-server src not found:\n  ${jewelDir}\n` +
      'Set JEWELHEART_PRIVATE_SERVER_SRC to your …/private-server/src/jewelheart directory.',
  );
}
if (!fs.existsSync(sduiPath)) {
  die(`Missing sduiScreens.js:\n  ${sduiPath}`);
}
if (!fs.existsSync(moduleSrc)) {
  die(`Missing module source:\n  ${moduleSrc}`);
}

let sdui = fs.readFileSync(sduiPath, 'utf8');
if (alreadyApplied(sdui)) {
  console.log('sduiScreens.js already wires jewelheart.home to jewelheartHomeSdui.');
  process.exit(0);
}

const esm = usesEsm(sdui);
fs.copyFileSync(moduleSrc, moduleDest);
console.log(`Wrote ${moduleDest}`);

sdui = ensureImports(sdui, esm);
sdui = ensureFactory(sdui);
sdui = replaceHomeCase(sdui);

fs.writeFileSync(sduiPath, sdui, 'utf8');
console.log(`Wrote ${sduiPath}`);
console.log('Done. Restart the private-server Node process (see integrations/private-server/README.txt).');
