import {
  buildJewelheartVolunteerSearchByTypeScreen,
} from '../integrations/private-server/jewelheart-sdui-home.js';

const uid = 'drjSixLe9TMVCeP6J8u0Rf86XUi1';

// After job type selected (stale client params).
const stale = {
  jobsAll: '0',
  jobType: 'f',
  selectedJobs: '',
  daysAll: '1',
};
const staleScreen = await buildJewelheartVolunteerSearchByTypeScreen(uid, undefined, stale);
const staleJson = JSON.stringify(staleScreen);
console.log('stale: typeSelected', /Food\\nareas/.test(staleJson) && staleJson.includes('"backgroundColor":"#92160e"'));

// All Jobs tap payload.
const reset = {
  jobsAll: '1',
  jobType: '',
  selectedJobs: '',
  typeJobPrefs: '',
  allJobsTap: '1',
  daysAll: '1',
};
const resetScreen = await buildJewelheartVolunteerSearchByTypeScreen(uid, undefined, reset);
const resetJson = JSON.stringify(resetScreen);
console.log('reset stamp', resetScreen.metadata?.buildStamp);
console.log('reset has allJobsTap in button', resetJson.includes('allJobsTap'));
