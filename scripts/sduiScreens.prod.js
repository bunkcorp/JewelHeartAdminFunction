/**
 * JewelHeart SDUI payloads — matches KarmaDots shared schema (schemaVersion + screen.components).
 * @see buddhist-stone-ios-app/shared/sdui-schema/examples/
 */

import {
  buildJewelheartHomeScreen,
  buildJewelheartVolunteerSearchScreen,
  buildJewelheartVolunteerSearchByTypeScreen,
  buildJewelheartVolunteerSearchByDayScreen,
  buildJewelheartVolunteerAssignScreen,
  buildJewelheartVolunteerShiftScreen,
  buildJewelheartVolunteerShiftDetailScreen,
  buildJewelheartVolunteerCheckinScreen,
  buildJewelheartVolunteerShiftInfoScreen,
  buildJewelheartVolunteerShiftEditScreen,
  buildJewelheartVolunteerMessagesScreen,
  buildJewelheartVolunteerMineScreen,
  buildJewelheartVolunteerAccountScreen,
  buildJewelheartVolunteerPreferencesScreen,
  buildJewelheartVolunteerAdminScreen,
  buildJewelheartVolunteerManageScreen,
  buildJewelheartVolunteerTestingScreen,
  buildJewelheartVolunteerUserManageScreen,
  searchJewelheartPeople,
} from './jewelheart-sdui-home.js';
import { assertVolunteerRosterAccess } from './jewelheart-volunteer-invite.js';
import { HttpError } from './errors.js';
import * as acl from './acl.js';
import { assertUuid } from './service.js';
import { query } from '../db.js';

function wrap(screen) {
  return {
    schemaVersion: 1,
    minAppVersion: '2.0.0',
    screen,
  };
}

function column(children, spacing = 16, padding = 16) {
  return {
    type: 'container',
    layout: 'column',
    spacing,
    style: { padding: { all: padding } },
    children,
  };
}

function row(children, spacing = 12) {
  return {
    type: 'container',
    layout: 'row',
    spacing,
    children,
  };
}

function heading(text) {
  return {
    type: 'text',
    content: text,
    textStyle: { fontSize: 22, fontWeight: 'bold' },
  };
}

function subheading(text) {
  return {
    type: 'text',
    content: text,
    textStyle: { fontSize: 16, fontWeight: 'semibold', color: '#444444' },
  };
}

function bodyText(text, color = '#333333') {
  return {
    type: 'text',
    content: text,
    textStyle: { fontSize: 15, color },
  };
}

function spacer(h = 12) {
  return { type: 'spacer', style: { height: { value: h } } };
}

