#!/usr/bin/env python3
"""Emit RFC 5545 text/calendar (ICS) from a small JSON fixture of volunteer assignments.

This mirrors the TIME_BAND → wall-clock assumptions documented in openapi/jewelheart.yaml
(Calendar feed) and integrations/private-server/jewelheart-calendar-feed-notes.fragment.js .

No third-party deps (stdlib only). Server-side private-server SHOULD share the same mapping.

Usage:

  python3 scripts/generate_volunteer_calendar_ics.py \\
    --fixture scripts/fixtures/volunteer_calendar_assignments.sample.json \\
    --out my-shifts.ics

For live API pulls, authenticate to your deployment and hydrate the fixture shape —
there is currently no aggregated \"my assignments\" JSON endpoint in the contract;
the canonical feed remains GET /jewelheart/calendar-feed/{feedToken}.

"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


# Mirrors server contract default mapping (adjust in one place for experiments).
TIME_BAND_WINDOWS: dict[str, tuple[tuple[int, int], tuple[int, int]] | None] = {
    "early": ((7, 0), (9, 0)),
    "lunchtime": ((11, 30), (13, 30)),
    "dinnertime": ((17, 0), (19, 0)),
    "anytime": ((12, 0), (13, 0)),
    "allday": None,
}


def escape_ics_text(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace(";", "\\;")
        .replace(",", "\\,")
    )


def fold_ics_lines(body: str) -> str:
    """Ensure CRLF line endings; keep generator lines short (see DESCRIPTION cap in build_vevent)."""

    return body.replace("\r\n", "\n").replace("\n", "\r\n")


DTSTAMP = re.compile(r"^\d{8}T\d{6}Z$")


def format_utc_z(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(ZoneInfo("UTC")).strftime("%Y%m%dT%H%M%SZ")


def format_date_only(d: datetime) -> str:
    return d.strftime("%Y%m%d")


@dataclass(frozen=True)
class AssignmentRow:
    assignment_id: str
    retreat_name: str
    job_title: str
    slot_label: str
    slot_date: str
    time_band: str
    estimated_minutes: int | None = None


def parse_fixture(data: dict) -> tuple[str, list[AssignmentRow]]:
    tz = data.get("retreatTimezone") or "UTC"
    rows: list[AssignmentRow] = []
    for item in data.get("assignments", []):
        em = item.get("estimatedMinutes")
        em_int = int(em) if em is not None and str(em).strip().isdigit() else None
        rows.append(
            AssignmentRow(
                assignment_id=item["assignmentId"],
                retreat_name=item.get("retreatName") or "",
                job_title=item.get("jobTitle") or "Volunteer shift",
                slot_label=item.get("slotLabel") or "",
                slot_date=item["slotDate"],
                time_band=item["timeBand"],
                estimated_minutes=em_int,
            )
        )
    return tz, rows


def _effective_duration_minutes(row: AssignmentRow) -> int:
    if row.estimated_minutes is not None and row.estimated_minutes > 0:
        return min(row.estimated_minutes, 24 * 60)
    return 30


def build_vevent(
    row: AssignmentRow,
    retreat_tz: str,
    dtstamp: str,
) -> str:
    uid = f"assignment-{row.assignment_id}@jewelheart"
    summary = escape_ics_text(row.job_title)
    dur_min = _effective_duration_minutes(row)
    desc_bits = [
        row.retreat_name,
        row.slot_label,
        f"timeBand={row.time_band}",
        f"durationMin={dur_min}",
        f"assignmentId={row.assignment_id}",
    ]
    raw_desc = "\n".join(bit for bit in desc_bits if bit)
    if len(raw_desc) > 180:
        raw_desc = raw_desc[:177].rstrip() + "…"
    description = escape_ics_text(raw_desc)

    zi = ZoneInfo(retreat_tz)
    y, m, d = (int(row.slot_date[0:4]), int(row.slot_date[5:7]), int(row.slot_date[8:10]))
    day_start_local = datetime(y, m, d, tzinfo=zi)

    lines: list[str] = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{dtstamp}",
        "SEQUENCE:1",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
    ]

    windows = TIME_BAND_WINDOWS.get(row.time_band)
    if windows is None and row.time_band != "allday":
        raise ValueError(f"Unknown time_band: {row.time_band}")
    par = f";TZID={retreat_tz}"
    if row.time_band == "allday" or windows is None:
        dtstart = day_start_local.replace(hour=12, minute=0, second=0, microsecond=0)
        dtend = dtstart + timedelta(minutes=dur_min)
        lines.append(f"DTSTART{par}:{dtstart.strftime('%Y%m%dT%H%M%S')}")
        lines.append(f"DTEND{par}:{dtend.strftime('%Y%m%dT%H%M%S')}")
    else:
        (sh, sm), _ = windows
        dtstart = day_start_local.replace(hour=sh, minute=sm, second=0, microsecond=0)
        dtend = dtstart + timedelta(minutes=dur_min)
        lines.append(f"DTSTART{par}:{dtstart.strftime('%Y%m%dT%H%M%S')}")
        lines.append(f"DTEND{par}:{dtend.strftime('%Y%m%dT%H%M%S')}")
    lines.append("BEGIN:VALARM")
    lines.append("ACTION:DISPLAY")
    lines.append("DESCRIPTION:Reminder (24h before)")
    lines.append("TRIGGER:-P1D")
    lines.append("END:VALARM")
    lines.append("BEGIN:VALARM")
    lines.append("ACTION:DISPLAY")
    lines.append("DESCRIPTION:Reminder (3h before)")
    lines.append("TRIGGER:-PT3H")
    lines.append("END:VALARM")

    lines.append("END:VEVENT")
    return "\r\n".join(lines) + "\r\n"


def _derive_calendar_title(rows: list[AssignmentRow]) -> str:
    if not rows:
        return "JewelHeart volunteer shifts"
    names = sorted({r.retreat_name.strip() for r in rows if r.retreat_name and r.retreat_name.strip()})
    if len(names) == 1:
        return f"{names[0]} - Volunteer shifts"
    return "JewelHeart volunteer shifts"


def build_calendar(retreat_tz: str, rows: list[AssignmentRow], dtstamp: str) -> str:
    events = "".join(build_vevent(r, retreat_tz, dtstamp) for r in rows)
    cal_title = escape_ics_text(_derive_calendar_title(rows))
    header = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//JewelHeart//Volunteer shifts//EN\r\n"
        "CALSCALE:GREGORIAN\r\n"
        f"X-WR-CALNAME:{cal_title}\r\n"
        f"NAME:{cal_title}\r\n"
        "METHOD:PUBLISH\r\n"
    )
    footer = "END:VCALENDAR\r\n"
    return fold_ics_lines(header + events + footer)


def main() -> None:
    p = argparse.ArgumentParser(description="Generate ICS from volunteer_calendar_assignments-shaped JSON fixture.")
    p.add_argument("--fixture", type=Path, required=True)
    p.add_argument("--out", type=Path, help="Defaults to stdout when omitted")
    p.add_argument("--dtstamp", help="UTC stamp YYYYMMDDTHHMMSSZ (testing determinism)")
    args = p.parse_args()

    data = json.loads(args.fixture.read_text(encoding="utf-8"))
    retreat_tz, rows = parse_fixture(data)
    ZoneInfo(retreat_tz)  # validate IANA tz early

    dtstamp = args.dtstamp
    if not dtstamp:
        dtstamp = format_utc_z(datetime.now(tz=ZoneInfo("UTC")))
    if not DTSTAMP.match(dtstamp):
        raise SystemExit("--dtstamp must look like YYYYMMDDTHHMMSSZ")

    raw = build_calendar(retreat_tz, rows, dtstamp)
    if args.out:
        args.out.write_text(raw, newline="\n")
    else:
        print(raw, end="")


if __name__ == "__main__":
    main()
