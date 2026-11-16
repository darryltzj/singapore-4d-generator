"""Run: python -m unittest discover tests"""
import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_draws  # noqa: E402
import notify_telegram  # noqa: E402

FIXTURE = (ROOT / "tests" / "fixtures" / "2026-11-15_singapore.html").read_text()


class ParseTests(unittest.TestCase):
    def test_parses_all_23_numbers(self):
        d = fetch_draws.parse_singapore(FIXTURE, dt.date(2026, 11, 15))
        self.assertEqual(d["draw_no"], 5562)
        self.assertEqual((d["first"], d["second"], d["third"]), ("7596", "5126", "8424"))
        self.assertEqual(d["starter1"], "0696")
        self.assertEqual(d["starter10"], "8865")
        self.assertEqual(d["consolation1"], "0595")
        self.assertEqual(d["consolation10"], "6966")

    def test_page_without_singapore_section(self):
        self.assertIsNone(fetch_draws.parse_singapore("<html>Magnum only</html>"))

    def test_wrong_date_rejected(self):
        with self.assertRaises(fetch_draws.ParseError):
            fetch_draws.parse_singapore(FIXTURE, dt.date(2026, 11, 14))

    def test_missing_numbers_rejected(self):
        broken = FIXTURE.replace('class="rbn">6966', 'class="rbn">')
        with self.assertRaises(fetch_draws.ParseError):
            fetch_draws.parse_singapore(broken, dt.date(2026, 11, 15))


class MainTests(unittest.TestCase):
    def test_appends_new_draw_and_skips_known(self):
        rows = fetch_draws.read_csv(fetch_draws.DEFAULT_CSV)
        base = [r for r in rows if int(r["draw_no"]) <= 5561]
        with tempfile.TemporaryDirectory() as tmp:
            csv_path, summ = Path(tmp) / "d.csv", Path(tmp) / "s.json"
            fetch_draws.write_csv(csv_path, base)
            pages = {dt.date(2026, 11, 15): FIXTURE}
            with mock.patch.object(fetch_draws, "fetch", lambda day: pages.get(day, "<html></html>")), \
                 mock.patch.object(fetch_draws.time, "sleep", lambda s: None):
                rc = fetch_draws.main(["--csv", str(csv_path), "--until", "2026-11-16", "--summary", str(summ)])
            self.assertEqual(rc, 0)
            out = fetch_draws.read_csv(csv_path)
            self.assertEqual(len(out), len(base) + 1)
            self.assertEqual(out[-1]["first"], "7596")
            s = json.loads(summ.read_text())
            self.assertEqual([a["draw_no"] for a in s["added"]], [5562])
            self.assertEqual(s["gaps"], [])


class NotifyTests(unittest.TestCase):
    def test_message_with_new_draw(self):
        msg = notify_telegram.build_message({"added": [{"date": "2026-11-15", "draw_no": 5562, "first": "7596", "second": "5126", "third": "8424"}],
                                             "total": 1532, "gaps": [], "errors": []}, site_url="https://example.com")
        self.assertIn("<b>Singapore 4D results</b>", msg)
        self.assertIn("Sun 15 Nov 2026 (#5562)", msg)
        self.assertIn("1st 7596 · 2nd 5126 · 3rd 8424", msg)
        self.assertIn("1,532 draws", msg)

    def test_message_no_new(self):
        self.assertIn("no new draws", notify_telegram.build_message({"added": [], "total": 1532, "gaps": [], "errors": []}))

    def test_failed(self):
        self.assertIn("failed", notify_telegram.build_message(None, failed=True))


if __name__ == "__main__":
    unittest.main()
