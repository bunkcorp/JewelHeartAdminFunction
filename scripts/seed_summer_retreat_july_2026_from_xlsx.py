#!/usr/bin/env python3
"""Seed Postgres with the July 2026 volunteer retreat from the v2 Excel schedule.

Reads: docs/scheduling-reference/Retreat_Volunteer_Schedule_v2.xlsx (sheet "1. List by Day-Slot").

Idempotent: deletes the fixed retreat UUID first (CASCADE removes jobs/slots/tasks/assignments).

Requires:
  - openpyxl: pip install openpyxl
  - psql and DATABASE_URL (postgresql://...) for apply mode

Optional:
  - JEWELHEART_SEED_FIREBASE_UID — if set, inserts jewelheart_retreat_admins so that user can open the retreat.

Usage:
  python3 scripts/seed_summer_retreat_july_2026_from_xlsx.py --dry-run > /tmp/seed.sql
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/seed.sql

  python3 scripts/seed_summer_retreat_july_2026_from_xlsx.py --apply
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import uuid
from datetime import date
from pathlib import Path

NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")  # DNS namespace for stable UUIDs

SLOT_TO_BAND: dict[str, str] = {
    "Start day": "early",
    "Morning break": "early",
    "Lunch break": "lunchtime",
    "Afternoon break": "anytime",
    "Dinner break": "dinnertime",
    "End day": "anytime",
}

MONTHS = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}

TASK_PARENS = re.compile(r"\s*\(\d+v,\s*\d+m\)\s*$", re.IGNORECASE)
DAY_DATE = re.compile(r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\w{3})\s+(\d{1,2})")


def _u5(*parts: str) -> str:
    return str(uuid.uuid5(NS, ":".join(parts)))


def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "''")


def _parse_rows(ws) -> list[tuple[str, str, str, str, str, int, int]]:
    """Rows: (slot_date, slot_name, time_range, site, full_task, volunteers, minutes)."""
    rows = list(ws.iter_rows(values_only=True))
    cur_date: str | None = None
    cur_slot: str | None = None
    cur_time: str | None = None
    out: list[tuple[str, str, str, str, str, int, int]] = []
    for row in rows[4:]:
        day_cell, slot_cell, time_cell, site, task = row[0], row[1], row[2], row[3], row[4]
        if day_cell:
            s = str(day_cell).strip()
            if s.startswith("Day "):
                m = DAY_DATE.search(s)
                if m:
                    mon, d = m.group(2), int(m.group(3))
                    if mon in MONTHS:
                        cur_date = f"2026-{MONTHS[mon]:02d}-{d:02d}"
        if slot_cell:
            cur_slot = str(slot_cell).strip()
        if time_cell:
            cur_time = str(time_cell).strip()
        if not (site and task and cur_date and cur_slot):
            continue
        t = str(task).strip()
        m = re.search(r"\((\d+)v,\s*(\d+)m\)", t, re.IGNORECASE)
        if not m:
            continue
        vn, em = int(m.group(1)), int(m.group(2))
        out.append((cur_date, cur_slot, cur_time or "", str(site).strip(), t, vn, em))
    return out


def _job_title(site: str, full_task: str) -> str:
    base = TASK_PARENS.sub("", full_task).strip()
    return f"{site} — {base}"


def build_sql(
    *,
    retreat_id: str,
    parsed: list[tuple[str, str, str, str, str, int, int]],
) -> str:
    if not parsed:
        raise SystemExit("No schedule rows parsed from workbook.")

    # Unique jobs: (title, vn, em) -> id
    job_specs: dict[tuple[str, int, int], str] = {}
    for _, _, _, site, full_task, vn, em in parsed:
        title = _job_title(site, full_task)
        key = (title, vn, em)
        if key not in job_specs:
            job_specs[key] = _u5("JH:job", retreat_id, title, str(vn), str(em))

    # Unique slots: (slot_date, slot_name, time) -> id, label, band, dow
    slot_specs: dict[tuple[str, str, str], tuple[str, str, str, str]] = {}
    for slot_date, slot_name, time_range, _, _, _, _ in parsed:
        sk = (slot_date, slot_name, time_range)
        if sk in slot_specs:
            continue
        band = SLOT_TO_BAND.get(slot_name)
        if not band:
            raise SystemExit(f"Unknown slot name (add mapping): {slot_name!r}")
        sid = _u5("JH:slot", retreat_id, slot_date, slot_name, time_range)
        label = f"{slot_name} — {time_range}" if time_range else slot_name
        d = date.fromisoformat(slot_date)
        dow = d.strftime("%A")
        slot_specs[sk] = (sid, label, band, dow)

    start_date = min(r[0] for r in parsed)
    end_date = max(r[0] for r in parsed)
    retreat_name = "Summer retreat — Jul 20–25, 2026"
    tz = "America/Chicago"

    lines: list[str] = [
        "BEGIN;",
        f"DELETE FROM jewelheart_retreats WHERE id = '{retreat_id}'::uuid;",
        "INSERT INTO jewelheart_retreats (id, name, timezone, start_date, end_date, status, created_at, updated_at)",
        "VALUES (",
        f"  '{retreat_id}'::uuid,",
        f"  '{_esc(retreat_name)}',",
        f"  '{_esc(tz)}',",
        f"  '{start_date}'::date,",
        f"  '{end_date}'::date,",
        "  'published',",
        "  now(),",
        "  now()",
        ");",
        "",
    ]

    uid = (os.environ.get("JEWELHEART_SEED_FIREBASE_UID") or "").strip()
    if uid:
        lines.extend(
            [
                "INSERT INTO jewelheart_retreat_admins (retreat_id, firebase_uid, created_at)",
                f"VALUES ('{retreat_id}'::uuid, '{_esc(uid)}', now())",
                "ON CONFLICT (retreat_id, firebase_uid) DO NOTHING;",
                "",
            ]
        )

    lines.append("-- jobs")
    for (title, vn, em), jid in sorted(job_specs.items(), key=lambda x: x[0][0]):
        lines.append(
            "INSERT INTO jewelheart_jobs (id, retreat_id, title, volunteers_needed, estimated_minutes, created_at, updated_at) "
            f"VALUES ('{jid}'::uuid, '{retreat_id}'::uuid, '{_esc(title)}', {vn}, {em}, now(), now());"
        )
    lines.append("")
    lines.append("-- slots")
    for sk in sorted(slot_specs.keys(), key=lambda x: (x[0], x[1], x[2])):
        sid, label, band, dow = slot_specs[sk]
        slot_date, _, _ = sk
        lines.append(
            "INSERT INTO jewelheart_slots (id, retreat_id, label, slot_date, day_of_week, activity_context, time_band, created_at, updated_at) "
            f"VALUES ('{sid}'::uuid, '{retreat_id}'::uuid, '{_esc(label)}', '{slot_date}'::date, '{dow}', NULL, '{band}'::jewelheart_time_band, now(), now());"
        )
    lines.append("")
    lines.append("-- tasks (job × slot)")
    seen_task: set[tuple[str, str]] = set()
    for slot_date, slot_name, time_range, site, full_task, vn, em in parsed:
        title = _job_title(site, full_task)
        jid = job_specs[(title, vn, em)]
        sk = (slot_date, slot_name, time_range)
        sid = slot_specs[sk][0]
        pair = (jid, sid)
        if pair in seen_task:
            continue
        seen_task.add(pair)
        tid = _u5("JH:task", retreat_id, jid, sid)
        lines.append(
            "INSERT INTO jewelheart_tasks (id, retreat_id, job_id, slot_id, notes, created_at, updated_at) "
            f"VALUES ('{tid}'::uuid, '{retreat_id}'::uuid, '{jid}'::uuid, '{sid}'::uuid, NULL, now(), now());"
        )
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--xlsx",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "docs/scheduling-reference/Retreat_Volunteer_Schedule_v2.xlsx",
    )
    ap.add_argument("--dry-run", action="store_true", help="Print SQL to stdout (default if no --apply).")
    ap.add_argument("--apply", action="store_true", help="Pipe SQL to psql using DATABASE_URL.")
    args = ap.parse_args()

    try:
        import openpyxl
    except ImportError:
        print("Install openpyxl: pip install openpyxl", file=sys.stderr)
        raise SystemExit(1)

    if not args.xlsx.is_file():
        raise SystemExit(f"Missing workbook: {args.xlsx}")

    retreat_id = _u5("JH:retreat", "summer-2026-07-20-v2")

    wb = openpyxl.load_workbook(args.xlsx, read_only=True, data_only=True)
    try:
        ws = wb["1. List by Day-Slot"]
        parsed = _parse_rows(ws)
    finally:
        wb.close()

    sql = build_sql(retreat_id=retreat_id, parsed=parsed)

    if args.apply:
        db = (os.environ.get("DATABASE_URL") or "").strip()
        if not db:
            raise SystemExit("DATABASE_URL must be set for --apply")
        r = subprocess.run(
            ["psql", db, "-v", "ON_ERROR_STOP=1", "-f", "-"],
            input=sql.encode(),
            capture_output=True,
        )
        if r.returncode != 0:
            sys.stderr.buffer.write(r.stderr or b"")
            sys.stdout.buffer.write(r.stdout or b"")
            raise SystemExit(r.returncode)
        sys.stderr.write(
            f"OK: seeded retreat id {retreat_id} ({len(parsed)} parsed rows → tasks deduped in SQL).\n"
        )
        return

    sys.stdout.write(sql)


if __name__ == "__main__":
    main()
