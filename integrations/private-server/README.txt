JewelHeart private-server integration (canonical copy in git)
=============================================================

These fragments mirror the logic in KarmaDots / buddhist-stone-ios-app:

  private-server/src/jewelheart/mappers.js   → mapTaskRow
  private-server/src/jewelheart/service.js → taskRowWithMeta, listTasks

Purpose
-------
Task list JSON includes human-readable jobTitle and slotLabel (camelCase on
the wire) so iOS/Android can show "Job — Slot" instead of UUIDs.

SDUI volunteer home (jewelheart.home)
-------------------------------------
Replaces the legacy Home hub (Retreats / Docs buttons) with gold/blue volunteer bars.

From JewelHeartAdminFunction repo root:

  node scripts/apply-jewelheart-sdui-fragment.mjs

Default target: ../buddhist-stone-ios-app/private-server/src/jewelheart

Production laptop:

  JEWELHEART_PRIVATE_SERVER_SRC=~/private-server/src/jewelheart \
    node scripts/apply-jewelheart-sdui-fragment.mjs

Then restart Node (launchd org.karmadots.private-server, pm2, etc.).

Verify (requires .jewelheart-token in repo root):

  bash scripts/check-sdui-jewelheart-home.sh

Automated apply (task list)
-------------------------------
From the JewelHeartAdminFunction repo root:

  node scripts/apply-jewelheart-task-list-fragments.mjs

Volunteer home SDUI (jewelheart.home gold/blue bars):

  node scripts/apply-jewelheart-sdui-fragment.mjs

  # production laptop checkout:
  JEWELHEART_PRIVATE_SERVER_SRC=~/private-server/src/jewelheart \
    node scripts/apply-jewelheart-sdui-fragment.mjs

Verify after deploy (needs .jewelheart-token in repo root):

  bash scripts/check-sdui-jewelheart-home.sh

Default target: ../buddhist-stone-ios-app/private-server/src/jewelheart

Override path:

  JEWELHEART_PRIVATE_SERVER_SRC=/path/to/private-server/src/jewelheart \
    node scripts/apply-jewelheart-task-list-fragments.mjs

Then restart the Node server (or redeploy the worker).

Manual merge (same result)
--------------------------
1. In your deployed private-server checkout, open the two files below.

2. Replace `mapTaskRow` in mappers.js with the body from:
     jewelheart-mappers-mapTaskRow.fragment.js

3. Replace `taskRowWithMeta` and `listTasks` in service.js with the bodies from:
     jewelheart-service-listTasks.fragment.js

4. Restart the Node server (or redeploy the worker that runs this code).

5. Rebuild the admin apps; iOS JSONDecoder uses convertFromSnakeCase so
   job_title / jobTitle both decode.

OpenAPI in this repo: openapi/jewelheart.yaml (Task schema documents jobTitle, slotLabel).

Volunteer calendar ICS feed (webcal) + notification columns
-----------------------------------------------------------
- SQL: migrations/002_jewelheart_volunteer_notify_calendar_feed.sql (`notify_email`, `notify_sms`, `calendar_feed_token`).
- Contract: OpenAPI tags **Calendar** / **Confirmations** (`GET/HEAD /jewelheart/calendar-feed/{feedToken}`, `POST/DELETE …/volunteers/{id}/calendar-feed`, `GET/POST …/assignment-confirmations/{sealedConfirmationToken}`).

