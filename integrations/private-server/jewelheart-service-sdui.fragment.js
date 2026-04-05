/**
 * Fragment for KarmaDots private-server: paste into src/jewelheart/service.js
 * (replace the previous `sduiScreen` export and add these helpers just above it).
 * Canonical copy is deployed with private-server; this file tracks the same logic for git.
 *
 * Depends on: listRetreats, getRetreat, acl, assertUuid, HttpError (already in service.js).
 */

/** SDUI envelope aligned with clients/ios SDUIModels + shared/sdui-schema/examples/jewelheart-home.json */
function jewelheartHomeSdui() {
  return {
    schemaVersion: 1,
    minAppVersion: '2.0.0',
    screen: {
      id: 'jewelheart.home',
      title: 'JewelHeart',
      components: [
        {
          type: 'container',
          layout: 'column',
          spacing: 12,
          style: { padding: { all: 16 } },
          children: [
            {
              type: 'text',
              content: 'JewelHeart Admin',
              textStyle: { fontSize: 22, fontWeight: 'bold' },
            },
            {
              type: 'button',
              label: 'Retreats',
              icon: 'list.bullet',
              action: { type: 'navigate', target: 'retreat.list' },
            },
          ],
        },
      ],
    },
  };
}

async function retreatListSdui(firebaseUid) {
  const { items } = await listRetreats(firebaseUid);
  const children = [
    {
      type: 'text',
      content: 'Your retreats',
      textStyle: { fontSize: 22, fontWeight: 'bold' },
    },
  ];
  if (!items.length) {
    children.push({
      type: 'text',
      content: 'No retreats yet. Create one via POST /jewelheart/retreats or your admin tools.',
      textStyle: { fontSize: 14 },
    });
  } else {
    for (const r of items) {
      children.push({
        type: 'button',
        label: `${r.name} (${r.status})`,
        icon: 'calendar',
        action: {
          type: 'navigate',
          target: 'retreat.home',
          payload: { retreatId: r.id },
        },
      });
    }
  }
  children.push({
    type: 'button',
    label: 'Home',
    icon: 'house',
    action: { type: 'navigate', target: 'jewelheart.home' },
  });
  return {
    schemaVersion: 1,
    minAppVersion: '2.0.0',
    screen: {
      id: 'retreat.list',
      title: 'Retreats',
      components: [
        {
          type: 'container',
          layout: 'column',
          spacing: 12,
          style: { padding: { all: 16 } },
          children,
        },
      ],
    },
  };
}

async function retreatHomeSdui(firebaseUid, retreatId) {
  const r = await getRetreat(firebaseUid, retreatId);
  return {
    schemaVersion: 1,
    minAppVersion: '2.0.0',
    screen: {
      id: 'retreat.home',
      title: r.name,
      components: [
        {
          type: 'container',
          layout: 'column',
          spacing: 12,
          style: { padding: { all: 16 } },
          children: [
            {
              type: 'text',
              content: r.name,
              textStyle: { fontSize: 22, fontWeight: 'bold' },
            },
            {
              type: 'text',
              content: `Status: ${r.status}${r.timezone ? ` · ${r.timezone}` : ''}`,
              textStyle: { fontSize: 14 },
            },
            {
              type: 'button',
              label: 'Back to list',
              icon: 'chevron.left',
              action: { type: 'navigate', target: 'retreat.list' },
            },
          ],
        },
      ],
    },
  };
}

export async function sduiScreen(firebaseUid, body) {
  const { screenId, retreatId, params } = body || {};
  if (!screenId) throw new HttpError(400, 'screenId required');

  if (screenId === 'jewelheart.home') {
    if (retreatId) {
      assertUuid(retreatId, 'retreatId');
      await acl.assertRetreatAccess(firebaseUid, retreatId);
    }
    return jewelheartHomeSdui();
  }

  if (screenId === 'retreat.list') {
    if (retreatId) {
      assertUuid(retreatId, 'retreatId');
      await acl.assertRetreatAccess(firebaseUid, retreatId);
    }
    return retreatListSdui(firebaseUid);
  }

  if (screenId === 'retreat.home') {
    if (!retreatId) throw new HttpError(400, 'retreatId required for retreat.home');
    assertUuid(retreatId, 'retreatId');
    await acl.assertRetreatAccess(firebaseUid, retreatId);
    return retreatHomeSdui(firebaseUid, retreatId);
  }

  if (retreatId) {
    assertUuid(retreatId, 'retreatId');
    await acl.assertRetreatAccess(firebaseUid, retreatId);
  }
  return {
    version: 1,
    screen: {
      screenId,
      title: 'JewelHeart',
      retreatId: retreatId || null,
      params: params || {},
      sections: [
        {
          type: 'text',
          text: `SDUI stub for "${screenId}". Implement components in private-server (see JewelHeartAdminFunction shared/sdui-schema/examples).`,
        },
      ],
      actions: [{ actionId: 'refresh', label: 'Refresh' }],
    },
  };
}
