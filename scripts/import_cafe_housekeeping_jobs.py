#!/usr/bin/env python3
"""POST jobs from scripts/data/cafe-housekeeping-jobs.json to JewelHeart API.

Single retreat:
  export RETREAT_ID="<uuid>"
  export TOKEN="<firebase-id-token>"
  python3 scripts/import_cafe_housekeeping_jobs.py

All retreats you can access:
  export TOKEN="<firebase-id-token>"
  python3 scripts/import_cafe_housekeeping_jobs.py --all-retreats

Optional: JEWELHEART_API (default https://api.karmadots.org/jewelheart)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def api_json(method: str, url: str, token: str, body: dict | None = None) -> dict | list | None:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode()
    return json.loads(raw) if raw.strip() else None


def list_all_retreats(base: str, token: str) -> list[dict]:
    out: list[dict] = []
    cursor = ""
    while True:
        q = f"{base}/retreats?limit=100"
        if cursor:
            q += f"&cursor={urllib.parse.quote(str(cursor), safe='')}"
        data = api_json("GET", q, token)
        if not isinstance(data, dict):
            break
        items = data.get("items") or []
        out.extend(items)
        cursor = (data.get("nextCursor") or "").strip()
        if not cursor:
            break
    return out


def import_jobs_for_retreat(base: str, token: str, retreat_id: str, jobs: list[dict]) -> tuple[int, str | None]:
    url = f"{base}/retreats/{retreat_id}/jobs"
    ok = 0
    for i, body in enumerate(jobs, 1):
        b = dict(body)
        if "subjobs" in b and not b["subjobs"]:
            del b["subjobs"]
        try:
            out = api_json("POST", url, token, b)
            assert isinstance(out, dict)
            jid = out.get("id", "?")
            print(f"  {i}/{len(jobs)} OK {jid} — {(b.get('title') or '')[:56]}…")
            ok += 1
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            return ok, f"HTTP {e.code} on job {i} {b.get('title', '')!r}: {err}"
    return ok, None


def main() -> int:
    parser = argparse.ArgumentParser(description="Import cafe/housekeeping jobs into JewelHeart.")
    parser.add_argument(
        "--all-retreats",
        action="store_true",
        help="Create jobs on every retreat returned by GET /retreats (for your token).",
    )
    args = parser.parse_args()

    token = os.environ.get("TOKEN", "").strip()
    base = os.environ.get("JEWELHEART_API", "https://api.karmadots.org/jewelheart").rstrip("/")
    retreat_id = os.environ.get("RETREAT_ID", "").strip()

    if not token:
        print("Set TOKEN to a Firebase ID token (same project as api.karmadots.org).", file=sys.stderr)
        return 1

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, "scripts", "data", "cafe-housekeeping-jobs.json")
    with open(path, encoding="utf-8") as f:
        jobs = json.load(f)

    if args.all_retreats:
        print("Listing retreats…")
        try:
            retreats = list_all_retreats(base, token)
        except urllib.error.HTTPError as e:
            print(f"GET /retreats failed: {e.code} {e.read().decode(errors='replace')}", file=sys.stderr)
            return 2
        if not retreats:
            print("No retreats returned (empty list or no access).")
            return 0
        print(f"Found {len(retreats)} retreat(s).\n")
        total = 0
        for r in retreats:
            rid = r.get("id")
            name = r.get("name") or rid
            print(f"=== {name} ({rid}) ===")
            n, err = import_jobs_for_retreat(base, token, str(rid), jobs)
            total += n
            if err:
                print(f"ABORT: {err}", file=sys.stderr)
                return 3
            print(f"  → {n} job(s) created.\n")
        print(f"Done: {total} job row(s) across {len(retreats)} retreat(s).")
        return 0

    if not retreat_id:
        print("Set RETREAT_ID or pass --all-retreats.", file=sys.stderr)
        return 1

    print(f"Retreat {retreat_id}")
    n, err = import_jobs_for_retreat(base, token, retreat_id, jobs)
    if err:
        print(err, file=sys.stderr)
        return 3
    print(f"Done: {n} job(s) created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