In-app messaging (MVP)
----------------------
- **SQL (order):** `001`, `002`, `003`, **`004_jewelheart_messaging.sql`**, **`005_jewelheart_messages_deleted_at.sql`** (`deleted_at` soft-delete), **`006_jewelheart_volunteer_firebase_uid.sql`** (optional `firebase_uid` on `jewelheart_volunteers` for Bearer → volunteer mapping; email fallback still supported in routes).
- **Fragment:** `jewelheart-messaging.fragment.js` exports `createJewelHeartMessagingHandlers({ query, assertUuid, ensureMessagingAccess, isGlobalJewelHeartAdmin? })`.
  - **`ensureMessagingAccess`** — production: global `jewelheart_admins` **or** row in `jewelheart_retreat_volunteers` for `(retreatId, volunteerId)` (see `ensureJewelHeartMessagingAccess` in buddhist-stone `private-server/src/jewelheart/acl.js`).
  - **`isGlobalJewelHeartAdmin(req)`** — optional; default never true. Used so global admins can open the retreat room without being on the roster (participant row is added on first room POST) and for message delete / `include_deleted`.
  - Routes expect **`req.volunteerId`**: set in Express from Firebase/Keycloak uid → `jewelheart_volunteers.firebase_uid`, else **lower(trim(email))** match on the volunteer row.
  - **DELETE** `DELETE /jewelheart/messages/:messageId` — sender within **15 minutes** or global admin; **204**; list/get hide `deleted_at` rows unless admin passes **`?include_deleted=true`** on GET messages.
  - **Email:** after POST message, if **`JEWELHEART_MESSAGE_EMAIL_NOTIFY`** is truthy, other participants may receive SendGrid mail (`notify_email` on volunteer rows, same keys as assignment notify). Fire-and-forget; HTTP always succeeds if insert succeeded.
  - **FCM:** env **`JEWELHEART_MESSAGE_FCM_ENABLED`** is reserved. There is **no** `fcm_token` column in the current schema — handler is a **no-op**. **TODO:** add device registry + tokens, then wire `firebase-admin` `messaging().sendEachForMulticast` (or equivalent).

**Route registration example (production)**

```javascript
const { createJewelHeartMessagingHandlers } = require('./jewelheart-messaging.fragment.cjs');
const messaging = createJewelHeartMessagingHandlers({
  query,
  assertUuid,
  ensureMessagingAccess: async (req, { retreatId, volunteerId }) => {
    await acl.ensureJewelHeartMessagingAccess(req.uid, retreatId, volunteerId);
  },
  isGlobalJewelHeartAdmin: async (req) => acl.isGlobalAdmin(req.uid),
});
// After requireAuthDual + middleware that sets req.volunteerId:
app.post('/jewelheart/retreats/:retreatId/conversations', attachJewelheartVolunteerProfile, messaging.postRetreatConversation);
app.get('/jewelheart/retreats/:retreatId/conversations', attachJewelheartVolunteerProfile, messaging.getRetreatConversations);
app.get('/jewelheart/conversations/:conversationId/messages', attachJewelheartVolunteerProfile, messaging.getConversationMessages);
app.post('/jewelheart/conversations/:conversationId/messages', attachJewelheartVolunteerProfile, messaging.postConversationMessage);
app.post('/jewelheart/conversations/:conversationId/read', attachJewelheartVolunteerProfile, messaging.postConversationRead);
app.delete('/jewelheart/messages/:messageId', attachJewelheartVolunteerProfile, messaging.deleteJewelHeartMessage);
```

OpenAPI: tag **Messaging** and paths under `/jewelheart/retreats/{retreatId}/conversations` and `/jewelheart/conversations/{conversationId}/…` in `openapi/jewelheart.yaml`.

Server fragments (copy into buddhist-stone `private-server/src/jewelheart/` or merge into `service.js` routes)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
1. **ICS + mint/revoke:** `jewelheart-calendar-feed.fragment.js`
   - Exports `createJewelHeartCalendarHandlers({ query, assertUuid, ensureVolunteerPatchAccess, publicOriginFromReq?, volunteerNotify? })` — pass the same `createJewelHeartVolunteerNotify({ query })` instance used for assignments so mint/rotate/revoke calendar sends email/SMS.
   - Handlers: `headVolunteerCalendarFeed`, `getCalendarFeedIcs`, `mintVolunteerCalendarFeed`, `revokeVolunteerCalendarFeed`.
   - **ACL:** implement `ensureVolunteerPatchAccess(req, volunteerId)` to mirror Firebase bearer auth used for `PATCH /jewelheart/volunteers/{id}` (reject with same status as your existing volunteer routes).

