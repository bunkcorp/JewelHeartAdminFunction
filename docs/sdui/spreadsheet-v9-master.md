# Master Tab — v9 Spreadsheet Layout

> **Canonical file:** `C:/Data/dev/RetreatVolunteer/Redesign/Retreat_Volunteer_Schedule v9.xlsx`
> **Tab:** `Master`
> **Status:** Authoritative for job metadata import and poster generation.

---

## Column map (rows 2–18 = jobs)

| Col | Header (row 1) | Data | Notes |
|-----|----------------|------|-------|
| A | Job | Job title (multiline) | Primary label |
| B–G | Day 1 … Day 6 | Assignee names / schedule | `XXXXX` = not scheduled that day |
| H | Job | Duplicate title column | |
| I | Est Min | Estimated minutes | e.g. 10, 15, 25 |
| **J** | *(no header in file)* | **Check-ins required** | `1` all jobs; **`2` Urinals** (row 14) |
| K | *(empty in v9 export)* | — | Author refers to this as check-ins required; see note below |
| L | t | Job type | `f` food, `v` vacuum, `b` bathroom, `m` misc |
| M | Job abbrev | Short label for pills/filters | |
| N, O | len / abbrev len | Layout diagnostics | |

---

## Check-ins required (fulfillment count)

- Default: **1** check-in per assignment to fulfill the shift.
- **Urinals** (`Urinals / Check pads & mop`): **2** check-ins required.

Used on Home (yellow pills), My Assignments sections, and fulfillment logic.

---

## Column J vs K

Author spec: **column K** = check-ins required.

In `Retreat_Volunteer_Schedule v9.xlsx` as stored on disk, numeric values **`1` / `2` appear in column J**; column **K is blank** on all job rows. Import code should read **J** until the spreadsheet is updated to match K, or confirm with author which letter is correct in their Excel view (hidden column, etc.).

---

## Related columns (v8 → v9)

v8 placed **Job abbrev** in column K. v9 moved abbrev to **M** and check-ins count to **J** (per file dump).

---

## Verify locally

```bash
node scripts/dump-xlsx.mjs "C:/Data/dev/RetreatVolunteer/Redesign/Retreat_Volunteer_Schedule v9.xlsx" Master
```
