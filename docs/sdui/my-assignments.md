# My Assignments — Prompt Spec (`jewelheart.volunteer.mine`)

> **Status:** Spec update (2026-06-24) — navigation + dual tap targets; pending reimplementation.
> **Scope:** My Assignments list (shown when volunteer has ≥1 assignment).
> **Authority:** When behavior changes, edit this document first, then change code to match.
> **Related:** `shift-check-in.md`, `shift-info.md`, `shift-edit.md`, `check-ins.md`.

---

## Screen layout (top to bottom)

1. **Header bar** — identical to every other screen (retreat banner + secondary line).
2. **Screen identity bar** (blue) — identifies this screen; wording may differ from the
   first words of section title bars (space optimization). Example:
   `"12 shifts assigned to me"` where `12` is the **total count across all days**
   (past, today, future).
3. **Scrolling body** — four sections below, single scroll region.
4. **Footer nav** — standard back/home buttons; **stationary** at bottom even on minimal phones.

**Empty retreat:** If the volunteer has zero assignments, all four sections are empty.
Show only one dark-maroon bar: `"No shifts assigned for retreat"`. (Equivalent to
zero total in bar 2 when logic is correct.)

**Empty section:** A section with no matching shifts shows **neither** its title bar
**nor** any buttons.

**Pluralization:** All `n` / `nn` counts use grammatically correct singular/plural
(e.g. `"1 shift assigned to me"` vs `"2 shifts assigned to me"`,
`"1 to do today"` vs `"2 to do today"`).

---

## Button label format

All shift buttons use **`Wd • Job`** (weekday short + bullet + job name), e.g.
`Tue • Kitchen full clean, end of day`. Same convention as Home gold pills
(bullet = ` • `, U+2022).

Each shift row is a **pill + edit affordance**:

- **Main pill** — primary color; tap target for check-in or info (see sections below).
- **Edit control** — pencil icon (`✎` or platform edit glyph) **after** the pill; tap →
  **Edit shift** (`jewelheart.volunteer.shiftEdit`).

---

## Navigation targets

| Tap | Screen | Spec |
|-----|--------|------|
| Yellow pill (main) | `jewelheart.volunteer.checkin` | `shift-check-in.md` |
| Yellow pencil | `jewelheart.volunteer.shiftEdit` | `shift-edit.md` |
| Future maroon pill (main) | `jewelheart.volunteer.shiftInfo` | `shift-info.md` |
| Future maroon pencil | `jewelheart.volunteer.shiftEdit` | `shift-edit.md` |
| Past / done today (main) | `jewelheart.volunteer.shiftInfo` | `shift-info.md` |
| Past / done today pencil | `jewelheart.volunteer.shiftEdit` | `shift-edit.md` |

**Unassign** is not on this list screen; use **Edit shift → Release shift**.

Legacy route `jewelheart.volunteer.shiftDetail` may redirect until clients migrate.

---

## Four sections

Order (top to bottom in scroll):

1. **Today — not checked in** (yellow)
2. **Future days** (dark maroon)
3. **Today — already checked in** (light maroon, no edit icon)
4. **Past days** (dark / light maroon)

### 1. Shifts to do today (yellow)

- **Title bar (yellow):** `"n todo today – tap chk-in – ✎ edit"` (grammar per count; `✎` = pencil in UI).
- **Buttons (yellow pills):** My shifts where `day = today` and
  `checkin_count < checkins_required`.
- **Main pill tap:** Check-in screen (`shift-check-in.md`).
- **Pencil tap:** Edit shift screen (`shift-edit.md`).

### 2. Shifts to do on future days (dark maroon)

- **Title bar (dark maroon):** `"Todo future days – tap info – ✎ edit"`.
- **Buttons (dark maroon):** My shifts where `day > today`.
- **Main pill tap:** Shift info (`shift-info.md`).
- **Pencil tap:** Edit shift (`shift-edit.md`).

### 3. Shifts already done today (light maroon)

- **Title bar (light maroon):** `"n already done today"`.
- **Buttons (light maroon):** My shifts where `day = today` and
  `checkin_count >= checkins_required`.
- **Main pill tap:** Shift info only — **no edit icon** on this section.

### 4. Shifts on past days (dark / light maroon)

- **Title bar (dark maroon):** `"n on past days, tap for info – ✎ edit"`.
- **Buttons:** All my shifts where `day < today`.
  - **Dark maroon** if `checkin_count >= 1`.
  - **Light maroon** if `checkin_count = 0`.
- **Main pill tap:** Shift info.
- **Pencil tap:** Edit shift.

---

## Check-in completion rule (cross-cutting)

- Each assignment may have **multiple check-in records** (start time; finish optional).
- **Start without finish counts as one check-in** toward fulfillment.
- Finish is optional but strongly urged in the UI.
- Shift **fulfilled** when `checkin_count >= job.checkins_required`.

---

## Home screen (related, same release)

- Yellow pills and the third summary bar count include **only today's unfulfilled** shifts
  (`checkin_count < checkins_required`).
- Fulfilled today's shifts do not appear as yellow alerts on Home.

---

## Manage screen (managers/admins)

Add a check-ins management view reachable from **Manage** (`jewelheart.volunteer.manage`):
browse check-ins by shift and more globally. UI/UX TBD — first pass acceptable.
