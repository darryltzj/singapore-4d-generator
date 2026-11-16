#!/usr/bin/env python3
"""Append new Singapore 4D draws to data/sg4d_results.csv.

Checks every day from the day after the last draw in the CSV up to today
(Asia/Singapore), so regular Wed/Sat/Sun draws and any special draws are both
picked up. Results come from https://www.4dmoon.com/past-results/YYYY-MM-DD.

Standard library only. Usage:
    python scripts/fetch_draws.py [--csv data/sg4d_results.csv] [--until YYYY-MM-DD]
                                  [--summary summary.json] [--dry-run]

Writes a JSON summary (added draws, total, gaps, errors) for notify_telegram.py.
Exit code 0 even when nothing is new; 1 only when fetching failed outright.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = ROOT / "data" / "sg4d_results.csv"
URL = "https://www.4dmoon.com/past-results/{date}"
SGT = dt.timezone(dt.timedelta(hours=8))
COLS = ["first", "second", "third"] + [f"starter{i}" for i in range(1, 11)] + [f"consolation{i}" for i in range(1, 11)]
HEADER = ["date", "draw_no"] + COLS
UA = "Mozilla/5.0 (compatible; sg4d-generator/1.0; +https://github.com/)"


class ParseError(ValueError):
    pass


def parse_singapore(html: str, expected_date: dt.date | None = None) -> dict | None:
    """Return the Singapore 4D draw on a 4dmoon past-results page, or None if the page has none."""
    i = html.find("Singapore 4D<br>")
    if i < 0:
        return None
    seg = html[i:i + 6000]
    m = re.search(r"\((\w{3})\)\s+(\d{1,2}-\w{3}-\d{4})\s+#(\d+)", seg)
    if not m:
        raise ParseError("draw header not found")
    date = dt.datetime.strptime(m.group(2), "%d-%b-%Y").date()
    if expected_date and date != expected_date:
        raise ParseError(f"page shows {date}, expected {expected_date}")
    top = re.findall(r'class="rtn">\s*(\d{4})\s*<', seg)
    rest = re.findall(r'class="rbn">\s*(\d{4})\s*<', seg)
    if len(top) < 3 or len(rest) < 20:
        raise ParseError(f"expected 3 + 20 numbers, found {len(top)} + {len(rest)}")
    nums = top[:3] + rest[:20]
    return {"date": date.isoformat(), "draw_no": int(m.group(3)), **dict(zip(COLS, nums))}


def fetch(date: dt.date, retries: int = 3) -> str:
    req = urllib.request.Request(URL.format(date=date.isoformat()), headers={"User-Agent": UA})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows: list[dict]) -> None:
    rows = sorted(rows, key=lambda r: int(r["draw_no"]))
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r[k] for k in HEADER})


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--until", type=dt.date.fromisoformat, default=None, help="last date to check (default: today in Singapore)")
    ap.add_argument("--summary", type=Path, default=None, help="write a JSON summary here")
    ap.add_argument("--dry-run", action="store_true", help="fetch and report, but don't write the CSV")
    args = ap.parse_args(argv)

    rows = read_csv(args.csv)
    known = {int(r["draw_no"]) for r in rows}
    last = max(rows, key=lambda r: int(r["draw_no"]))
    start = dt.date.fromisoformat(last["date"]) + dt.timedelta(days=1)
    until = args.until or dt.datetime.now(SGT).date()

    added, errors = [], []
    day = start
    while day <= until:
        try:
            draw = parse_singapore(fetch(day), expected_date=day)
        except Exception as e:  # network or parse problem: report, keep going
            errors.append(f"{day}: {e}")
            draw = None
        if draw and draw["draw_no"] not in known:
            added.append(draw)
            known.add(draw["draw_no"])
            print(f"added {draw['date']} #{draw['draw_no']}: {draw['first']} {draw['second']} {draw['third']}")
        day += dt.timedelta(days=1)
        time.sleep(0.5)

    all_rows = rows + [{k: str(v) for k, v in d.items()} for d in added]
    nos = sorted(int(r["draw_no"]) for r in all_rows)
    new_nos = {d["draw_no"] for d in added}
    gaps = [f"#{a + 1}" + (f"–#{b - 1}" if b - a > 2 else "") for a, b in zip(nos, nos[1:])
            if b - a > 1 and (a in new_nos or b in new_nos)]

    if added and not args.dry_run:
        write_csv(args.csv, all_rows)

    summary = {
        "checked": [start.isoformat(), until.isoformat()],
        "added": [{k: d[k] for k in ("date", "draw_no", "first", "second", "third")} for d in added],
        "total": len(all_rows),
        "gaps": gaps,
        "errors": errors,
    }
    if args.summary:
        args.summary.write_text(json.dumps(summary, indent=1))
    print(json.dumps(summary, indent=1))
    days = (until - start).days + 1
    return 1 if days > 0 and len(errors) == days else 0


if __name__ == "__main__":
    sys.exit(main())
