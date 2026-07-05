# Test people list — `people-test.xlsx`

> **Source:** `RetreatVolunteer/Redesign/People, test.xlsx` (uploaded 2026-06-24).
> **Copy in repo:** `people-test.xlsx` (this folder).

---

## Purpose

QA dataset for the **person picker** matcher (`person-picker.md`):

- ~100 rows of realistic first/last names
- Duplicate first names (multiple **John**, **Nancy**, **David**, **Kathy**, **Rachel**)
- Multi-word and hyphenated last names (`Moore-O'Leary`, `Mann-Devos`, `Dumke-Steiger`)
- Short names (`Su Cutler`, `Andy JH`, `J Tseten`)
- Pairs useful for multi-token search: **John Moran** vs **John Madison**
- Optional columns **admin** / **manage** (1 = flag) on a few rows at bottom

---

## Columns

| Col | Header | Notes |
|-----|--------|-------|
| A | FirstName | |
| B | LastName | |
| C | Email Address | |
| D | Mobile | Often empty |
| E | admin | Optional `1` |
| F | manage | Optional `1` |

**Display name for picker:** `{FirstName} {LastName}` (trim; preserve casing from sheet).

---

## Suggested test queries

| Query | Expect |
|-------|--------|
| `john` | Moran, Madison, Schramm, Reese, … (list or “keep typing” if >12) |
| `john m` | Moran, Madison |
| `jo mo` | Moran |
| `nancy` | Beachum (×2 emails), Foth |
| `kathy` | Laritz (×2 emails) |

---

## Import (dev DB)

```bash
# Dev (karmadots_dev)
node scripts/seed-people-test-remote.mjs dev

# Test (karmadots_test)
node scripts/seed-people-test-remote.mjs test

# Dry-run (no writes)
node scripts/seed-people-test-remote.mjs test --dry-run
```

Legacy alias: `node scripts/seed-people-test-dev.mjs` → dev only.

On the laptop directly:

```bash
cd ~/private-server-dev
node --env-file=.env scripts/seed-people-test.mjs people-test.xlsx
```

Upserts `jewelheart_volunteers` by email (or display name when email empty), then links each row to the Summer 2026 retreat (`2026-07-20` start, or `JEWELHEART_PEOPLE_TEST_RETREAT_ID`).

**Privacy:** Test emails/phones are from author’s roster export; use only in dev/test environments.