2. **Assignment confirmation (HTML + POST):** `jewelheart-assignment-confirmation.fragment.js`
   - Exports `createJewelHeartAssignmentConfirmationHandlers({ query, volunteerNotify? })` → `getAssignmentConfirmationLanding`, `postAssignmentConfirmationRespond`, `getVolunteerAssignmentConfirmedGif`. **Keep assignment** (POST `intent=committed`) returns **HTML** with an embedded thank-you GIF for normal browser form posts; clients sending `Accept: application/json` (without `text/html`) still receive `{ ok, message: "committed", assignmentRemoved: false }`. Public **GET** ` /jewelheart/static/volunteer-assignment-confirmed.gif ` streams the GIF (resolved from repo `assets/volunteer-assignment-confirmed.gif` beside the fragment, or `JEWELHEART_CONFIRM_SUCCESS_GIF_PATH`). When `volunteerNotify` is set, **withdraw** posts call `notifyAfterAssignmentRemoved` before `DELETE` (same as admin `DELETE …/assignments/:id`).
   - Also exports `signAssignmentConfirmationToken(payload, secret)` for email/SMS links (used by notify fragment).

3. **Volunteer email + SMS (optional):** `jewelheart-volunteer-notify.fragment.js`
   - `createJewelHeartVolunteerNotify({ query })` returns:
     - `notifyAfterAssignmentCreated({ retreatId, taskId, assignmentId, volunteerId })` — after successful `INSERT` into `jewelheart_assignments`.
     - `notifyAfterAssignmentRemoved({ volunteerId, assignmentId })` — **await** before `DELETE` removes the row (loads slot/job labels from the assignment; fire-and-forget would race the delete).
     - `notifyAfterCalendarFeedChanged({ volunteerId, action: 'minted'|'rotated'|'revoked', subscribeHttpsUrl?, webcalSubscribeUrl? })` — usually not called by hand; pass the same `volunteerNotify` object into `createJewelHeartCalendarHandlers({ …, volunteerNotify })` so mint/rotate/revoke send mail/SMS.
     - `notifyDayBeforeShiftReminders()` — scheduled job (cron / Cloud Scheduler): emails/SMS for shifts whose **slot date is tomorrow in each retreat’s `timezone`**, idempotent via `jewelheart_assignments.day_before_reminder_sent_at` (`migrations/003_jewelheart_assignment_day_before_reminder.sql`).
   - Helpers **never throw** to route handlers; failures are returned in the result object or swallowed.
   - Assignment-create + day-before reminders require the confirmation fragment on disk as `jewelheart-assignment-confirmation.fragment.js` **or** `.cjs` (same directory) for sealed links.

4. **TIME_BAND → wall-clock reference** (non-executable notes): `jewelheart-calendar-feed-notes.fragment.js`

5. **Consolidated paste-in (optional):** `jewelheart-routes-wiring.fragment.js` exports `mountJewelHeartNotifyCalendarAndCron(app, deps)` — calendar + confirmation + cron route in one helper when your main server file is not in this repo.

Env vars (production)
~~~~~~~~~~~~~~~~~~~~~
- `JEWELHEART_PUBLIC_ORIGIN` — optional; canonical `https://…` origin for minted subscribe URLs (no trailing slash). Defaults to request Host when unset.
- `CALENDAR_CONFIRM_SECRET` — HMAC key for sealed confirmation tokens (`assignment-confirmations` routes).
- `JEWELHEART_CRON_SECRET` — shared secret for `POST /jewelheart/internal/day-before-reminders` (header `x-jewelheart-cron-secret`, or query `secret=` as fallback). Must match on every request or the server returns **401**. Used by Cloud Scheduler / cron to trigger `notifyDayBeforeShiftReminders()` without Firebase auth.
- **SendGrid (email):** `SENDGRID_API_KEY`, and `SENDGRID_FROM_EMAIL` or `JEWELHEART_FROM_EMAIL`.
- **Twilio (SMS):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (E.164). Optional `TWILIO_DEFAULT_COUNTRY_CODE` (default `1`) to normalize 10-digit US numbers to `+1…`.
- **Messaging email:** `JEWELHEART_MESSAGE_EMAIL_NOTIFY` — truthy to send SendGrid mail to other thread participants after each POST message (still needs `SENDGRID_API_KEY` + from-address envs above).
- **Messaging FCM (placeholder):** `JEWELHEART_MESSAGE_FCM_ENABLED` — reserved; no device tokens in DB yet (no-op in fragment).

