import { query } from './src/db.js';
import { buildJewelheartHomeScreen } from './src/jewelheart/jewelheart-sdui-home.js';

const uid = 'drjSixLe9TMVCeP6J8u0Rf86XUi1';
const adminCheck = await query('SELECT 1 FROM jewelheart_admins WHERE firebase_uid = $1', [uid]);
console.log('is global admin:', adminCheck.rows.length > 0);

const screen = await buildJewelheartHomeScreen(uid, undefined, {});
const footer = screen?.components?.find((c) => c?.children?.some?.((x) => x?.children?.length));
const flat = JSON.stringify(screen);
console.log('has Admin pill:', flat.includes('"Admin"') && flat.includes('adminWorkspace'));
console.log('buildStamp:', screen?.metadata?.buildStamp);
