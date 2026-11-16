# CLAUDE.md

Singapore 4D results website + data pipeline. See README.md for the user-facing overview.

## Layout
- `data/sg4d_results.csv`: the single source of truth. Columns: `date,draw_no,first,second,third,starter1..10,consolation1..10`. Numbers are **4-digit strings with leading zeros**; never convert them to ints when writing. Rows sorted by `draw_no`.
- `site/`: static site, no build step, no framework. `stats.js` is pure (no DOM, no d3) and is shared with Node tests; `app.js` does the DOM and d3 charts (d3 v7 from jsDelivr CDN). The site loads `data/sg4d_results.csv`, falling back to `../data/` for local dev.
- `scripts/fetch_draws.py`: stdlib only. Checks every day after the last CSV date up to today (SGT); days without a draw have no "Singapore 4D<br>" section and are skipped. Validates date + 3 + 20 numbers.
- `scripts/notify_telegram.py`: reads the fetch summary JSON; needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` env vars.
- `scripts/analyse.py`: one-off Python analysis (needs numpy, scipy, pandas); its numbers are the reference values asserted in `tests/stats.test.js`.

## Commands
- Serve: `python3 -m http.server 8000` then open `/site/`
- Tests: `node --test tests/stats.test.js && python3 -m unittest discover tests`
- Refresh data: `python3 scripts/fetch_draws.py [--dry-run] [--until YYYY-MM-DD]`

## Rules
- Keep the honest framing: the site must never claim it can predict draws. Every number's chance per draw is 1 − (9999/10000)^23 ≈ 0.23% (Big bet, any prize). "Lucky numbers" are labelled as for fun.
- `tests/stats.test.js` pins results for draws ≤ #5562; if you change the statistics, keep those passing or explain why the reference changed.
- Never commit secrets. Telegram credentials live only in GitHub Actions secrets or a local `.env` (gitignored).
- Timezone: Singapore (UTC+8). Draws Wed/Sat/Sun 18:30; refresh workflow runs 11:15 UTC.