Express prerequisites
~~~~~~~~~~~~~~~~~~~~~
- `express.json()` globally; for confirmation HTML forms also `express.urlencoded({ extended: false })` on the POST confirmation route (or globally).

Example `service.js` wiring (adapt imports/paths to your tree):

```javascript
const { createJewelHeartCalendarHandlers } = require('./jewelheart-calendar-feed.fragment.js');
const { createJewelHeartAssignmentConfirmationHandlers } = require('./jewelheart-assignment-confirmation.fragment.js');

const { createJewelHeartVolunteerNotify } = require('./jewelheart-volunteer-notify.fragment.js');
const volunteerNotify = createJewelHeartVolunteerNotify({ query });

const cal = createJewelHeartCalendarHandlers({
  query,
  assertUuid,
  volunteerNotify,
  async ensureVolunteerPatchAccess(req, volunteerId) {
    const firebaseUid = req.jewelheartFirebaseUid; // however auth middleware sets this
    await acl.assertVolunteerPatchAccess(firebaseUid, volunteerId, req.headers.authorization);
  },
});

app.head('/jewelheart/calendar-feed/:feedToken', cal.headVolunteerCalendarFeed);
app.get('/jewelheart/calendar-feed/:feedToken', cal.getCalendarFeedIcs);
app.post('/jewelheart/volunteers/:volunteerId/calendar-feed', cal.mintVolunteerCalendarFeed);
app.delete('/jewelheart/volunteers/:volunteerId/calendar-feed', cal.revokeVolunteerCalendarFeed);

// Secured cron (no Firebase): set JEWELHEART_CRON_SECRET; call daily (e.g. Cloud Scheduler).
app.post('/jewelheart/internal/day-before-reminders', async (req, res) => {
  const expected = process.env.JEWELHEART_CRON_SECRET;
  const provided =
    req.get('x-jewelheart-cron-secret') ||
    (typeof req.query.secret === 'string' ? req.query.secret : '');
  if (!expected || typeof expected !== 'string' || provided !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const summary = await volunteerNotify.notifyDayBeforeShiftReminders();
  res.json({
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

// After INSERT jewelheart_assignments succeeds (you have retreatId, taskId, assignment row id, volunteerId):
void volunteerNotify.notifyAfterAssignmentCreated({
  retreatId,
  taskId,
  assignmentId: newAssignment.id,
  volunteerId: body.volunteerId,
});

// Before DELETE …/assignments/:assignmentId: SELECT `a.volunteer_id` with JOIN verifying `t.retreat_id`, then
// `await volunteerNotify.notifyAfterAssignmentRemoved({ volunteerId, assignmentId })`, then DELETE.
// (Reference: `deleteAssignment` in buddhist-stone `service.js` accepts `{ volunteerNotify }` as the last options arg.)

// Day-before reminders: prefer POST /jewelheart/internal/day-before-reminders with x-jewelheart-cron-secret
// (see env JEWELHEART_CRON_SECRET). Alternatively from an authenticated worker: await volunteerNotify.notifyDayBeforeShiftReminders();
```

Sanity (from repo root)
~~~~~~~~~~~~~~~~~~~~~~~
  node --check integrations/private-server/jewelheart-calendar-feed.fragment.js
  node --check integrations/private-server/jewelheart-assignment-confirmation.fragment.js
  node --check integrations/private-server/jewelheart-volunteer-notify.fragment.js
  node --check integrations/private-server/jewelheart-routes-wiring.fragment.js
  node --check integrations/private-server/jewelheart-messaging.fragment.js

Local fixture→ICS dev tool: scripts/generate_volunteer_calendar_ics.py + scripts/fixtures/volunteer_calendar_assignments.sample.json.

Operator checklist (api.karmadots.org + web SDUI)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Use this when deploying KarmaDots private-server with JewelHeart routes.

1. **Postgres (order):** Run `001`, `002`, `003_jewelheart_assignment_day_before_reminder.sql`, **`004_jewelheart_messaging.sql`**, **`005_jewelheart_messages_deleted_at.sql`**, **`006_jewelheart_volunteer_firebase_uid.sql`**. On partially migrated DBs, apply only missing files. Optional: seed ACL (`jewelheart_admins` / create retreat for per-retreat admins); run `npm run db:jewelheart` or `npm run db:jewelheart:node` in private-server.

