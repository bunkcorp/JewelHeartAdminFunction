/**
 * Fragment for KarmaDots private-server: paste into src/jewelheart/service.js
 * (replace the previous `sduiScreen` export and add these helpers just above it).
 * Canonical copy is deployed with private-server; this file tracks the same logic for git.
 *
 * Task list JSON (jobTitle / slotLabel for admin apps): see README.txt in this folder
 * and jewelheart-service-listTasks.fragment.js + jewelheart-mappers-mapTaskRow.fragment.js.
 *
 * Depends on: listRetreats, getRetreat, acl, assertUuid, HttpError, query (already in service.js).
 *
 * **KarmaDots / buddhist-stone-ios-app:** The deployed SDUI router is
 * `private-server/src/jewelheart/sduiScreens.js` (uses `service.js` exports directly).
 * No `__jhSchedule` hook is required there.
 *
 * Optional for minimal forks that paste only this fragment: set
 *   globalThis.__jhSchedule = { listSlots, listTasks, getScheduleByDay }
 * (same signatures as GET schedule / list slots / list tasks).
 */

/** JewelHeart default IANA zone (Eastern, DST-aware); SDUI volunteer views use this (no per-retreat tz in UI). */
const jewelheartDefaultTimeZoneId = 'America/New_York';

/** Volunteer home brand colors (mockups.docx). */
const volunteerHomeGold = '#FFCA10';
const volunteerHomeSummaryBlue = '#7A95CA';
const volunteerHomeActionMaroon = '#92160E';

/**
 * Optional fixed "today" for volunteer home (retreat day-2 demo). Set on deploy:
 *   JEWELHEART_VOLUNTEER_HOME_TEST_TODAY=2026-07-21
 * When unset, uses today in jewelheartDefaultTimeZoneId.
 */
function volunteerHomeEffectiveTodayIso(timeZone) {
  const test =
    typeof process !== 'undefined' && process.env && process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY
      ? String(process.env.JEWELHEART_VOLUNTEER_HOME_TEST_TODAY).trim()
      : '';
  if (test && isIsoDate(test)) return test;
  return todayYmdInTimeZone(timeZone);
}

function daysBetweenIsoYmd(start, end) {
  const [sy, sm, sd] = start.split('-').map((x) => parseInt(x, 10));
  const [ey, em, ed] = end.split('-').map((x) => parseInt(x, 10));
  const s = Date.UTC(sy, sm - 1, sd, 12, 0, 0);
  const e = Date.UTC(ey, em - 1, ed, 12, 0, 0);
  return Math.round((e - s) / 86400000);
}

function volunteerHomeWeekdayShort(iso) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(dt);
}

function volunteerHomeRetreatShortName(name) {
  return String(name || '')
    .replace(/\s+Retreat$/i, '')
    .trim();
}

function volunteerHomeDateInRetreat(iso, retreat) {
  const start = retreat.startDate;
  const end = retreat.endDate;
  if (!start || !end) return false;
  return iso >= start && iso <= end;
}

function volunteerHomePickRetreat(retreats, todayIso) {
  const inRange = (retreats || []).find((r) => volunteerHomeDateInRetreat(todayIso, r));
  return inRange || (retreats && retreats[0]) || null;
}

function volunteerHomeDayNumber(retreat, todayIso) {
  if (!retreat.startDate || !isIsoDate(retreat.startDate)) return 1;
  const days = daysBetweenIsoYmd(retreat.startDate, todayIso);
  return Math.max(1, days + 1);
}

function volunteerHomeRetreatDates(retreat) {
  const start = retreat.startDate;
  const end = retreat.endDate;
  if (!start || !end || !isIsoDate(start) || !isIsoDate(end)) return [];
  const dates = [];
  let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = addDaysIsoYmd(cur, 1);
  }
  return dates;
}

function volunteerHomeJobLine(item) {
  const raw = (item.task && item.task.jobTitle) || (item.job && item.job.title) || '';
  const title = String(raw).replace(/—/g, ' - ').replace(/–/g, ' - ');
  const slot = (item.task && item.task.slotLabel) || (item.slot && item.slot.label) || '';
  return slot ? `${title} - ${slot}` : title;
}

function volunteerHomeBar(content, backgroundColor, textColor) {
  return {
    type: 'text',
    content,
    textStyle: {
      fontSize: 17,
      fontWeight: 'bold',
      textAlign: 'center',
      color: textColor,
    },
    style: {
      backgroundColor,
      padding: { top: 10, bottom: 10, left: 8, right: 8 },
    },
  };
}

