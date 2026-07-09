# Manage → Testing — design note

> Draft 2026-07-09. Replaces env-only demo pin with a manager-controlled testing mode.

## Terminology (not git branches)

Earlier discussion referred to a **“demo branch”** and **“live branch”**. These are **two code paths inside one function** on the server — not separate git branches.

| Informal name | What it actually is | When it runs |
|---------------|---------------------|--------------|
| **Demo / pinned-today path** | `if (volunteerHomePinSummer2026Demo()) { … }` at the top of `gatherVolunteerHomeContext` | `JEWELHEART_VOLUNTEER_HOME_DEMO` is not `0` (default **`1`** on dev/test) |
| **Live-today path** | The `else` block in the same function | `JEWELHEART_VOLUNTEER_HOME_DEMO=0` |

Both paths call the same downstream helpers (`volunteerHomeLoadMyShifts`, search day filters, banner line, etc.) with a `todayIso` value. The problem is they **duplicate setup logic** and the demo path applies extra hardcoded retreat defaults — that is what we will remove.

**Pinned today (Jul 21)** is resolved by `volunteerHomeDemoTodayIso()`:

1. `JEWELHEART_VOLUNTEER_HOME_TEST_TODAY` if set (any ISO date)
2. Else if demo pin on → `VOLUNTEER_HOME_DEMO_DAY_ISO` (`2026-07-21`)
3. Else → real calendar in `America/New_York`

---

## Where dates live today

### Retreat window Jul 20–26 (canonical “live” retreat)

| Location | Role |
|----------|------|
| **Postgres** `jewelheart_retreats.start_date` / `end_date` | Source of truth for active retreat (`JEWELHEART_ACTIVE_RETREAT_ID`) |
| `integrations/private-server/jewelheart-sdui-home.js` → `VOLUNTEER_HOME_DEFAULT_RETREAT` | Hardcoded fallback `{ startDate: '2026-07-20', endDate: '2026-07-26' }` |
| `volunteerHomeDefaultRetreat()` | If DB retreat dates **don’t exactly match** Jul 20–26, **replaces** start/end with hardcoded values (keeps `id` + `name`) |
| `scripts/_volunteer-app.html` → `VOLUNTEER_RETREAT` | Web sign-in/onboard header (same Jul 20–26) |
| `scripts/reseed-v8.mjs`, poster job lists, `jewelheart-poster-xlsx.js` | Task/schedule seed data on Jul 20–25 |
| Reseed/invite scripts | Look up retreat by `start_date = '2026-07-20'` |

### Pinned today Jul 21 (demo / testers)

| Location | Role |
|----------|------|
| `VOLUNTEER_HOME_DEMO_DAY_ISO = '2026-07-21'` in `jewelheart-sdui-home.js` | Default pinned day when demo pin env is on |
| `JEWELHEART_VOLUNTEER_HOME_TEST_TODAY` env | Optional override (any ISO date) |
| `scripts/_volunteer-app.html` → `VOLUNTEER_DEMO_DAY_ISO` | Web header when `uiChannel=testers` (dev/test) |

### Jul 10–16 (hypothetical testing window)

**Not implemented anywhere today.** A single sample fixture references `2026-07-16` as a slot date; there is no code path that sets retreat start/end to Jul 10–16.

