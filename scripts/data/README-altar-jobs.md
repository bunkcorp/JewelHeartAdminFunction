# Altar & offering jobs — JewelHeart seed

Same **`JobCreate`** shape as `cafe-housekeeping-jobs.json`. **When** each happens is still via **slots** + **tasks** (job × slot), not encoded in these rows.

## Import

From repo root (same script as cafe pack; different file):

```bash
export TOKEN="<firebase-id-token>"
python3 scripts/import_cafe_housekeeping_jobs.py --all-retreats --jobs-file scripts/data/altar-jobs.json
```

Or one retreat:

```bash
export RETREAT_ID="<uuid>"
export TOKEN="<token>"
python3 scripts/import_cafe_housekeeping_jobs.py --jobs-file scripts/data/altar-jobs.json
```

Re-runs **append** duplicate titles unless you delete jobs in the admin UI first.

## What’s in the list

Covers your bullets plus common adjacent duties: set up / break down / clean altar, water bowls empty & fill, flower buy / cull / arrange, lamps, offerings, straightening, floor around altar. Adjust minutes in **`altar-jobs.json`** after import if your space is larger or smaller.
