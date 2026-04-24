/**
 * Fragment for KarmaDots private-server: paste into src/jewelheart/service.js
 * (replace the previous `sduiScreen` export and add these helpers just above it).
 * Canonical copy is deployed with private-server; this file tracks the same logic for git.
 *
 * Depends on: listRetreats, getRetreat, acl, assertUuid, HttpError (already in service.js).
 *
 * **KarmaDots / buddhist-stone-ios-app:** The deployed SDUI router is
 * `private-server/src/jewelheart/sduiScreens.js` (uses `service.js` exports directly).
 * No `__jhSchedule` hook is required there.
 *
 * Optional for minimal forks that paste only this fragment: set
 *   globalThis.__jhSchedule = { listSlots, listTasks, getScheduleByDay }
 * (same signatures as GET schedule / list slots / list tasks).
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
              label: 'Volunteer schedule',
              icon: 'calendar',
              action: {
                type: 'navigate',
                target: 'retreat.schedule',
                payload: { retreatId },
              },
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

function scheduleDeps() {
  const sch = typeof globalThis.__jhSchedule !== 'undefined' ? globalThis.__jhSchedule : undefined;
  return sch && typeof sch === 'object' ? sch : null;
}

/** @param {string} d */
function isIsoDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

async function retreatScheduleHubSdui(firebaseUid, retreatId) {
  const r = await getRetreat(firebaseUid, retreatId);
  const sch = scheduleDeps();
  let dates = [];
  let taskCount = 0;
  if (sch?.listSlots) {
    const res = await sch.listSlots(firebaseUid, retreatId);
    const items = res?.items || [];
    dates = [...new Set(items.map((s) => s.slotDate).filter(Boolean))].sort();
  }
  if (sch?.listTasks) {
    const res = await sch.listTasks(firebaseUid, retreatId);
    taskCount = (res?.items || []).length;
  }
  const children = [
    {
      type: 'text',
      content: r.name,
      textStyle: { fontSize: 22, fontWeight: 'bold' },
    },
    {
      type: 'text',
      content: `Volunteer schedule · ${taskCount} task(s) · ${dates.length} day(s) with slots`,
      textStyle: { fontSize: 14 },
    },
  ];
  if (!sch) {
    children.push({
      type: 'text',
      content:
        'Set globalThis.__jhSchedule = { listSlots, listTasks, getScheduleByDay } or use buddhist-stone-ios-app private-server sduiScreens.js (no hook needed).',
      textStyle: { fontSize: 13 },
    });
  } else if (!dates.length) {
    children.push({
      type: 'text',
      content: 'No slots yet. Create slots for this retreat, then tasks (job × slot).',
      textStyle: { fontSize: 14 },
    });
  }
  for (const d of dates) {
    children.push({
      type: 'button',
      label: d,
      icon: 'calendar',
      action: {
        type: 'navigate',
        target: 'retreat.schedule.day',
        payload: { retreatId, day: d },
      },
    });
  }
  children.push({
    type: 'button',
    label: 'Back to retreat',
    icon: 'chevron.left',
    action: { type: 'navigate', target: 'retreat.home', payload: { retreatId } },
  });
  return {
    schemaVersion: 1,
    minAppVersion: '2.0.0',
    screen: {
      id: 'retreat.schedule',
      title: 'Schedule',
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

async function retreatScheduleDaySdui(firebaseUid, retreatId, day) {
  const r = await getRetreat(firebaseUid, retreatId);
  const sch = scheduleDeps();
  const children = [
    {
      type: 'text',
      content: `${r.name} — ${day}`,
      textStyle: { fontSize: 20, fontWeight: 'bold' },
    },
  ];
  if (!isIsoDate(day)) {
    children.push({
      type: 'text',
      content: 'Invalid day. Use params.day as YYYY-MM-DD.',
      textStyle: { fontSize: 14 },
    });
  } else if (!sch?.getScheduleByDay) {
    children.push({
      type: 'text',
      content:
        'Set globalThis.__jhSchedule.getScheduleByDay(firebaseUid, retreatId, date) to match GET /jewelheart/retreats/:id/schedule?date=…',
      textStyle: { fontSize: 13 },
    });
  } else {
    const sched = await sch.getScheduleByDay(firebaseUid, retreatId, day);
    const items = sched?.items || [];
    if (!items.length) {
      children.push({
        type: 'text',
        content: 'No tasks scheduled for this day.',
        textStyle: { fontSize: 14 },
      });
    }
    for (const row of items) {
      const job = row.job || {};
      const slot = row.slot || {};
      const task = row.task || {};
      const need = task.volunteersNeeded != null ? task.volunteersNeeded : job.volunteersNeeded;
      const mins = job.estimatedMinutes != null ? `${job.estimatedMinutes}m` : '';
      const assign = (row.assignments || [])
        .map((a) => (a.volunteer && a.volunteer.displayName) || a.volunteerId)
        .filter(Boolean);
      const assignStr = assign.length ? ` · ${assign.join(', ')}` : '';
      const line = `${slot.label || slot.timeBand || 'Slot'} — ${job.title || 'Job'} (${need != null ? `${need}v` : '?'}${mins ? `, ${mins}` : ''})${assignStr}`;
      children.push({
        type: 'card',
        children: [{ type: 'text', content: line, textStyle: { fontSize: 14 } }],
      });
    }
  }
  children.push({
    type: 'button',
    label: 'All days',
    icon: 'calendar',
    action: { type: 'navigate', target: 'retreat.schedule', payload: { retreatId } },
  });
  return {
    schemaVersion: 1,
    minAppVersion: '2.0.0',
    screen: {
      id: 'retreat.schedule.day',
      title: 'Day',
      components: [
        {
          type: 'container',
          layout: 'column',
          spacing: 10,
          style: { padding: { all: 16 } },
          children,
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

  if (screenId === 'retreat.schedule') {
    if (!retreatId) throw new HttpError(400, 'retreatId required for retreat.schedule');
    assertUuid(retreatId, 'retreatId');
    await acl.assertRetreatAccess(firebaseUid, retreatId);
    return retreatScheduleHubSdui(firebaseUid, retreatId);
  }

  if (screenId === 'retreat.schedule.day') {
    if (!retreatId) throw new HttpError(400, 'retreatId required for retreat.schedule.day');
    assertUuid(retreatId, 'retreatId');
    await acl.assertRetreatAccess(firebaseUid, retreatId);
    const day = params?.day;
    if (!day) throw new HttpError(400, 'params.day required (YYYY-MM-DD)');
    return retreatScheduleDaySdui(firebaseUid, retreatId, String(day));
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
