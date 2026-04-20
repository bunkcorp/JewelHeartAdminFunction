# Cafe / housekeeping jobs — how to add in JewelHeart

JewelHeart separates **what** (jobs), **when** (slots = calendar day + time band), and **who does it when** (**tasks** = one job × one slot).

## Time bands (slots)

Postgres / API enum: `early`, `lunchtime`, `dinnertime`, `allday`, `anytime`.

There is **no** “afternoon break” value. For that, create slots with `time_band: anytime` and a clear **label**, e.g. `Afternoon break`, for each retreat day.

Rough mapping from your wording:

| Your phrase | Typical slot |
|-------------|----------------|
| every early morning | `early` |
| every lunch break | `lunchtime` |
| every dinner break | `dinnertime` |
| every afternoon break | `anytime` + label “Afternoon break” |
| every end of day | `dinnertime` or `anytime` + label “End of day” (pick one convention and stay consistent) |

## Alternate days (“every other end of day”)

Create **tasks** only on the dates you want (skip every other “end of day” slot for that job), or use **notes** on tasks. The model does not encode “alternate” inside the job row itself.

## File: `cafe-housekeeping-jobs.json`

Array of objects matching **`POST /jewelheart/retreats/{retreatId}/jobs`** (`JobCreate`):

- `title` (required)
- `volunteersNeeded` (required, ≥ 1) — all set to **1** so you can raise later in the app
- `estimatedMinutes` (required) — filled with reasonable estimates where you had `???`
- `subjobs` (optional) — plain strings; server assigns `sortOrder`

Split your single “tidy lunch **and** dinner” line into **two** jobs so each can attach to a `lunchtime` vs `dinnertime` slot cleanly.

## Option A — Web admin (`karmadots.org/login`)

1. Sign in, pick retreat, **Jobs** tab.
2. For each row in the JSON, use **New job** (or paste title / minutes / subjobs from the file).

## Option B — REST (script)

```bash
export JEWELHEART_API="${JEWELHEART_API:-https://api.karmadots.org/jewelheart}"
export RETREAT_ID="<your-retreat-uuid>"
export TOKEN="<firebase-id-token>"   # short-lived; get from app/debug or Firebase CLI

python3 scripts/import_cafe_housekeeping_jobs.py
```

Run from repo root; see `scripts/import_cafe_housekeeping_jobs.py`.

## Option C — iOS / Android admin

Use the **Retreats → Jobs** flow; same payloads as the JSON.

## After jobs exist

1. **Slots** — For each retreat day, add slots (label + `slotDate` + `time_band`) matching your schedule grid.
2. **Tasks** — For each (job, slot) pair that should happen, **Create task** linking that job to that slot.
3. **Assignments** — Link volunteers to tasks.

## Estimates you had missing (what we used)

| Item | Minutes |
|------|--------:|
| Quick kitchen floor (alternate EOD) | 15 |
| Full kitchen mop (alternate EOD) | 28 |
| Quick restroom (each) | 8 |
| Full restroom (each) | 22 |
| Quick office | 12 |
| Full office | 25 |
| Vacuum hall / store / red couch | 18 / 15 / 15 |
| Foyer quick / full | 10 / 22 |
| Windows front / cafe | 18 / 15 |
| Quick vacuum main hall | 16 |
| Fridge quick / full | 15 / 35 |
| Main hall clear / full / reset | 20 / 50 / 18 |

Adjust in the JSON or in-app after import.
