import { buildJewelheartVolunteerSearchScreen } from '../src/jewelheart/jewelheart-sdui-home.js';

const uid = 'drjSixLe9TMVCeP6J8u0Rf86XUi1';
const s1 = await buildJewelheartVolunteerSearchScreen(uid, undefined, { daysAll: '1', jobsAll: '1' });
const s2 = await buildJewelheartVolunteerSearchScreen(uid, undefined, {
  daysAll: '0',
  selectedDays: '2026-07-20',
  jobsAll: '1',
});

function walk(nodes, pred) {
  for (const n of nodes || []) {
    if (pred(n)) return n;
    const f = walk(n.children, pred);
    if (f) return f;
  }
  return null;
}

const root1 = s1.components[0].children;
const root2 = s2.components[0].children;
const allDays1 = walk(root1, (n) => n.label === 'All days');
const allDays2 = walk(root2, (n) => n.label === 'All days');
console.log(
  JSON.stringify(
    {
      stamp: s1.metadata.buildStamp,
      allDays1: {
        hasAction: !!allDays1?.action,
        payload: allDays1?.action?.payload,
        bg: allDays1?.style?.backgroundColor,
      },
      allDays2: { bg: allDays2?.style?.backgroundColor },
      filterState1: s1.metadata.filterState,
      filterState2: s2.metadata.filterState,
    },
    null,
    2,
  ),
);
