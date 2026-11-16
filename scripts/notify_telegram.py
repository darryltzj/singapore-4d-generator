#!/usr/bin/env python3
"""Send the result of a refresh to Telegram.

Usage: python scripts/notify_telegram.py summary.json [--failed]

Environment:
  TELEGRAM_BOT_TOKEN  bot token from @BotFather (keep it secret)
  TELEGRAM_CHAT_ID    your chat id (send /start to the bot, then see README)
  SITE_URL            optional link to the website, added at the end
If the token or chat id is missing, the message is printed and nothing is sent.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path


def build_message(summary: dict | None, failed: bool = False, site_url: str = "") -> str:
    if failed or summary is None:
        return "Singapore 4D refresh failed. Check the GitHub Actions log."
    lines = []
    if summary.get("added"):
        lines.append("<b>Singapore 4D results</b>")
        for d in summary["added"]:
            date = dt.date.fromisoformat(d["date"])
            day = f"{date:%a} {date.day} {date:%b %Y}"
            lines.append(f"{day} (#{d['draw_no']})")
            lines.append(f"1st {d['first']} · 2nd {d['second']} · 3rd {d['third']}")
        lines.append(f"Website updated: {summary['total']:,} draws")
    else:
        lines.append("Singapore 4D: no new draws yet.")
    if summary.get("gaps"):
        lines.append("Missing draws: " + ", ".join(summary["gaps"]))
    if summary.get("errors") and not summary.get("added"):
        lines.append(f"{len(summary['errors'])} date(s) could not be read.")
    if site_url:
        lines.append(site_url)
    return "\n".join(html.escape(l) if not l.startswith("<b>") else l for l in lines)


def send(text: str) -> None:
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set; message not sent:\n" + text)
        return
    data = urllib.parse.urlencode({"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": "true"}).encode()
    with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data=data, timeout=30) as r:
        body = json.loads(r.read())
    if not body.get("ok"):
        raise SystemExit(f"Telegram error: {body}")
    print("sent")


def main() -> None:
    failed = "--failed" in sys.argv
    paths = [a for a in sys.argv[1:] if not a.startswith("--")]
    summary = None
    if paths and Path(paths[0]).exists():
        summary = json.loads(Path(paths[0]).read_text())
    send(build_message(summary, failed=failed, site_url=os.environ.get("SITE_URL", "")))


if __name__ == "__main__":
    main()