function volunteerHomePlainLabel(content) {
  return {
    type: 'text',
    content,
    textStyle: {
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    style: { padding: { top: 10, bottom: 6, left: 8, right: 8 } },
  };
}

/** Firebase uid → volunteer row, else first volunteer linked to retreat. */
async function resolveVolunteerIdForHome(firebaseUid, retreatId) {
  if (typeof query !== 'function') return null;
  const byUid = await query(
    `SELECT id, display_name AS "displayName"
     FROM jewelheart_volunteers
     WHERE firebase_uid = $1
     LIMIT 1`,
    [firebaseUid],
  );
  if (byUid.rows[0]) return byUid.rows[0];
  if (retreatId) {
    const linked = await query(
      `SELECT v.id, v.display_name AS "displayName"
       FROM jewelheart_retreat_volunteers rv
       JOIN jewelheart_volunteers v ON v.id = rv.volunteer_id
       WHERE rv.retreat_id = $1
       ORDER BY rv.linked_at NULLS LAST, v.display_name
       LIMIT 1`,
      [retreatId],
    );
    if (linked.rows[0]) return linked.rows[0];
  }
  return null;
}

function volunteerHomeDemoLines(todayIso, displayName) {
  const weekday = volunteerHomeWeekdayShort(todayIso);
  return {
    retreatDayLine: `JH Summer 2026 - Day 2, ${weekday}`,
    summaryLine: `${displayName || 'David Lewis'} - 2 shifts - 1 today:`,
    todayJobLines: ['Kitchen Full Clean - End of Day'],
  };
}

/**
 * SDUI volunteer home (mirrors clients/ios VolunteerHomeView.swift).
 * Wire: sduiScreen case jewelheart.home → await jewelheartHomeSdui(firebaseUid).
 */
async function jewelheartHomeSdui(firebaseUid) {
  const tz = jewelheartDefaultTimeZoneId;
  const todayIso = volunteerHomeEffectiveTodayIso(tz);
  let retreatDayLine = '';
  let summaryLine = '';
  let todayJobLines = [];
  let usingDemo = false;
  let errorNote = null;

  try {
    const { items: retreats } = await listRetreats(firebaseUid);
    const retreat = volunteerHomePickRetreat(retreats, todayIso);
    if (!retreat) {
      usingDemo = true;
      errorNote = 'No retreat found.';
    } else {
      const dayNum = volunteerHomeDayNumber(retreat, todayIso);
      const weekday = volunteerHomeWeekdayShort(todayIso);
      retreatDayLine = `${volunteerHomeRetreatShortName(retreat.name)} - Day ${dayNum}, ${weekday}`;

      const volunteerRow = await resolveVolunteerIdForHome(firebaseUid, retreat.id);
      const volunteerId = volunteerRow && volunteerRow.id;
      if (!volunteerId) {
        usingDemo = true;
      } else {
        const sch = scheduleDeps();
        if (!sch || typeof sch.getScheduleByDay !== 'function') {
          usingDemo = true;
        } else {
          const dates = volunteerHomeRetreatDates(retreat);
          const mine = [];
          for (const iso of dates) {
            const day = await sch.getScheduleByDay(firebaseUid, retreat.id, iso);
            for (const item of day?.items || []) {
              const assigns = item.assignments || [];
              if (!assigns.some((a) => a.volunteerId === volunteerId)) continue;
              mine.push({ date: iso, label: volunteerHomeJobLine(item) });
            }
          }
          if (!mine.length) {
            usingDemo = true;
          } else {
            const name =
              (volunteerRow.displayName && String(volunteerRow.displayName).trim()) || 'Volunteer';
            const todayCount = mine.filter((m) => m.date === todayIso).length;
            const shiftWord = mine.length === 1 ? 'shift' : 'shifts';
            summaryLine = `${name} - ${mine.length} ${shiftWord} - ${todayCount} today:`;
            todayJobLines = mine.filter((m) => m.date === todayIso).map((m) => m.label);
          }
        }
      }
    }
  } catch (err) {
    usingDemo = true;
    errorNote = err && err.message ? err.message : String(err);
  }

  if (usingDemo) {
    const demo = volunteerHomeDemoLines(todayIso);
    retreatDayLine = demo.retreatDayLine;
    summaryLine = demo.summaryLine;
    todayJobLines = demo.todayJobLines;
  }

  const children = [
    volunteerHomeBar(retreatDayLine, volunteerHomeGold, '#000000'),
    volunteerHomeBar('Volunteer Home', volunteerHomeGold, '#000000'),
    volunteerHomeBar(summaryLine, volunteerHomeSummaryBlue, '#FFFFFF'),
    ...todayJobLines.map((line) => volunteerHomeBar(line, volunteerHomeSummaryBlue, '#FFFFFF')),
    volunteerHomePlainLabel('I want to...'),
  ];
  if (errorNote) {
    children.push({
      type: 'text',
      content: errorNote,
      textStyle: { fontSize: 12, textAlign: 'center', color: '#CC0000' },
    });
  }
  if (usingDemo) {
    children.push({
      type: 'text',
      content:
        'Demo schedule (set Volunteer profile under Volunteer tab, or link firebase_uid on volunteer row, for live data).',
      textStyle: { fontSize: 11, textAlign: 'center', color: '#666666' },
    });
  }

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
          spacing: 0,
          style: { padding: { all: 12 } },
          children,
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
              content: `Status: ${r.status}`,
              textStyle: { fontSize: 14 },
            },
            {
              type: 'button',
              label: 'Volunteer week (signup)',
              icon: 'person.3',
              action: {
                type: 'navigate',
                target: 'retreat.volunteer.week',
                payload: { retreatId },
              },
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

/** Calendar yyyy-MM-dd interpreted as a UTC civil date (matches server slot dates). */
function mondayContainingIsoYmd(ymd) {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  const daysFromMonday = (dow + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - daysFromMonday);
  const yy = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mo}-${da}`;
}

function addDaysIsoYmd(ymd, delta) {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mo}-${da}`;
}

function todayYmdInTimeZone(timeZone) {
  const tz = timeZone || jewelheartDefaultTimeZoneId;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
    .filter((p) => p.type !== 'literal')
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function weekStringsFromMonday(mondayYmd) {
  return Array.from({ length: 7 }, (_, i) => addDaysIsoYmd(mondayYmd, i));
}

function volunteerSignupInitialWeekMonday(retreat, timeZone) {
  const tz = timeZone || jewelheartDefaultTimeZoneId;
  if (retreat.startDate && isIsoDate(retreat.startDate)) return mondayContainingIsoYmd(retreat.startDate);
  if (retreat.endDate && isIsoDate(retreat.endDate)) return mondayContainingIsoYmd(retreat.endDate);
  return mondayContainingIsoYmd(todayYmdInTimeZone(tz));
}

function apiWeekOverlapsRetreatRange(weekDays, start, end) {
  if (!start || !end) return true;
  const first = weekDays[0];
  const last = weekDays[6];
  if (!first || !last) return true;
  return !(last < start || first > end);
}

function civilDayLabel(iso) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' }).format(dt);
}

function civilDayAxisLabel(iso) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' }).format(dt);
}

