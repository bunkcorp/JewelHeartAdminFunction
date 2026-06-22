# Find — Master Spec (`jewelheart.volunteer.search`)

> **Status:** Approved (2026-06-21). Canonical contract for web/iOS/Android.
> **Scope:** The regular **Find** screen only (filter by day + job). "Find by type"
> (`jewelheart.volunteer.searchByType`) is **out of scope / deferred**.
> **Authority:** This document is the source of truth. Web, iOS, and Android must all
> satisfy it. When behavior changes, **edit this spec first**, then change code to match.

---

## 1. Purpose

Let a volunteer narrow the pool of open shifts by **which days** and **which jobs**, then run
the search. The result of "Search" hands the chosen filters to the assignment screen
(`jewelheart.volunteer.assign`).

---

## 2. Layout (top to bottom)

1. **Header bars** — retreat banner + secondary line (shared home header), then the title
   line **"Find open shifts by filter"**.
2. **Action row** — a centered inline row containing **`Search`** and **`Cancel`**.
3. **Day filter block** (omitted when the retreat has only one selectable day — see §7):
   - **`All days`** toggle.
   - One **day pill** per retreat day, in calendar order, wrapped to multiple rows.
4. **Job filter block**:
   - **`All jobs`** toggle.
   - One **job pill** per searchable job, wrapped to multiple rows, inside a scrollable
     framed region.
5. **Footer** — standard volunteer footer nav.
6. **Build stamp** + any layout warnings (diagnostic, bottom).

---

## 3. Filter state

The complete filter state is six fields. All are strings.

| Field | Meaning |
|-------|---------|
| `daysAll` | `"1"` = all days selected; `"0"` = a specific subset is selected |
| `selectedDays` | CSV of ISO dates (`YYYY-MM-DD`), only meaningful when `daysAll="0"` |
| `daysPrev` | CSV remembered subset, used to restore after toggling `All days` back on |
| `jobsAll` | `"1"` = all jobs selected; `"0"` = a specific subset is selected |
| `selectedJobs` | CSV of job IDs, only meaningful when `jobsAll="0"` |
| `jobsPrev` | CSV remembered subset, used to restore after toggling `All jobs` back on |

Supporting params (not filter state, but travel with it):

| Param | Meaning |
|-------|---------|
| `retreatId` | Which retreat's days/jobs to show |
| `returnTo` | Where `Cancel` / back returns (normally `jewelheart.home`) |
| `filterReset` | **Client-only** signal "reset to initial". Stripped before the network call. |

**Invariants** (the server normalizes to these on every render):

- If `daysAll="1"` then `selectedDays=""`.
- If `jobsAll="1"` then `selectedJobs=""`.
- If `daysAll="0"` but `selectedDays` is empty (and the retreat has >1 day), revert to
  `daysAll="1"`, `daysPrev=""`.
- If `jobsAll="0"` but `selectedJobs` is empty, revert to `jobsAll="1"`, `jobsPrev=""`.

---

## 4. Initial state

The screen is in **initial state** when entered fresh from Home, or after an explicit reset:

```
daysAll = "1"      selectedDays = ""   daysPrev = ""
jobsAll = "1"      selectedJobs = ""   jobsPrev = ""
```

Meaning: **All days + All jobs** selected; no individual day or job pill highlighted.
Functionally this searches every future retreat day × every searchable job.

**Reset triggers:**
- Navigating **Home → Find** (client adds `filterReset="1"`).
- (No in-screen "reset" button exists today.)

---

## 5. Controls and interactions

Each control below lists: its visual state rule, and the filter transition it produces.
"Selected" = dark/active styling; "unselected" = light styling (see §8).

### 5.1 `All days` toggle

- **Selected when** `daysAll="1"`.
- **Tap behavior** (identical to `All jobs`, §5.3):
  - If currently **on** (`daysAll="1"`):
    - If `daysPrev` is non-empty → turn off and **restore** that subset
      (`daysAll="0"`, `selectedDays=daysPrev`).
    - Else → **no-op** (button carries no action). The user picks a starting day via the
      day pills (§5.2).
  - If currently **off** (`daysAll="0"`): turn **on**
    (`daysAll="1"`, `selectedDays=""`, `daysPrev=` the subset that was just active).
- **Single-day retreat:** not shown (see §7).

### 5.2 Day pill (one per retreat day)

- **Past days** (date < today): **disabled**, gray, no action, not tappable.
- **Future days:**
  - **Selected when** `daysAll="0"` AND the day is in `selectedDays`.
  - **Tap behavior:**
    - If `All days` is currently on (`daysAll="1"`): switch to **that day only**
      (`daysAll="0"`, `selectedDays=thatDay`).
    - Else: **toggle** that day in `selectedDays`.
      - If the toggle **empties** the set → **turn `All days` on** — the same operation as
        the off→on case in §5.1 (`daysAll="1"`, `selectedDays=""`, `daysPrev=""`).
      - Otherwise the toggle result stands. (`daysAll` is already `"0"`; only `selectedDays`
        changes — to the updated set, in natural calendar order.)

