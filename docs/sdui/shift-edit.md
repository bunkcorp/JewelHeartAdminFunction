# Edit shift — Master Spec (`jewelheart.volunteer.shiftEdit`)

> **Status:** Approved (2026-07-09). **Release only** — no in-app reassignment.
> **Scope:** Release shift (unassign self), then show confirmation message.
> **Authority:** Edit this document first, then change code to match.
> **Related:** Check-in → `shift-check-in.md`.

---

## 1. Purpose

Let the assigned volunteer **release** a shift (unassign self). After release, show a
confirmation message only — **no reassignment** in the app (privacy / complexity).

---

## 2. Layout phases

### Phase A — Initial (assigned to me)

1. **Header bars** — standard.
2. **Title bar (blue):** `"Edit – {day} – {job}"` (`{day}` = weekday or date per existing convention).
3. **Action row (line 3):**
   - **`Release shift`** — dark maroon.
   - **`Cancel (keep shift)`** — blue → immediate return to prior screen (same as `<-`).

### Phase B — After **Release shift** (terminal)

Replace line 3 with confirmation text only (no person picker, no buttons).

- Line 3: **`Shift released!`** — dark maroon, bold.
- If shift day is **today or tomorrow:** add **`Please find someone to take it.`**
- If shift day is **today:** add **`Especially important since shift is today`** — bold.

User exits only via footer **`<-`** or **Home** (no auto-navigate).

---

## 3. Button semantics

| Button | When | Effect |
|--------|------|--------|
| **Release shift** | Phase A | Unassign me; go to Phase B |
| **Cancel (keep shift)** | Phase A | No API change; navigate back |

---

## 4. API (conceptual)

1. **Release:** delete my assignment (or unassign API).

Idempotent navigation after terminal state (`editOutcome: open`).

---

## 5. Navigation

| Entry | From |
|-------|------|
| Pencil (**edit icon**) on My Assignments yellow / future maroon rows | This screen |
| Pencil on Home yellow pills (if added) | This screen |

Main pill tap on todo rows goes to **check-in** (today) or **info** (future), not here.

Payload: `taskId`, `retreatId`, `returnTo`.
