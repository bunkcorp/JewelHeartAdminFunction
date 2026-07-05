import {
  buildJewelheartHomeScreen,
  buildJewelheartVolunteerSearchScreen,
} from '../src/jewelheart/jewelheart-sdui-home.js';

const uid = 'drjSixLe9TMVCeP6J8u0Rf86XUi1';

function walkAll(nodes, pred, out = []) {
  for (const n of nodes || []) {
    if (pred(n)) out.push(n);
    walkAll(n.children, pred, out);
  }
  return out;
}

function summarize(node) {
  if (!node) return null;
  return {
    type: node.type,
    label: node.label ?? node.content,
    parentCentered: node.style?.parentCentered ?? null,
    homeActionPill: node.style?.homeActionPill ?? null,
    fullBleed: node.style?.fullBleed ?? null,
    bg: node.style?.backgroundColor ?? null,
    height: node.style?.height?.value ?? null,
    hasAction: !!node.action,
    actionType: node.action?.type ?? null,
    target: node.action?.target ?? null,
  };
}

const home = await buildJewelheartHomeScreen(uid, undefined, {});
const homeNodes = home.components;
const goldPills = walkAll(homeNodes, (n) =>
  n.type === 'button' && (n.style?.backgroundColor || '').toUpperCase() === '#FFCA10');
const maroonPills = walkAll(homeNodes, (n) =>
  n.type === 'button' && (n.style?.backgroundColor || '').toUpperCase() === '#92160E');

console.log('=== HOME ===');
console.log('buildStamp', home.metadata?.buildStamp);
console.log('gold buttons:', JSON.stringify(goldPills.map(summarize), null, 2));
console.log('first maroon button:', JSON.stringify(summarize(maroonPills[0]), null, 2));

const find = await buildJewelheartVolunteerSearchScreen(uid, undefined, { daysAll: '1', jobsAll: '1' });
const findBtns = walkAll(find.components, (n) => n.type === 'button');
console.log('=== FIND ===');
console.log('buildStamp', find.metadata?.buildStamp);
console.log('layoutFlat', find.metadata?.layoutFlat, 'stickyHeader', find.metadata?.stickyHeader);
console.log('button count:', findBtns.length);
console.log(
  'buttons:',
  JSON.stringify(
    findBtns.map((b) => ({
      label: b.label ?? b.content,
      hasAction: !!b.action,
      target: b.action?.target,
      daysAll: b.action?.payload?.daysAll,
      jobsAll: b.action?.payload?.jobsAll,
    })),
    null,
    2,
  ),
);