Manage → Testing is where Jul 10–16 (or any window) would be configured — see [Retreat date override semantics](#retreat-date-override-semantics) below.

---

## Goals

1. **One resolver, one pipeline** — testing mode only changes inputs (`todayIso`, retreat window), not which functions run.
2. **Managers control testing** from **Manage → Testing** (dev/test; gated on production).
3. **Live mode** — active retreat from DB + real calendar.
4. **Testing mode** — pinned today + optional retreat window overrides from the Testing screen.
5. **Visible indicator** when testing is active so behavior is never mistaken for production.

---

## Architecture

### Single entry point: `resolveVolunteerTimeContext`

New module (e.g. `jewelheart-volunteer-time-context.js`):

```js
/**
 * @returns {{
 *   testingEnabled: boolean,
 *   todayIso: string,
 *   retreat: { id, name, startDate, endDate, datesSource: 'db'|'testing_override' },
 *   retreatBannerLine: string,
 *   liveTodayIso: string,  // always real calendar — for display / audit
 * }}
 */
async function resolveVolunteerTimeContext(query, { retreatId, firebaseUid, authToken })
```

**Resolution order for `todayIso`:**

| testingEnabled | todayIso |
|----------------|----------|
| `false` | `todayYmdInTimeZone('America/New_York')` |
| `true` | `pinnedTodayIso` from settings (required when enabled) |

**Resolution order for retreat window:**

| testingEnabled | overrideStart/overrideEnd set? | retreat dates |
|----------------|-------------------------------|---------------|
| `false` | — | Active retreat from DB (`listRetreats` / `JEWELHEART_ACTIVE_RETREAT_ID`) |
| `true` | no | Same as live (only today pinned) |
| `true` | yes | Override start/end from Testing settings (same `retreat.id`) |

**Delete** after migration:

- `volunteerHomePinSummer2026Demo()` fork inside `gatherVolunteerHomeContext`
- `volunteerHomeDefaultRetreat()` date replacement
- Env `JEWELHEART_VOLUNTEER_HOME_DEMO` (keep `TEST_TODAY` only as deploy bootstrap default until DB row exists)

`gatherVolunteerHomeContext` becomes:

```js
const timeCtx = await resolveVolunteerTimeContext(query, …);
const todayIso = timeCtx.todayIso;
const retreat = timeCtx.retreat;
// … single path: load shifts, build ctx, etc.
```

All screens consume `ctx.todayIso`, `ctx.retreat`, `ctx.retreatBannerLine`, `ctx.testingEnabled`.

---

## Persistence

### Table: `jewelheart_volunteer_testing_settings`

One row per environment database (dev / test; not production unless explicitly unlocked).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `enabled` | boolean | Testing mode on/off |
| `pinned_today` | date | Required when `enabled` |
| `override_start_date` | date nullable | Optional retreat window start |
| `override_end_date` | date nullable | Optional retreat window end |
| `updated_at` | timestamptz | |
| `updated_by_firebase_uid` | text | Audit |

Constraints:

- If `enabled`, `pinned_today` NOT NULL.
- If either override date set, both required and `start <= end`.
- Overrides apply only when `enabled`.

API (manager/admin only):

- `GET /jewelheart/manage/testing` — read settings + computed preview (banner line, live today for comparison).
- `PUT /jewelheart/manage/testing` — update settings.

SDUI screen: `jewelheart.volunteer.testing` linked from **Manage**.

---

## Manage → Testing UI (SDUI)

**Access:** manager or admin; hidden on production retreat deploy unless `JEWELHEART_TESTING_UI=1`.

**Controls:**

1. **Testing mode** — toggle Off / On.
2. **Pinned today** — date picker (default Jul 21 when first enabled).
3. **Override retreat dates** — optional checkbox + start/end pickers (e.g. Jul 10–16).
4. **Preview (read-only):**
   - Banner: `JH Retreat 2026.7.10-16 - Day 2 Wed`
   - Live calendar today: `2026-07-09 (Thu)` — so testers see both.
5. **Save** — writes DB; next SDUI request uses new context.

**Footer note when enabled:** gold bar or body text: `Testing mode — today pinned to Tue Jul 21 (live: Thu Jul 9)`.

---

## Retreat date override semantics

Important: **task rows in Postgres are keyed by real calendar dates** (`jewelheart_tasks` / schedule-by-day). Overriding the retreat window in Testing **does not move assignment data**.

| Scenario | What testing shows | Fidelity |
|----------|-------------------|----------|
| Pin today only (Jul 21), retreat Jul 20–26 from DB | Same as current demo — yellow pills for Jul 21 assignments | **High** |
| Override window Jul 10–16, DB tasks still Jul 20–25 | Banner/search day list use Jul 10–16; **no shifts match** pinned days | Low — empty home |
| Separate **test retreat** in DB (Jul 10–16 + reseeded tasks) + Testing points at that `retreat_id` | Full end-to-end | **High** |

**Recommendation:**

- **Phase 1:** Testing screen pins **today only** against the active retreat (Jul 20–26). Matches current tester workflow.
- **Phase 2:** Optional retreat window override for **UI enumeration** (banner, day chips, day number) with a clear warning if no tasks exist on those dates.
- **Phase 3 (optional):** “Use test retreat” picker — second retreat record in dev DB with Jul 10–16 and its own reseed script for true pre-retreat rehearsal.

For your Jul 10–16 example: that would be configured on Manage → Testing (Phase 2+), not in code today. To see real yellow pills in that window, dev DB needs tasks on those dates (reseed or separate test retreat).

---

## Consumers (must use `timeCtx`, not local dates)

| Consumer | Today | Retreat window |
|----------|-------|----------------|
| `gatherVolunteerHomeContext` / all SDUI screens | `ctx.todayIso` | `ctx.retreat` |
| Bootstrap / onboarding API | return `retreatBannerLine`, `todayIso`, `testingEnabled` | same |
| `scripts/_volunteer-app.html` header | prefer bootstrap/API; fallback only offline | same |
| iOS / Android volunteer home | **TODO:** fetch server context (today uses device calendar now) | DB retreat |

Functions that already respect `todayIso` once ctx is built (no change needed except ctx source):

- `volunteerHomeLoadMyShifts` — `dayIso === todayIso`
- `volunteerHomeSearchDayIsos`, searchable dates, past-day graying
- `volunteerHomeRetreatBannerLine`, day number, weekday
- Check-in “today” operations via `ctx.todayIso`

Check-in **timestamps** remain real wall-clock time (correct for live).

---

## Parity: how faithful is testing?

**Principle:** Testing mode is the **same engine** with substituted **clock** and optional **calendar window** inputs.

| Confidence | Condition |
|------------|-----------|
| **~90%+** | Single code path; pin today only; DB tasks on real retreat dates |
| **~70% today** | Demo/live `if` fork + `volunteerHomeDefaultRetreat` + web/native duplicate date math |
| **Lower** | Retreat window override without matching task data in DB |

**Automated parity tests** (recommended):

- Pure functions: given `{ start: Jul 20, end: Jul 26, today: Jul 21 }` → Day 2 Tue, N searchable days, etc.
- Same inputs whether `testingEnabled` true or false.
- Boundary cases: day before retreat, day 1, last day, day after retreat.

---

## Migration from current env vars

| Current | After |
|---------|--------|
| `JEWELHEART_VOLUNTEER_HOME_DEMO=1` (default) | DB `enabled=true`, `pinned_today=2026-07-21` on dev/test seed |
| `JEWELHEART_VOLUNTEER_HOME_DEMO=0` (production go-live) | DB `enabled=false` |
| `JEWELHEART_VOLUNTEER_HOME_TEST_TODAY` | Seed/migrate into `pinned_today`; env deprecated |
| Web `VOLUNTEER_DEMO_DAY_ISO` / testers channel pin | Read from bootstrap `retreatBannerLine` |

---

## Implementation phases

### Phase 1 — Resolver + DB + Manage → Testing (pin today only)

- Migration `jewelheart_volunteer_testing_settings`
- `resolveVolunteerTimeContext`
- Merge demo/live paths in `gatherVolunteerHomeContext`
- Remove `volunteerHomeDefaultRetreat` date clobbering
- SDUI Manage → Testing screen (toggle + pinned today + preview)
- Bootstrap returns banner context
- Web header uses bootstrap

### Phase 2 — Optional retreat window override

- Override start/end on Testing screen
- Warning when pinned today outside override window or no tasks on pinned day

### Phase 3 — Native clients + optional test retreat

- iOS/Android consume server `todayIso` / banner
- Optional second retreat + reseed for Jul 10–16 rehearsal data

---

## Open questions

1. **Production:** Testing UI hard-disabled on `retreat` env, or allowed for admins with audit?
2. **Override scope:** UI-only window vs require matching DB tasks / test retreat?
3. **Midnight rollover:** Accept manual pin changes only, or auto-sync pinned today forward each day while testing stays on?

---

## Related code references

- Today resolver (to replace): `volunteerHomeDemoTodayIso`, `volunteerHomePinSummer2026Demo` — `jewelheart-sdui-home.js` ~187–616
- Fork to remove: `gatherVolunteerHomeContext` ~3059–3119 vs ~3121+
- Hardcoded retreat fallback: `VOLUNTEER_HOME_DEFAULT_RETREAT`, `volunteerHomeDefaultRetreat()`
- Web header: `scripts/_volunteer-app.html` — `VOLUNTEER_RETREAT`, `volunteerHeaderContextIso`
- Active retreat env: `JEWELHEART_ACTIVE_RETREAT_ID` — `jewelheart-volunteer-onboarding.fragment.js`