### 5.3 `All jobs` toggle

- **Selected when** `jobsAll="1"`.
- **Tap behavior** (identical to `All days`, §5.1):
  - If currently **on** (`jobsAll="1"`):
    - If `jobsPrev` is non-empty → turn off and **restore** that subset
      (`jobsAll="0"`, `selectedJobs=jobsPrev`).
    - Else → **no-op** (button carries no action). The user picks a starting job via the
      job pills (§5.4).
  - If currently **off** (`jobsAll="0"`): turn **on**
    (`jobsAll="1"`, `selectedJobs=""`, `jobsPrev=` the subset that was just active).

### 5.4 Job pill (one per searchable job)

- **Selected when** `jobsAll="0"` AND the job is in `selectedJobs`.
- **Tap behavior:**
  - If `All jobs` is currently on (`jobsAll="1"`): switch to **that job only**
    (`jobsAll="0"`, `selectedJobs=thatJob`).
  - Else: **toggle** that job in `selectedJobs`.
    - If the toggle **empties** the set → **turn `All jobs` on** — the same operation as the
      off→on case in §5.3 (`jobsAll="1"`, `selectedJobs=""`, `jobsPrev=""`).
    - Otherwise the toggle result stands. (`jobsAll` is already `"0"`; only `selectedJobs`
      changes — to the updated set, in job-list order.)

### 5.5 `Search`

- Always enabled.
- **Action:** navigate to `jewelheart.volunteer.assign`, passing the **current filter state**
  as payload (`daysAll, selectedDays, daysPrev, jobsAll, selectedJobs, jobsPrev`) plus
  `retreatId` and `returnTo=jewelheart.home`.

### 5.6 `Cancel`

- Always enabled.
- **Action:** navigate to `jewelheart.home` (no filter payload).

---

## 6. Client ↔ server contract

- Every filter tap is a **navigate to the same screen** (`jewelheart.volunteer.search`) with
  the **next** state as payload. The client updates its params from the payload, then
  refetches the screen.
- The server is the **single authority** for state normalization: it takes the incoming
  params, applies §3 invariants and the §5 transition already encoded in the payload, and
  returns the screen plus `metadata.filterState` (the canonical state).
- After each load, the client **syncs its params from `metadata.filterState`** so client and
  server never drift.
- **`filterReset` is client-only**: the client strips it (and any one-shot flags) before the
  network call; the server treats its presence in the payload as "produce initial state".

---

## 7. Edge cases

- **Single selectable day** (retreat has exactly one day ≥ today): the **`All days` toggle is
  omitted**; the lone day pill renders **selected and disabled** (no toggling). `daysAll`
  effectively stays `"1"` for that day.
- **Past days:** always gray, disabled, no action.
- **Empty day subset:** never persists — auto-reverts to `All days` (§3, §5.2).
- **Empty job subset:** never persists — auto-reverts to `All jobs` (§3, §5.4).
- **No searchable jobs / no retreat:** show the screen with empty job list and a diagnostic
  note; `Search` still works (searches all days × no jobs → empty result downstream).

---

## 8. Visual style

| Element | Unselected | Selected | Disabled / past |
|---------|-----------|----------|-----------------|
| Day / job / All toggle | light maroon `#C68581`, white bold text | dark maroon `#92160E`, white bold text, raised | gray, white text, flat, not tappable |

- All toggles are **rounded pills**, bold, centered text, ~14sp, fixed bar height, small
  horizontal padding; they **wrap** within their row (flow layout), sized to label width
  (never full-bleed).
- `Search` is a maroon pill; `Cancel` is a maroon pill; both in a centered row.
- The job pill region is a **scrollable framed box** (maroon border) when the list is long.

---

## 9. Resolved decisions

1. **Symmetry of `All days` / `All jobs`.** Both behave identically (§5.1 = §5.3): tapping
   while **on** restores `…Prev` if present, otherwise **does nothing** (no "today only"
   fallback). The user picks a starting day/job via the pills.
2. **Stored order.** Selected days/jobs are stored as **CSV in natural order** (days in
   calendar order; jobs in job-list order). CSV order is internal — pill **display** order is
   driven by the day/job list, not by the CSV.
3. **`Search` target.** Navigates to **`jewelheart.volunteer.assign`** with the current filter.
4. **Single-day retreat.** The lone day pill renders **selected + disabled** (confirmed, §7).
5. **Empty-revert clears `…Prev`.** When deselecting the last day/job reverts to the All
   state, `daysPrev` / `jobsPrev` are **cleared** (so the next `All` tap is a no-op rather
   than restoring a stale subset). Confirmed 2026-06-21.