/** @param {Array<{task:any, slot:any, job:any, assignments?:any[]}>} rows */
function volunteerDayLoadMetricsFromRows(rows, weekDates) {
  return weekDates.map((iso) => {
    const inDay = rows.filter((row) => row.slot?.slotDate === iso);
    const seenTask = new Set();
    const items = inDay.filter((row) => {
      const tid = row.task?.id;
      if (!tid || seenTask.has(tid)) return false;
      seenTask.add(tid);
      return true;
    });
    let demandMinutes = 0;
    let demandSlots = 0;
    let assignedMinutes = 0;
    const volunteerIds = new Set();
    let filledSlots = 0;
    for (const item of items) {
      const need = item.task?.volunteersNeeded != null ? item.task.volunteersNeeded : item.job?.volunteersNeeded;
      const mins = item.job?.estimatedMinutes != null ? item.job.estimatedMinutes : 0;
      demandMinutes += need * mins;
      demandSlots += need;
      const assigns = item.assignments || [];
      const ac = assigns.length === 0 ? item.task?.assignmentCount || 0 : assigns.length;
      filledSlots += ac;
      assignedMinutes += ac * mins;
      for (const a of assigns) {
        if (a.volunteerId) volunteerIds.add(a.volunteerId);
      }
    }
    const distinct = volunteerIds.size ? volunteerIds.size : null;
    const avgDemand = demandSlots > 0 ? demandMinutes / demandSlots : 0;
    const avgActual =
      assignedMinutes <= 0
        ? null
        : distinct && distinct > 0
          ? assignedMinutes / distinct
          : filledSlots > 0
            ? assignedMinutes / filledSlots
            : null;
    const usesTilde = !(distinct && distinct > 0) && filledSlots > 0 && assignedMinutes > 0;
    return {
      iso,
      displayLabel: civilDayLabel(iso),
      axisLabel: civilDayAxisLabel(iso),
      demandMinutes,
      demandSlots,
      filledMinutes: assignedMinutes,
      distinct,
      filledSlots,
      avgDemand,
      avgActual,
      usesTilde,
    };
  });
}

