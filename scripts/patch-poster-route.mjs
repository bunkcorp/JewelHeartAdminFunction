#!/usr/bin/env node
/**
 * Idempotently wire GET …/reports/poster-master into prod routes/jewelheart.js.
 * Run on prod: node scripts-inspect/patch-poster-route.mjs
 */
import fs from 'fs';

const PATH = new URL('../src/routes/jewelheart.js', import.meta.url).pathname;
let src = fs.readFileSync(PATH, 'utf8');
const orig = src;

if (!src.includes('jewelheart-poster-xlsx.js')) {
  const anchor = "import { HttpError } from '../jewelheart/errors.js';";
  if (!src.includes(anchor)) throw new Error('import anchor not found');
  src = src.replace(
    anchor,
    `${anchor}\nimport { buildPosterMasterXlsx } from '../jewelheart/jewelheart-poster-xlsx.js';`,
  );
  console.log('added poster import');
}

const routeBlock = `
router.get('/retreats/:retreatId/reports/poster-master', requireAuthDual, async (req, res) => {
  try {
    const out = await buildPosterMasterXlsx(req.uid, req.params.retreatId, req.authToken);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', \`attachment; filename="\${out.filename}"\`);
    res.send(out.buffer);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error('poster-master', e);
    res.status(status).json({ error: e.message || 'Server error' });
  }
});
`;

if (!src.includes("reports/poster-master")) {
  const anchor = "router.get('/retreats/:retreatId/reports/poster',";
  if (!src.includes(anchor)) throw new Error('poster route anchor not found');
  src = src.replace(anchor, routeBlock + anchor);
  console.log('added poster-master route');
}

if (src === orig) {
  console.log('already wired; no change');
} else {
  fs.writeFileSync(PATH, src, 'utf8');
  console.log('wrote', PATH);
}
