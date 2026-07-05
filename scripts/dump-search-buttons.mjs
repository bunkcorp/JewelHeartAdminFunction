import { buildJewelheartVolunteerSearchScreen } from '../integrations/private-server/jewelheart-sdui-home.js';

const uid = process.argv[2] || 'drjSixLe9TMVCeP6J8u0Rf86XUi1';
const s = await buildJewelheartVolunteerSearchScreen(uid, undefined, { daysAll: '1', jobsAll: '1' });

function findBtn(nodes, pred) {
  for (const n of nodes || []) {
    if (pred(n)) return n;
    const c = findBtn(n.children, pred);
    if (c) return c;
  }
  return null;
}

const header = s.metadata?.stickyHeaderComponents || [];
const allDays = findBtn(header, (n) => n.label === 'All days' || n.content === 'All days');
const jobBtn = findBtn(s.components, (n) => n.type === 'button' && n.action?.payload?.jobsAll === '0');
console.log('screen.id', s.id);
console.log('All days action', JSON.stringify(allDays?.action, null, 2));
console.log('Job toggle action', JSON.stringify(jobBtn?.action, null, 2));
