/**
 * JewelHeart — paste-in Express wiring (when private-server lives outside this repo)
 * ==================================================================================
 *
 * Merge these registrations with your app. Paths assume fragments sit beside this file.
 * Requires `express.json()`; confirmation HTML POST needs `express.urlencoded({ extended: false })`.
 */

'use strict';

const { createJewelHeartCalendarHandlers } = require('./jewelheart-calendar-feed.fragment.js');
const { createJewelHeartAssignmentConfirmationHandlers } = require('./jewelheart-assignment-confirmation.fragment.js');
const { createJewelHeartVolunteerNotify } = require('./jewelheart-volunteer-notify.fragment.js');

/**
 * @param {import('express').Application} app
 * @param {{ query: Function, assertUuid: Function, ensureVolunteerPatchAccess: Function }} deps
 */
function mountJewelHeartNotifyCalendarAndCron(app, deps) {
  const { query, assertUuid, ensureVolunteerPatchAccess } = deps;
  const volunteerNotify = createJewelHeartVolunteerNotify({ query });

  const cal = createJewelHeartCalendarHandlers({
    query,
    assertUuid,
    ensureVolunteerPatchAccess,
    volunteerNotify,
  });

  app.head('/jewelheart/calendar-feed/:feedToken', cal.headVolunteerCalendarFeed);
  app.get('/jewelheart/calendar-feed/:feedToken', cal.getCalendarFeedIcs);

  app.post('/jewelheart/internal/day-before-reminders', async (req, res) => {
    const expected = process.env.JEWELHEART_CRON_SECRET;
    const provided =
      (typeof req.get === 'function' ? req.get('x-jewelheart-cron-secret') : null) ||
      (typeof req.query?.secret === 'string' ? req.query.secret : '');
    if (!expected || typeof expected !== 'string' || provided !== expected) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const summary = await volunteerNotify.notifyDayBeforeShiftReminders();
    res.status(200).json({
      ok: !summary.error,
      candidates: summary.candidates ?? 0,
      marked: summary.marked ?? 0,
      skipped: Boolean(summary.skipped),
      reason: summary.reason,
      error: summary.error,
    });
  });

  const confirm = createJewelHeartAssignmentConfirmationHandlers({ query, volunteerNotify });
  app.get('/jewelheart/assignment-confirmations/:sealedConfirmationToken', confirm.getAssignmentConfirmationLanding);
  app.post('/jewelheart/assignment-confirmations/:sealedConfirmationToken', confirm.postAssignmentConfirmationRespond);
  app.get('/jewelheart/static/volunteer-assignment-confirmed.gif', confirm.getVolunteerAssignmentConfirmedGif);

  return { volunteerNotify, cal, confirm };
}

module.exports = { mountJewelHeartNotifyCalendarAndCron };
