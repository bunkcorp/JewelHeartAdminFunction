# Shift info — Master Spec (`jewelheart.volunteer.shiftInfo`)

> **Status:** Approved (2026-06-24). Implement from scratch.
> **Scope:** Read-only job instructions for an assigned shift (no check-in controls).
> **Authority:** Edit this document first, then change code to match.

---

## 1. Purpose

Show **how to do** the job for a shift the volunteer is assigned to — without check-in
actions. Used for fulfilled today, past shifts, and future-day preview from My Assignments.

---

## 2. Layout (top → bottom)

Same as check-in screen **from line 4 onward** (`shift-check-in.md`):

1. **Header bars** — standard retreat banner + secondary line.
2. **Title bar (blue, white text):** `"Info – {job}"` or `"Shift info – {job}"` (pick one at implement time; include `{job}`).
3. **Instructions title bar (blue):** `"How to do – {job}"`.
4. **Instructions body** — scrolling blue-framed region (same content source as check-in screen).
5. **Footer nav** — standard `<-` and **Home**.

**Omitted:** Check-in row (Start / time boxes / Undo).

---

## 3. Navigation

| Entry | From |
|-------|------|
| My Assignments — **main tap** on future-day maroon pill | This screen |
| My Assignments — light maroon / past-day pills (info tap) | This screen |
| Edit screen — optional link TBD | — |

Payload: `taskId`, `retreatId`, `returnTo`.

**Check-in** for today unfulfilled → `shift-check-in.md` (main tap on yellow pill).

**Edit** → `shift-edit.md` (pencil on any todo row).
