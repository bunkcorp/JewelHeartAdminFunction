# Check-ins — Data Model & Rules

> **Status:** Implemented (2026-06-24). See migration `008_jewelheart_shift_checkins.sql`.
> **Authority:** Edit before schema/code changes.

---

## Purpose

Track volunteer check-ins per **assignment** (volunteer × task/shift). Support jobs
that require more than one check-in (Master tab column K; urinals = 2, default = 1).

---

## Entities

### Job metadata

- `jewelheart_jobs.checkins_required` integer NOT NULL DEFAULT 1, CHECK (>= 1)
- Loaded from v9 Master tab — see `spreadsheet-v9-master.md` (values in column **J** in the
  on-disk v9 file; author label **K** — treat as same field, column letter per that doc).

### Check-in records

Table `jewelheart_shift_checkins` (name TBD):

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `assignment_id` | uuid FK → `jewelheart_assignments` | CASCADE on assignment delete |
| `started_at` | timestamptz NOT NULL | Set on Start |
| `finished_at` | timestamptz NULL | Set on Finish; optional |
| `created_at` | timestamptz | |

Multiple rows per assignment allowed.

### Counting

- **`checkin_count`** for fulfillment = number of check-in rows for that assignment
  (each Start creates a row; open session without Finish still counts).
- **`fulfilled`** = `checkin_count >= job.checkins_required`.

---

## Server enforcement

1. **Start check-in** only when assignment's slot date **equals today** (retreat timezone).
   Reject Start for past/future days even if client navigates directly.
2. **Finish** only for an open check-in on today's assignment (or any open row for that assignment).
3. Persist to Postgres (replace in-memory `taskCheckins` demo map).

---

## Current state

- Postgres table `jewelheart_shift_checkins` + `jewelheart_jobs.checkins_required`.
- Home yellow pills = today's **unfulfilled** shifts only.
- My Assignments rewritten per `my-assignments.md`.
- Shift detail screen: `jewelheart.volunteer.shiftDetail` (`shiftMode=edit|info`).
- Manage screen lists recent retreat check-ins.
- `jewelheart.volunteer.checkin` remains as a thin wrapper → shiftDetail edit mode.

## Former gaps (resolved)

- Check-ins today are **in-memory only**; lost on restart.
- `buildJewelheartVolunteerCheckinScreen` applies Start/Finish **without verifying today**.
- Shift screen accepts `checkinOp=start|finish` without day guard.
- No `checkins_required` on jobs in DB or poster job metadata array.

---

## Screens affected

| Screen | Change |
|--------|--------|
| `jewelheart.home` | Yellow pills = today unfulfilled only |
| `jewelheart.volunteer.mine` | Dual tap: check-in/info + pencil → edit — `my-assignments.md` |
| `jewelheart.volunteer.checkin` | New check-in UI — `shift-check-in.md` |
| `jewelheart.volunteer.shiftInfo` | Job instructions only — `shift-info.md` |
| `jewelheart.volunteer.shiftEdit` | Release / reassign — `shift-edit.md` |
| `jewelheart.volunteer.manage` | Check-ins browser |
| `jewelheart.volunteer.shiftDetail` | **Legacy** — replace with routes above |
| `jewelheart.volunteer.checkin` (old wrapper) | Remove after migration |
| `jewelheart.volunteer.shift` | Partially **orphaned** for `shiftOp=mine`; still used from Find/assign flow |
