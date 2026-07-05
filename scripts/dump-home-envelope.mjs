import { buildJewelheartHomeScreen } from '../integrations/private-server/jewelheart-sdui-home.js';

const s = await buildJewelheartHomeScreen('test', undefined, {});
console.log(JSON.stringify({
  id: s.id,
  stickyHeader: s.metadata?.stickyHeader,
  stickyFooter: s.metadata?.stickyFooter,
  homeSplit: s.metadata?.homeSplitLayout,
  headerCount: s.metadata?.stickyHeaderComponents?.length,
  footerCount: s.metadata?.stickyFooterComponents?.length,
  compCount: s.components?.length,
  compTypes: s.components?.map((c) => c.type),
}, null, 2));
