import { buildJewelheartVolunteerSearchScreen } from '../src/jewelheart/jewelheart-sdui-home.js';

const s = await buildJewelheartVolunteerSearchScreen('drjSixLe9TMVCeP6J8u0Rf86XUi1', undefined, {
  daysAll: '1',
  jobsAll: '1',
});

function findBtn(nodes, pred) {
  for (const n of nodes || []) {
    if (pred(n)) return n;
    const c = findBtn(n.children, pred);
    if (c) return c;
  }
  return null;
}

const header = s.metadata?.stickyHeaderComponents || [];
const allDays = findBtn(header, (n) => n.content === 'All days');
console.log('screen.id', s.id);
console.log('has action', Boolean(allDays?.action));
console.log(JSON.stringify(allDays?.action, null, 2));
