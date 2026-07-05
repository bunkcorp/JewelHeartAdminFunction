# Edit shift — Master Spec (`jewelheart.volunteer.shiftEdit`)

> **Status:** Approved (2026-06-24). **Replace existing screen** — implement from scratch.
> **Scope:** Release shift, optional reassign via person picker, or leave open.
> **Authority:** Edit this document first, then change code to match.
> **Related:** Person picker → `person-picker.md`. Check-in → `shift-check-in.md`.

---

## 1. Purpose

Let the assigned volunteer **release** a shift (unassign self), then optionally **reassign**
to another retreat volunteer, or leave the shift **open**.

Author note: line-by-line UI replacements are a starting point; expect iteration after using
in dev. Do not layer on the prior `shiftDetail` spec — reimplement from this doc.

---

## 2. Layout phases

### Phase A — Initial (assigned to me)

1. **Header bars** — standard.
2. **Title bar (blue):** `"Edit – {day} – {job}"` (`{day}` = weekday or date per existing convention).
3. **Action row (line 3):**
   - **`Release shift`** — dark maroon.
   - **`Cancel (keep shift)`** — blue → immediate return to prior screen (same as `<-`).

### Phase B — After **Release shift**

Replace line 3 with text:

**`Shift released! Reassign to…`**

4. **Person picker** — full-width line; see `person-picker.md`.
5. **Button row (line 5):**
   - **`Reassign`** — enabled only when a person is selected.
   - **`Cancel reassignment`** — always enabled; does **not** require a selection.

### Phase C — Terminal outcomes

User exits only via footer **`<-`** or **Home** (no auto-navigate).

#### C1 — Successful reassign

- Replace line 3 with: **`Reassigned to:`**
- Perform assignment transfer to selected `volunteerId`.
- Line 4: show chosen name **read-only** (plain text preferred over locked input).
- Hide line 5 buttons.
- Person picker: no further typing/search.

#### C2 — Cancel reassignment (or abandon reassign)

- Line 3: **`Shift released!`**
- Line 4 text: **`Not reassigned, still open!`**
- Hide person picker and line 5 buttons.
- Shift remains **unassigned** (open).

---

## 3. Button semantics

| Button | When | Effect |
|--------|------|--------|
| **Release shift** | Phase A | Unassign me; go to Phase B |
| **Cancel (keep shift)** | Phase A | No API change; navigate back |
| **Reassign** | Phase B, person selected | Assign shift to selected person; Phase C1 |
| **Cancel reassignment** | Phase B | Do not assign; shift stays open; Phase C2 |

**Cancel reassignment** ignores any typed/selected name.

---

## 4. API (conceptual)

1. **Release:** delete my assignment (or unassign API).
2. **Reassign:** create assignment for selected volunteer on same task (atomic transfer preferred).
3. **Cancel reassignment:** no new assignment; release stands.

Idempotent navigation after terminal state.

---

## 5. Navigation

| Entry | From |
|-------|------|
| Pencil (**edit icon**) on My Assignments yellow / future maroon rows | This screen |
| Pencil on Home yellow pills (if added) | This screen |

Main pill tap on todo rows goes to **check-in** (today) or **info** (future), not here.

Payload: `taskId`, `retreatId`, `returnTo`.

---

## 6. Person picker on this screen

- Roster: **retreat** linked volunteers.
- Exclude: self.
- After C1 or C2: picker removed or read-only; footer nav only.
