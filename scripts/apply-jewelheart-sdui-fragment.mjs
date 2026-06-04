#!/usr/bin/env node
/**
 * Deploy volunteer SDUI home to KarmaDots private-server sduiScreens.js:
 *   - copies integrations/private-server/jewelheart-sdui-home.js
 *   - wires jewelheart.home → buildJewelheartHomeScreen (replaces legacy hub buttons)
 *
 * Default target (sibling repo):
 *   ../buddhist-stone-ios-app/private-server/src/jewelheart
 *
 * Production laptop (typical):
 *   JEWELHEART_PRIVATE_SERVER_SRC=~/private-server/src/jewelheart node scripts/apply-jewelheart-sdui-fragment.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const integrationDir = path.join(repoRoot, 'integrations', 'private-server');
const homeModuleSrc = path.join(integrationDir, 'jewelheart-sdui-home.js');

const defaultJewelDir = path.resolve(repoRoot, '..', 'buddhist-stone-ios-app', 'private-server', 'src', 'jewelheart');
const jewelDir = process.env.JEWELHEART_PRIVATE_SERVER_SRC || defaultJewelDir;

const sduiScreensPath = path.join(jewelDir, 'sduiScreens.js');
const homeModuleDest = path.join(jewelDir, 'jewelheart-sdui-home.js');

const importLine =
  "import { buildJewelheartHomeScreen, buildJewelheartVolunteerSearchScreen, buildJewelheartVolunteerAssignScreen, buildJewelheartVolunteerCheckinScreen, buildJewelheartVolunteerMessagesScreen, buildJewelheartVolunteerMineScreen, buildJewelheartVolunteerAccountScreen, buildJewelheartVolunteerPreferencesScreen } from './jewelheart-sdui-home.js';";
const accountCaseBlock = `    case 'jewelheart.volunteer.account':
      return wrap(
        await buildJewelheartVolunteerAccountScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );`;
const preferencesCaseBlock = `    case 'jewelheart.volunteer.preferences':
      return wrap(
        await buildJewelheartVolunteerPreferencesScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );`;
const mineCaseBlock = `    case 'jewelheart.volunteer.mine':
      return wrap(
        await buildJewelheartVolunteerMineScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );`;
const checkinCaseBlock = `    case 'jewelheart.volunteer.checkin':
      return wrap(
        await buildJewelheartVolunteerCheckinScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );`;
const messagesCaseBlock = `    case 'jewelheart.volunteer.messages':
      return wrap(
        await buildJewelheartVolunteerMessagesScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );`;
const homeCaseBlock = `    case 'jewelheart.home':
    case 'home':
      return wrap(await buildJewelheartHomeScreen(firebaseUid, authToken));`;
const searchCaseBlock = `    case 'jewelheart.volunteer.search':
      return wrap(
        await buildJewelheartVolunteerSearchScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );`;
const assignCaseBlock = `    case 'jewelheart.volunteer.assign':
      return wrap(
        await buildJewelheartVolunteerAssignScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );`;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function copyHomeModule() {
  const body = fs.readFileSync(homeModuleSrc, 'utf8');
  if (fs.existsSync(homeModuleDest) && fs.readFileSync(homeModuleDest, 'utf8') === body) {
    console.log(`Up to date: ${homeModuleDest}`);
  } else {
    fs.writeFileSync(homeModuleDest, body, 'utf8');
    console.log(`Wrote ${homeModuleDest}`);
  }
}

function patchSduiScreens() {
  let src = fs.readFileSync(sduiScreensPath, 'utf8');

  if (!src.includes(importLine)) {
    const anchor = "import { assertUuid } from './service.js';";
    if (!src.includes(anchor)) die(`sduiScreens.js: expected anchor not found: ${anchor}`);
    src = src.replace(anchor, `${anchor}\n${importLine}`);
  }

  const legacyCase = /    case 'jewelheart\.home':\s*\n    case 'home':\s*\n      return wrap\(await screenHome\(\)\);/;
  if (legacyCase.test(src)) {
    src = src.replace(legacyCase, homeCaseBlock);
  } else if (!src.includes('buildJewelheartHomeScreen(firebaseUid, authToken)')) {
    die('sduiScreens.js: jewelheart.home case not in expected form (already patched or layout changed).');
  }

  if (!src.includes("case 'jewelheart.volunteer.search':")) {
    const homeCaseAnchor = homeCaseBlock.split('\n')[0];
    if (!src.includes(homeCaseAnchor)) {
      die('sduiScreens.js: cannot find jewelheart.home case to insert volunteer search/assign routes.');
    }
    src = src.replace(
      homeCaseBlock,
      `${homeCaseBlock}\n${searchCaseBlock}\n${assignCaseBlock}`,
    );
    console.log('Added jewelheart.volunteer.search and jewelheart.volunteer.assign cases.');
  }

  if (!src.includes("case 'jewelheart.volunteer.checkin':")) {
    const assignAnchor = assignCaseBlock.split('\n').slice(-1)[0];
    if (!src.includes(assignCaseBlock)) {
      die('sduiScreens.js: cannot find volunteer assign case to insert checkin/messages routes.');
    }
    src = src.replace(assignCaseBlock, `${assignCaseBlock}\n${checkinCaseBlock}\n${messagesCaseBlock}`);
    console.log('Added jewelheart.volunteer.checkin and jewelheart.volunteer.messages cases.');
  }

  if (!src.includes("case 'jewelheart.volunteer.mine':")) {
    if (!src.includes(messagesCaseBlock)) {
      die('sduiScreens.js: cannot find volunteer messages case to insert mine route.');
    }
    src = src.replace(messagesCaseBlock, `${messagesCaseBlock}\n${mineCaseBlock}`);
    console.log('Added jewelheart.volunteer.mine case.');
  }

  if (!src.includes("case 'jewelheart.volunteer.account':")) {
    if (!src.includes(mineCaseBlock)) {
      die('sduiScreens.js: cannot find volunteer mine case to insert account/preferences routes.');
    }
    src = src.replace(mineCaseBlock, `${mineCaseBlock}\n${accountCaseBlock}\n${preferencesCaseBlock}`);
    console.log('Added jewelheart.volunteer.account and jewelheart.volunteer.preferences cases.');
  }

  const partialImport =
    "import { buildJewelheartHomeScreen, buildJewelheartVolunteerSearchScreen, buildJewelheartVolunteerAssignScreen } from './jewelheart-sdui-home.js';";
  if (src.includes(partialImport) && !src.includes('buildJewelheartVolunteerCheckinScreen')) {
    src = src.replace(partialImport, importLine);
    console.log('Extended jewelheart-sdui-home import with checkin/messages builders.');
  } else if (src.includes("buildJewelheartHomeScreen } from './jewelheart-sdui-home.js'")) {
    src = src.replace(
      "import { buildJewelheartHomeScreen } from './jewelheart-sdui-home.js';",
      importLine,
    );
  } else if (!src.includes('buildJewelheartVolunteerSearchScreen')) {
    const homeImport = "import { buildJewelheartHomeScreen } from './jewelheart-sdui-home.js';";
    if (src.includes(homeImport)) {
      src = src.replace(homeImport, importLine);
    }
  }

  const screenHomeRe =
    /\nasync function screenHome\(\) \{\s*return \{[\s\S]*?\n\}\n\nasync function screenRetreatList/;
  if (screenHomeRe.test(src)) {
    src = src.replace(screenHomeRe, '\n\nasync function screenRetreatList');
    console.log('Removed legacy screenHome() from sduiScreens.js');
  }

  const before = fs.readFileSync(sduiScreensPath, 'utf8');
  if (src === before) {
    console.log('sduiScreens.js already wired for volunteer home.');
  } else {
    fs.writeFileSync(sduiScreensPath, src, 'utf8');
    console.log(`Wrote ${sduiScreensPath}`);
  }
}

if (!fs.existsSync(jewelDir)) {
  die(
    `JewelHeart private-server src not found:\n  ${jewelDir}\n` +
      'Set JEWELHEART_PRIVATE_SERVER_SRC to …/private-server/src/jewelheart',
  );
}
for (const p of [homeModuleSrc, sduiScreensPath]) {
  if (!fs.existsSync(p)) die(`Missing file: ${p}`);
}

copyHomeModule();
patchSduiScreens();
console.log('Done. Restart private-server (launchd/pm2) so api.karmadots.org serves the new home screen.');