function barLine(widthChars, frac) {
  const n = Math.max(0, Math.min(widthChars, Math.round(widthChars * frac)));
  return ''.padStart(n, '█');
}

/** @param {string} firebaseUid @param {string} retreatId @param {any} params */
async function retreatVolunteerWeekSdui(firebaseUid, retreatId, params) {
  const r = await getRetreat(firebaseUid, retreatId);
  const sch = scheduleDeps();
  const tz = jewelheartDefaultTimeZoneId;
  let wmRaw = params?.weekMonday != null ? String(params.weekMonday) : '';
  let monday =
    wmRaw && isIsoDate(wmRaw)
      ? mondayContainingIsoYmd(wmRaw)
      : volunteerSignupInitialWeekMonday(r, tz);
  const weekDays = weekStringsFromMonday(monday);

  const weekTitle = `${civilDayLabel(weekDays[0])} – ${civilDayLabel(weekDays[6])}`;
  const children = [
    { type: 'text', content: r.name, textStyle: { fontSize: 22, fontWeight: 'bold' } },
    {
      type: 'text',
      content: `Volunteer week · ${weekTitle}`,
      textStyle: { fontSize: 16, fontWeight: 'semibold' },
    },
  ];

  if (!apiWeekOverlapsRetreatRange(weekDays, r.startDate, r.endDate)) {
    children.push({
      type: 'text',
      content: `These dates are outside this retreat (${r.startDate || '—'} … ${r.endDate || '—'}).`,
      textStyle: { fontSize: 13 },
    });
  }

  children.push({
    type: 'container',
    layout: 'row',
    spacing: 8,
    children: [
      {
        type: 'button',
        label: 'Prev week',
        action: { type: 'navigate', target: 'retreat.volunteer.week', payload: { retreatId, weekMonday: addDaysIsoYmd(monday, -7) } },
      },
      {
        type: 'button',
        label: 'This week',
        action: {
          type: 'navigate',
          target: 'retreat.volunteer.week',
          payload: { retreatId, weekMonday: mondayContainingIsoYmd(todayYmdInTimeZone(tz)) },
        },
      },
      {
        type: 'button',
        label: 'Next week',
        action: { type: 'navigate', target: 'retreat.volunteer.week', payload: { retreatId, weekMonday: addDaysIsoYmd(monday, 7) } },
      },
    ],
  });

  if (!sch?.getScheduleByDay) {
    children.push({
      type: 'text',
      content:
        'Set globalThis.__jhSchedule.getScheduleByDay(firebaseUid, retreatId, date) for merged week view, or use buddhist-stone private-server.',
      textStyle: { fontSize: 13 },
    });
  } else {
    const responses = await Promise.all(weekDays.map((day) => sch.getScheduleByDay(firebaseUid, retreatId, day)));
    const merged = responses.flatMap((res) => res?.items || []);
    const seen = new Set();
    const deduped = merged.filter((row) => {
      const id = row.task?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const metrics = volunteerDayLoadMetricsFromRows(deduped, weekDays);
    const maxDemand = metrics.reduce((a, m) => Math.max(a, m.demandMinutes), 0) || 1;
    const maxFilled = metrics.reduce((a, m) => Math.max(a, m.filledMinutes), 0) || 1;

    if (metrics.every((m) => m.demandSlots === 0)) {
      children.push({
        type: 'text',
        content: 'No tasks in this week with current filters.',
        textStyle: { fontSize: 14 },
      });
    } else {
      children.push({
        type: 'text',
        content: 'Person-minutes needed (demand)',
        textStyle: { fontSize: 15, fontWeight: 'semibold' },
      });
      for (const m of metrics) {
        const bar = barLine(16, m.demandMinutes / maxDemand);
        children.push({
          type: 'text',
          content: `${m.axisLabel}  ${bar}  ${m.demandMinutes}`,
          textStyle: { fontSize: 13 },
        });
      }
      children.push({ type: 'spacer', style: { height: { value: 8 } } });
      children.push({
        type: 'text',
        content: 'Person-minutes filled',
        textStyle: { fontSize: 15, fontWeight: 'semibold' },
      });
      for (const m of metrics) {
        const bar = barLine(16, m.filledMinutes / maxFilled);
        children.push({
          type: 'text',
          content: `${m.axisLabel}  ${bar}  ${m.filledMinutes}`,
          textStyle: { fontSize: 13 },
        });
      }
      children.push({
        type: 'text',
        content: 'By day',
        textStyle: { fontSize: 15, fontWeight: 'semibold' },
      });
      for (const m of metrics) {
        const avgActStr =
          m.avgActual == null ? '—' : `${m.usesTilde ? '~' : ''}${m.avgActual.toFixed(1)}`;
        const cardLines = [
          m.displayLabel,
          `Demand (person·min): ${m.demandMinutes}`,
          `Slots needed: ${m.demandSlots}`,
          `Avg demand (min per slot): ${m.avgDemand.toFixed(1)}`,
          `Filled (person·min): ${m.filledMinutes}`,
          `Distinct people: ${m.distinct != null ? m.distinct : '—'}`,
          `Avg actual (min per person): ${avgActStr}`,
        ].join('\n');
        children.push({
          type: 'card',
          children: [{ type: 'text', content: cardLines, textStyle: { fontSize: 13 } }],
        });
      }
      let td = 0;
      let ts = 0;
      let tf = 0;
      let tfs = 0;
      for (const m of metrics) {
        td += m.demandMinutes;
        ts += m.demandSlots;
        tf += m.filledMinutes;
        tfs += m.filledSlots;
      }
      const avgDemandTot = ts > 0 ? td / ts : 0;
      const avgFilledSlot = tfs > 0 ? tf / tfs : null;
      const totalLines = [
        'Week total',
        `Demand (person·min): ${td}`,
        `Slots needed: ${ts}`,
        `Avg demand (min per slot): ${avgDemandTot.toFixed(1)}`,
        `Filled (person·min): ${tf}`,
        `Avg filled (min per filled slot): ${avgFilledSlot != null ? avgFilledSlot.toFixed(1) : '—'}`,
      ].join('\n');
      children.push({
        type: 'card',
        children: [{ type: 'text', content: totalLines, textStyle: { fontSize: 13, fontWeight: 'semibold' } }],
      });
    }

    children.push({
      type: 'text',
      content: `Open roles (deduped tasks, ${deduped.length})`,
      textStyle: { fontSize: 15, fontWeight: 'semibold' },
    });
    if (!deduped.length) {
      children.push({ type: 'text', content: 'Nothing scheduled for these seven days.', textStyle: { fontSize: 13 } });
    } else {
      for (const row of deduped.slice(0, 80)) {
        const job = row.job || {};
        const slot = row.slot || {};
        const task = row.task || {};
        const need = task.volunteersNeeded != null ? task.volunteersNeeded : job.volunteersNeeded;
        const mins = job.estimatedMinutes != null ? `${job.estimatedMinutes}m` : '';
        const assign = (row.assignments || [])
          .map((a) => (a.volunteer && a.volunteer.displayName) || null)
          .filter(Boolean);
        const assignStr = assign.length ? ` · ${assign.join(', ')}` : '';
        const when = slot.slotDate ? civilDayLabel(slot.slotDate) : '';
        const line = `${slot.label || slot.timeBand || 'Slot'} — ${when} — ${job.title || 'Job'} (${need != null ? `${need}v` : '?'}${mins ? `, ${mins}` : ''})${assignStr}`;
        children.push({
          type: 'card',
          children: [{ type: 'text', content: line, textStyle: { fontSize: 13 } }],
        });
      }
      if (deduped.length > 80) {
        children.push({
          type: 'text',
          content: `… and ${deduped.length - 80} more rows (trimmed for SDUI).`,
          textStyle: { fontSize: 12 },
        });
      }
    }
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
      id: 'retreat.volunteer.week',
      title: 'Volunteer week',
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
        .map((a) => (a.volunteer && a.volunteer.displayName) || null)
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
    return jewelheartHomeSdui(firebaseUid);
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

  if (screenId === 'retreat.volunteer.week') {
    if (!retreatId) throw new HttpError(400, 'retreatId required for retreat.volunteer.week');
    assertUuid(retreatId, 'retreatId');
    await acl.assertRetreatAccess(firebaseUid, retreatId);
    const wm = params?.weekMonday;
    return retreatVolunteerWeekSdui(firebaseUid, retreatId, { weekMonday: wm });
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