function navButton(label, target, payload = {}, icon = 'chevron.right') {
  return {
    type: 'button',
    label,
    icon,
    action: { type: 'navigate', target, payload },
    style: { margin: { top: 8 } },
  };
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {string} firebaseUid
 * @param {object} body - { screenId, retreatId?, params? }
 * @param {object} api - jewelheart service module exports
 * @param {object} [authToken] - decoded Firebase ID token (for anonymous read ACL)
 */
export async function buildSduiResponse(
  firebaseUid,
  body,
  api,
  authToken = undefined,
  keycloakPayload = undefined,
) {
  const { screenId, retreatId: bodyRetreatId, params = {} } = body || {};
  if (!screenId) throw new HttpError(400, 'screenId required');

  const retreatId = bodyRetreatId || params.retreatId || null;

  if (String(params?.uiChannel || '').toLowerCase() === 'testers') {
    await assertVolunteerRosterAccess(firebaseUid, authToken, {
      query,
      retreatId,
      keycloakPayload,
    });
  }

  if (retreatId) {
    assertUuid(retreatId, 'retreatId');
    await acl.assertRetreatReadAccess(firebaseUid, retreatId, authToken);
  }

  switch (screenId) {
    case 'jewelheart.home':
    case 'home':
      return wrap(
        await buildJewelheartHomeScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.search':
      return wrap(
        await buildJewelheartVolunteerSearchScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.searchByType':
      return wrap(
        await buildJewelheartVolunteerSearchByTypeScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.searchByDay':
      return wrap(
        await buildJewelheartVolunteerSearchByDayScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.assign':
      return wrap(
        await buildJewelheartVolunteerAssignScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.shift':
      return wrap(
        await buildJewelheartVolunteerShiftScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.shiftDetail':
      return wrap(
        await buildJewelheartVolunteerShiftDetailScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.checkin':
      return wrap(
        await buildJewelheartVolunteerCheckinScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.shiftInfo':
      return wrap(
        await buildJewelheartVolunteerShiftInfoScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.shiftEdit':
      return wrap(
        await buildJewelheartVolunteerShiftEditScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.personSearch': {
      const searchRetreatId = retreatId || params.retreatId || null;
      if (searchRetreatId) {
        assertUuid(searchRetreatId, 'retreatId');
        await acl.assertRetreatReadAccess(firebaseUid, searchRetreatId, authToken);
      }
      const results = await searchJewelheartPeople(firebaseUid, authToken, {
        ...params,
        retreatId: searchRetreatId,
        excludeVolunteerId: params.excludeVolunteerId ? String(params.excludeVolunteerId) : '',
      });
      return {
        schemaVersion: 1,
        minAppVersion: '2.0.0',
        screen: {
          id: 'jewelheart.personSearch',
          title: 'Person search',
          components: [{ type: 'spacer', style: { height: { value: 1 } } }],
          metadata: {
            personSearchResults: results.items,
            personSearchTotal: results.total,
            personSearchCapped: results.capped,
          },
        },
      };
    }
    case 'jewelheart.volunteer.messages':
      return wrap(
        await buildJewelheartVolunteerMessagesScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.mine':
      return wrap(
        await buildJewelheartVolunteerMineScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.account':
      return wrap(
        await buildJewelheartVolunteerAccountScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.preferences':
      return wrap(
        await buildJewelheartVolunteerPreferencesScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.manage':
      return wrap(
        await buildJewelheartVolunteerManageScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.testing':
      return wrap(
        await buildJewelheartVolunteerTestingScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.userManage':
      return wrap(
        await buildJewelheartVolunteerUserManageScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'jewelheart.volunteer.admin':
      return wrap(
        await buildJewelheartVolunteerAdminScreen(firebaseUid, authToken, {
          ...params,
          retreatId: retreatId || params.retreatId,
        }),
      );
    case 'retreat.list':
      return wrap(await screenRetreatList(firebaseUid, api, authToken));
    case 'retreat.home':
    case 'retreat.detail':
    case 'jewelheart.retreat.detail':
      return wrap(await screenRetreatDetail(firebaseUid, retreatId, api, authToken));
    case 'retreat.schedule':
      return wrap(await screenRetreatScheduleHub(firebaseUid, retreatId, api, authToken));
    case 'retreat.schedule.day':
      return wrap(await screenRetreatScheduleDay(firebaseUid, retreatId, params.day, api, authToken));
    case 'job.list':
      return wrap(await screenJobList(firebaseUid, retreatId, api, authToken));
    case 'slot.list':
      return wrap(await screenSlotList(firebaseUid, retreatId, api, authToken));
    case 'schedule.board':
      return wrap(await screenScheduleBoard(firebaseUid, retreatId, params.date || todayISODate(), api, authToken));
    case 'task.unassigned':
      return wrap(await screenTaskUnassigned(firebaseUid, retreatId, api, authToken));
    case 'volunteer.list':
      return wrap(await screenVolunteerList(firebaseUid, retreatId, api, authToken));
    case 'reports.hub':
      return wrap(await screenReportsHub(retreatId, params.date || todayISODate()));
    default:
      return wrap(
        column(
          [
            heading('JewelHeart'),
            bodyText(`Unknown screenId: "${screenId}". Try jewelheart.home or retreat.list.`),
            navButton('Open home', 'jewelheart.home'),
          ],
          12
        )
      );
  }
}


async function screenRetreatList(firebaseUid, api, authToken) {
  const { items } = await api.listRetreats(firebaseUid, authToken);
  const buttons = items.map((r) =>
    navButton(r.name || r.id, 'jewelheart.retreat.detail', { retreatId: r.id }, 'calendar')
  );
  return {
    id: 'retreat.list',
    title: 'Retreats',
    metadata: { count: items.length },
    components: [
      column(
        [heading('Your retreats'), subheading(`${items.length} total`), spacer(8), ...buttons],
        12
      ),
    ],
  };
}

async function screenRetreatDetail(firebaseUid, retreatId, api, authToken) {
  if (!retreatId) throw new HttpError(400, 'retreatId required for this screen');
  const r = await api.getRetreat(firebaseUid, retreatId, authToken);
  return {
    id: 'retreat.detail',
    title: r.name,
    metadata: { retreatId, status: r.status },
    components: [
      column([
        heading(r.name),
        bodyText(`Timezone: ${r.timezone}`),
        bodyText(`Status: ${r.status}`),
        ...(r.startDate ? [bodyText(`Dates: ${r.startDate} → ${r.endDate || '—'}`)] : []),
        spacer(16),
        subheading('Manage'),
        navButton('Jobs', 'job.list', { retreatId }, 'briefcase'),
        navButton('Slots', 'slot.list', { retreatId }, 'clock'),
        navButton('Schedule by day', 'schedule.board', { retreatId, date: todayISODate() }, 'calendar'),
        navButton('Schedule hub (pick day)', 'retreat.schedule', { retreatId }, 'calendar.badge.clock'),
        navButton('Unassigned tasks', 'task.unassigned', { retreatId }, 'person.crop.circle.badge.questionmark'),
        navButton('Volunteers', 'volunteer.list', { retreatId }, 'person.3'),
        navButton('Reports', 'reports.hub', { retreatId, date: todayISODate() }, 'doc.text'),
        spacer(12),
        navButton('← All retreats', 'retreat.list', {}, 'chevron.left'),
      ]),
    ],
  };
}

async function screenJobList(firebaseUid, retreatId, api, authToken) {
  if (!retreatId) throw new HttpError(400, 'retreatId required');
  const { items } = await api.listJobs(firebaseUid, retreatId, authToken);
  const lines = items.map(
    (j) =>
      `${j.title} — ${j.volunteersNeeded} vol. · ${j.estimatedMinutes} min · ${j.subjobs?.length || 0} subjobs`
  );
  return {
    id: 'job.list',
    title: 'Jobs',
    metadata: { retreatId, count: items.length },
    components: [
      column([
        heading('Jobs'),
        ...(lines.length ? lines.map((t) => bodyText(t)) : [bodyText('No jobs yet. Use REST POST /jewelheart/retreats/…/jobs')]),
        spacer(12),
        navButton('← Retreat', 'jewelheart.retreat.detail', { retreatId }, 'chevron.left'),
      ]),
    ],
  };
}

async function screenSlotList(firebaseUid, retreatId, api, authToken) {
  if (!retreatId) throw new HttpError(400, 'retreatId required');
  const { items } = await api.listSlots(firebaseUid, retreatId, null, authToken);
  const lines = items.map(
    (s) => `${s.slotDate} · ${s.timeBand} — ${s.label}${s.activityContext ? ` (${s.activityContext})` : ''}`
  );
  return {
    id: 'slot.list',
    title: 'Slots',
    metadata: { retreatId, count: items.length },
    components: [
      column([
        heading('Time slots'),
        ...(lines.length ? lines.map((t) => bodyText(t)) : [bodyText('No slots yet.')]),
        spacer(12),
        navButton('← Retreat', 'jewelheart.retreat.detail', { retreatId }, 'chevron.left'),
      ]),
    ],
  };
}

async function screenRetreatScheduleHub(firebaseUid, retreatId, api, authToken) {
  if (!retreatId) throw new HttpError(400, 'retreatId required');
  const r = await api.getRetreat(firebaseUid, retreatId, authToken);
  const { items: slots } = await api.listSlots(firebaseUid, retreatId, null, authToken);
  const dates = [...new Set(slots.map((s) => s.slotDate).filter(Boolean))].sort();
  const { items: tasks } = await api.listTasks(
    firebaseUid,
    retreatId,
    { slotId: null, unassignedOnly: false, underassignedOnly: false },
    authToken
  );
  const dateButtons = dates.map((d) => navButton(d, 'retreat.schedule.day', { retreatId, day: d }, 'calendar'));
  return {
    id: 'retreat.schedule',
    title: 'Schedule',
    metadata: { retreatId, days: dates.length, tasks: tasks.length },
    components: [
      column([
        heading(r.name),
        bodyText(`${tasks.length} task(s) · ${dates.length} calendar day(s) with slots`),
        spacer(8),
        ...(dates.length
          ? dateButtons
          : [bodyText('No slots yet. Add slots and tasks from the JewelHeart admin apps or REST API.')]),
        spacer(12),
        navButton('← Retreat', 'retreat.home', { retreatId }, 'chevron.left'),
      ]),
    ],
  };
}

async function screenRetreatScheduleDay(firebaseUid, retreatId, day, api, authToken) {
  if (!retreatId) throw new HttpError(400, 'retreatId required');
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(String(day))) {
    throw new HttpError(400, 'params.day required as YYYY-MM-DD');
  }
  const dayStr = String(day);
  const r = await api.getRetreat(firebaseUid, retreatId, authToken);
  const sched = await api.getScheduleByDay(firebaseUid, retreatId, dayStr, authToken);
  const cards = sched.items.map((it) => {
    const need = it.task.volunteersNeeded != null ? it.task.volunteersNeeded : it.job.volunteersNeeded;
    const mins = it.job.estimatedMinutes;
    const assign = (it.assignments || []).map((a) => a.volunteer?.displayName || a.volunteerId).join(', ');
    const line = `${it.slot.label} — ${it.job.title} (${need}v, ${mins}m)${assign ? ` · ${assign}` : ''}`;
    return { type: 'card', children: [{ type: 'text', content: line, textStyle: { fontSize: 14 } }] };
  });
  return {
    id: 'retreat.schedule.day',
    title: dayStr,
    metadata: { retreatId, date: dayStr, count: sched.items.length },
    components: [
      column([
        heading(r.name),
        subheading(dayStr),
        spacer(8),
        ...(cards.length ? cards : [bodyText('No tasks scheduled for this day.')]),
        spacer(12),
        navButton('All days', 'retreat.schedule', { retreatId }, 'calendar'),
        navButton('← Retreat', 'retreat.home', { retreatId }, 'chevron.left'),
      ]),
    ],
  };
}

async function screenScheduleBoard(firebaseUid, retreatId, dateStr, api, authToken) {
  if (!retreatId) throw new HttpError(400, 'retreatId required');
  const sched = await api.getScheduleByDay(firebaseUid, retreatId, dateStr, authToken);
  const blocks = sched.items.map((it) => {
    const n = it.task.assignmentCount ?? 0;
    const need = it.job.volunteersNeeded;
    const line = `${it.slot.timeBand.toUpperCase()} · ${it.job.title} (${n}/${need})`;
    return bodyText(line, n < need ? '#B45309' : '#166534');
  });
  return {
    id: 'schedule.board',
    title: `Schedule ${dateStr}`,
    metadata: { retreatId, date: dateStr },
    components: [
      column([
        heading(`Schedule — ${dateStr}`),
        row([
          navButton('◀ Prev day', 'schedule.board', { retreatId, date: addDays(dateStr, -1) }, 'chevron.left'),
          navButton('Next day ▶', 'schedule.board', { retreatId, date: addDays(dateStr, 1) }, 'chevron.right'),
        ]),
        spacer(8),
        ...(blocks.length ? blocks : [bodyText('No tasks this day.')]),
        spacer(12),
        navButton('← Retreat', 'jewelheart.retreat.detail', { retreatId }, 'chevron.left'),
      ]),
    ],
  };
}

function addDays(isoDate, delta) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

async function screenTaskUnassigned(firebaseUid, retreatId, api, authToken) {
  if (!retreatId) throw new HttpError(400, 'retreatId required');
  const { items } = await api.listTasks(firebaseUid, retreatId, {
    slotId: null,
    unassignedOnly: true,
    underassignedOnly: false,
  }, authToken);
  const lines = await Promise.all(
    items.map(async (t) => {
      const detail = await api.getTaskDetail(firebaseUid, retreatId, t.id, authToken);
      return `${detail.slot.slotDate} ${detail.slot.timeBand} · ${detail.job.title}`;
    })
  );
  return {
    id: 'task.unassigned',
    title: 'Unassigned tasks',
    metadata: { retreatId, count: items.length },
    components: [
      column([
        heading('Unassigned'),
        ...(lines.length ? lines.map((t) => bodyText(t)) : [bodyText('None — all tasks have at least one volunteer.')]),
        spacer(12),
        navButton('← Retreat', 'jewelheart.retreat.detail', { retreatId }, 'chevron.left'),
      ]),
    ],
  };
}

async function screenVolunteerList(firebaseUid, retreatId, api, authToken) {
  if (!retreatId) throw new HttpError(400, 'retreatId required');
  const { items } = await api.listRetreatVolunteers(firebaseUid, retreatId, authToken);
  const lines = items.map((x) => {
    const v = x.volunteer;
    return `${v.displayName}${v.email ? ` · ${v.email}` : ''}`;
  });
  return {
    id: 'volunteer.list',
    title: 'Volunteers',
    metadata: { retreatId, count: items.length },
    components: [
      column([
        heading('Retreat volunteers'),
        ...(lines.length ? lines.map((t) => bodyText(t)) : [bodyText('No volunteers linked yet.')]),
        spacer(12),
        bodyText('Import CSV via REST POST …/volunteers/import', '#666666'),
        spacer(12),
        navButton('← Retreat', 'jewelheart.retreat.detail', { retreatId }, 'chevron.left'),
      ]),
    ],
  };
}

async function screenReportsHub(retreatId, dateStr) {
  if (!retreatId) throw new HttpError(400, 'retreatId required');
  return {
    id: 'reports.hub',
    title: 'Reports',
    metadata: { retreatId, date: dateStr },
    components: [
      column([
        heading('Reports'),
        bodyText(`Date: ${dateStr}`),
        bodyText(
          'Open in browser (signed-in session): poster and daily PDF/CSV from the REST API.',
          '#666666'
        ),
        spacer(8),
        navButton('Change date −1', 'reports.hub', { retreatId, date: addDays(dateStr, -1) }, 'chevron.left'),
        navButton('Change date +1', 'reports.hub', { retreatId, date: addDays(dateStr, 1) }, 'chevron.right'),
        spacer(12),
        navButton('← Retreat', 'jewelheart.retreat.detail', { retreatId }, 'chevron.left'),
      ]),
    ],
  };
}
