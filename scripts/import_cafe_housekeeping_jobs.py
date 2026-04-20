#!/usr/bin/env python3
"""POST jobs from scripts/data/cafe-housekeeping-jobs.json to JewelHeart API.

  export RETREAT_ID="<uuid>"
  export TOKEN="<firebase-id-token>"
  export JEWELHEART_API=https://api.karmadots.org/jewelheart   # optional

  python3 scripts/import_cafe_housekeeping_jobs.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    retreat_id = os.environ.get("RETREAT_ID", "").strip()
    token = os.environ.get("TOKEN", "").strip()
    base = os.environ.get("JEWELHEART_API", "https://api.karmadots.org/jewelheart").rstrip("/")

    if not retreat_id or not token:
        print("Set RETREAT_ID and TOKEN (Firebase ID token).", file=sys.stderr)
        return 1

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, "scripts", "data", "cafe-housekeeping-jobs.json")
    with open(path, encoding="utf-8") as f:
        jobs = json.load(f)

    url = f"{base}/retreats/{retreat_id}/jobs"
    ok = 0
    for i, body in enumerate(jobs, 1):
        # Drop empty subjobs
        if "subjobs" in body and not body["subjobs"]:
            del body["subjobs"]
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                out = json.loads(resp.read().decode())
            jid = out.get("id", "?")
            print(f"{i}/{len(jobs)} OK {jid} — {body.get('title', '')[:60]}…")
            ok += 1
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            print(f"{i}/{len(jobs)} FAIL {e.code} {body.get('title', '')!r}\n{err}", file=sys.stderr)
            return 2

    print(f"Done: {ok} job(s) created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
