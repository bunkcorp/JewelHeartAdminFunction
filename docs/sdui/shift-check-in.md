# Check-in for shift — Master Spec (`jewelheart.volunteer.checkin`)

> **Status:** Approved (2026-06-24). **Replace existing screen** — implement from scratch per this doc.
> **Scope:** Start/End/Undo check-in for **today's** assigned shift.
> **Authority:** Edit this document first, then change code to match.
> **Related:** Data model → `check-ins.md`. Job instructions → job metadata / Master tab.
> **Supersedes:** Layered behavior on `jewelheart.volunteer.shiftDetail` check-in UI.

---

## 1. Purpose

Record check-in start (and optional finish) for the current assignment. One open check-in
session at a time on this screen (Start → End → Undo resets).

---

## 2. Layout (top → bottom)

1. **Header bars** — standard retreat banner + secondary line (shared home header).
2. **Title bar (blue, white text):** `"Check in – {job}"` where `{job}` is this shift's job title.
3. **Check-in action row (line 3):**
   - Button **`Start`** — dark maroon, **enabled** initially.
   - Box — empty initially; shows start time `h:mm AM/PM` after Start.
   - Text **`–`** (separator).
   - Box — empty initially; shows finish time `h:mm AM/PM` after End.
   - Button **`Undo`** — disabled, gray initially.
4. **Instructions title bar (blue, white text):** `"How to do – {job}"`.
5. **Instructions body** — scrolling region, minimum ~2 lines on minimal phone; framed in blue;
   frame visually merges with the "How to do" bar above the scroll area.
6. **Footer nav** — standard `<-` Back and **Home**; stationary at bottom.

---

## 3. Check-in record

Each check-in row for this assignment contains:

- Volunteer name (display)
- Start time
- Finish time (may be empty until End)

Persist per `check-ins.md` (`jewelheart_shift_checkins`).

---

## 4. Button behavior

### Initial state

| Control | State |
|---------|--------|
| Start | Enabled, dark maroon, label `"Start"` |
| Start time box | Empty |
| Finish time box | Empty |
| Undo | Disabled, gray |

### Press **Start**

1. Fill first time box with **current local time** (`h:mm AM/PM`, retreat timezone).
2. Insert check-in row: start = now, finish = null.
3. Increment assignment check-in count (fulfillment rules per `check-ins.md`).
4. Change button label to **`End`** (still active, dark maroon).
5. Enable **Undo**, style Undo **blue**.

### Press **End** (was Start)

1. Fill second time box with current local time.
2. Update the open check-in row with finish time.
3. Disable **End** button; style **light maroon**.

### Press **Undo**

1. Remove the check-in row created in this session.
2. Decrement check-in count.
3. Restore **entire row 3** to initial state (labels, colors, empty boxes, Undo disabled gray).

---

## 5. Server rules

- **Start** only when assignment slot date **equals today** (retreat TZ). Reject otherwise.
- **End** only when an open check-in exists for this assignment.
- **Undo** only for the current session's row (same rules as today-only Start).

---

## 6. Navigation

| Entry | From |
|-------|------|
| My Assignments — yellow pill (main tap) | This screen |
| Home — yellow pill | This screen |

Payload: `taskId`, `retreatId`, `returnTo` as today.

**Edit shift** is a separate screen (`shift-edit.md`); pencil icon on My Assignments rows.

---

## 7. Shift info variant

Read-only job instructions without check-in row → `shift-info.md` (lines 4–5 of this layout only).