2. **Merge / sync fragments into `private-server/src/jewelheart/`** (or equivalent):
   - Task list wire format: `jewelheart-mappers-mapTaskRow.fragment.js`, `jewelheart-service-listTasks.fragment.js` (or `node scripts/apply-jewelheart-task-list-fragments.mjs` from JewelHeartAdminFunction repo root).
   - **SDUI screens:** `jewelheart-service-sdui.fragment.js` → must expose `sduiScreen` (and helpers) the same way as production `service.js`; on buddhist-stone, `sduiScreens.js` already routes screen IDs to those exports—verify your fork matches.
   - **Calendar + confirmations + notify:** `jewelheart-calendar-feed.fragment.js`, `jewelheart-assignment-confirmation.fragment.js`, `jewelheart-volunteer-notify.fragment.js` (notes: `jewelheart-calendar-feed-notes.fragment.js`).
   - **Messaging (volunteer tab):** `jewelheart-messaging.fragment.js` (see “In-app messaging” above).
   - **Express:** `express.json()` globally; for confirmation HTML POST, `express.urlencoded({ extended: false })` on that route or globally.

3. **Route registration (pointers):** See the `service.js` wiring block earlier in this file for calendar + assignment-confirmations + internal day-before cron. Additionally register **Firebase-authenticated** SDUI routes (same Bearer middleware as other `/jewelheart/*`):
   - `POST /jewelheart/sdui/screen` → handler calls `sduiScreen(firebaseUid, body)` (OpenAPI `postSduiScreen`).
   - `POST /jewelheart/sdui/action` → optional; wire if your client uses SDUI actions (`postSduiAction`).
   Public (no Firebase): `HEAD`/`GET /jewelheart/calendar-feed/:feedToken`; `GET`/`POST /jewelheart/assignment-confirmations/:sealedConfirmationToken`; `GET /jewelheart/static/volunteer-assignment-confirmed.gif` (success animation for confirmation page). Unauthenticated probe: `GET /jewelheart/health`.

4. **Environment:** `DATABASE_URL` (required). `CALENDAR_CONFIRM_SECRET` (required in production for sealed confirmation tokens). `JEWELHEART_PUBLIC_ORIGIN` (optional canonical `https://…` for minted subscribe URLs, no trailing slash). **Transactional outbound:** set SendGrid and/or Twilio env vars (see “Env vars” above) when you want post-assignment email/SMS. **Firebase:** use the same private-server Firebase Admin / bearer verification as existing KarmaDots routes (JewelHeart shares the project); no extra JewelHeart-only env name is defined in this repo.

5. **Restart order:** Apply DB migrations first (or before code that reads new columns). Deploy merged server code, then restart the Node process (or container/worker) so routes and env load.

6. **Smoke checks (no secrets in logs):**
   - `curl -sS -o /dev/null -w '%{http_code}' https://api.karmadots.org/jewelheart/health`
   - After minting a feed token (authenticated): `curl -I` and `curl` on `https://api.karmadots.org/jewelheart/calendar-feed/<token>` (expect 200, `text/calendar` on GET).
   - `POST https://api.karmadots.org/jewelheart/volunteers/{id}/calendar-feed` with `Authorization: Bearer <Firebase ID token>` (mint).
   - SDUI: `POST .../jewelheart/sdui/screen` with Bearer and JSON body per `openapi/jewelheart.yaml` / `clients/README.md` (e.g. `screenId` `jewelheart.home` or `retreat.schedule`); repo helper `scripts/check-sdui-retreat-schedule.sh`.
   - **Web (karmadots.org/login):** After sign-in, the web client uses the same Firebase ID token for `Authorization: Bearer` — nothing beyond private-server merge + correct API base is required for volunteer-week / calendar flows, as long as SDUI + calendar routes above are live.
   - **Cron (day-before reminders):** With `JEWELHEART_CRON_SECRET` set, `curl -sS -X POST -H "x-jewelheart-cron-secret: $JEWELHEART_CRON_SECRET" https://api.karmadots.org/jewelheart/internal/day-before-reminders` → **200** and JSON `{ ok, candidates, marked, … }` (no secrets in body).
