#!/usr/bin/env node
/**
 * Idempotently wire jewelheart.volunteer.admin into prod sduiScreens.js.
 * Run on prod: node scripts-inspect/patch-admin-route.mjs
 */
import fs from 'fs';

const PATH = new URL('../src/jewelheart/sduiScreens.js', import.meta.url).pathname;
let src = fs.readFileSync(PATH, 'utf8');
const orig = src;

const importAnchor = "  buildJewelheartVolunteerPreferencesScreen,\n} from './jewelheart-sdui-home.js';";
if (!src.includes('buildJewelheartVolunteerAdminScreen')) {
  if (!src.includes(importAnchor)) throw new Error('import anchor not found');
  src = src.replace(
    importAnchor,
    "  buildJewelheartVolunteerPreferencesScreen,\n  buildJewelheartVolunteerAdminScreen,\n} from './jewelheart-sdui-home.js';",
  );
  console.log('added admin import');
}

const adminCase = `    case 'jewelheart.volunteer.admin':
      return wrap(
        await buildJewelheartVolunteerAdminScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
`;
if (!src.includes("case 'jewelheart.volunteer.admin':")) {
  const caseAnchor = "    case 'retreat.list':";
  if (!src.includes(caseAnchor)) throw new Error('case anchor not found');
  src = src.replace(caseAnchor, adminCase + caseAnchor);
  console.log('added admin case');
}

if (src === orig) {
  console.log('already wired; no change');
} else {
  fs.writeFileSync(PATH, src, 'utf8');
  console.log('wrote', PATH);
}
