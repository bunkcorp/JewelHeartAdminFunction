import { buildJewelheartVolunteerSearchByTypeScreen } from '../integrations/private-server/jewelheart-sdui-home.js';

const uid = 'drjSixLe9TMVCeP6J8u0Rf86XUi1';

function findTypeButtonPayload(screen, code) {
  const json = JSON.stringify(screen);
  const re = new RegExp(`"label":"[^"]*"[\\s\\S]*?"action":\\{"type":"navigate","target":"jewelheart\\.volunteer\\.searchByType","payload":\\{([^}]*)\\}`, 'g');
  // Walk components for type buttons by code in jobType payload
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'button' && n.action?.payload?.jobType === code) return n.action.payload;
      const found = walk(n.children);
      if (found) return found;
    }
    return null;
  };
  const header = screen.metadata?.stickyHeaderComponents || [];
  return walk(header);
}

function findAllJobsPayload(screen) {
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'button' && (n.label === 'All jobs' || n.content === 'All jobs')) {
        return n.action?.payload ?? null;
      }
      const found = walk(n.children);
      if (found) return found;
    }
    return null;
  };
  return walk(screen.metadata?.stickyHeaderComponents || []);
}

function visibleJobCount(screen) {
  const walk = (nodes) => {
    let c = 0;
    for (const n of nodes || []) {
      if (n.type === 'button' && n.action?.payload?.selectedJobs !== undefined && n.label !== 'All jobs' && !String(n.label).includes('\n')) c++;
      c += walk(n.children);
    }
    return c;
  };
  return walk(screen.components || []);
}

async function step(label, params) {
  const screen = await buildJewelheartVolunteerSearchByTypeScreen(uid, undefined, params);
  const allJobs = findAllJobsPayload(screen);
  const fType = findTypeButtonPayload(screen, 'f');
  const jobs = visibleJobCount(screen);
  console.log(`\n=== ${label} ===`);
  console.log('params in:', JSON.stringify(params));
  console.log('visible job buttons:', jobs);
  console.log('All Jobs payload:', allJobs);
  console.log('Food type payload:', fType);
  console.log('All Jobs noAction:', !allJobs || JSON.stringify(screen).includes('"label":"All jobs"') && !JSON.stringify(screen).match(/"label":"All jobs"[\s\S]*?"action"/));
  return { screen, allJobs, fType };
}

// Cycle: All Jobs -> Type f -> All Jobs -> Type f
let params = { daysAll: '1', jobsAll: '1', filterReset: '1' };
let s = await step('1 initial / all jobs', params);

params = { ...s.fType, daysAll: '1' };
s = await step('2 after type f tap', params);

params = { ...s.allJobs, daysAll: '1' };
s = await step('3 after all jobs tap', params);

params = { ...s.fType, daysAll: '1' };
s = await step('4 after second type f tap (BUG?)', params);

// Simulate stale client: jobsAll=1 still set when type tapped
const stale = { daysAll: '1', jobsAll: '1', jobType: 'f', selectedJobs: 'x,y', typeJobPrefs: '' };
await step('5 stale jobsAll=1 + jobType=f', stale);
