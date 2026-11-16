# Singapore 4D Generator

A small website for Singapore 4D results, with four tabs:

- **Lucky numbers**: 5 random picks from numbers never drawn in the data, and 5 from the 20 most-drawn numbers.
- **Past results**: every draw's 23 winning numbers, browsable by date or year.
- **Check a number**: how often any number won, how many draws it missed, when it last came out, and its real chance next draw.
- **Analysis**: tests on 10 years of draws of whether "overdue" or "hot" numbers come out more often (they don't), betting backtests, and fairness checks.

> **Heads-up:** 4D draws are random. Every number has the same ~0.23% chance of winning a Big-bet prize in each draw, whatever its history. The site shows the history for interest; it can't predict the next draw.

## How it works

```
data/sg4d_results.csv     one row per draw: date, draw_no, first, second, third, starter1-10, consolation1-10
site/                     static website (index.html, app.js, stats.js, style.css), no build step
scripts/fetch_draws.py    appends new draws from 4dmoon.com to the CSV (stdlib only)
scripts/notify_telegram.py  sends the refresh result to Telegram
scripts/analyse.py        the original Python analysis (numpy/scipy/pandas)
tests/                    Node tests for the statistics, Python tests for the scripts
.github/workflows/        scheduled refresh + GitHub Pages deploy
```

All statistics are computed in the browser by `site/stats.js` from the CSV, so updating the CSV updates every tab.

## Run it locally

```bash
python3 -m http.server 8000      # from the repo root
# open http://localhost:8000/site/
```

Fetch new draws by hand:

```bash
python3 scripts/fetch_draws.py --dry-run   # show what would be added
python3 scripts/fetch_draws.py             # add them to data/sg4d_results.csv
```

Run the tests:

```bash
node --test tests/stats.test.js
python3 -m unittest discover tests
```

## Automatic refresh and Telegram

`.github/workflows/refresh.yml` runs every **Wednesday, Saturday and Sunday at 7:15pm Singapore time**. It fetches new draws, commits the CSV, redeploys the website and sends a Telegram message. You can also run it any time from the **Actions** tab ("Refresh draws" → "Run workflow").

To turn on Telegram messages, add two repository secrets (**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Your bot's token. In Telegram, message **@BotFather**, send `/mybots` (or `/newbot` for a new bot), choose the bot, then **API Token**. |
| `TELEGRAM_CHAT_ID` | Your chat id. Send `/start` to your bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id`. |

Optionally add a repository **variable** `SITE_URL` = `https://darryltzj.github.io/singapore-4d-generator/` so messages include the link. Without the secrets, the refresh still runs and just skips the message.

## Website hosting

Live at **https://darryltzj.github.io/singapore-4d-generator/**. `.github/workflows/pages.yml` redeploys it after every push and every data refresh (Pages source: GitHub Actions).

## Data notes

- Source: [4dmoon.com past results](https://www.4dmoon.com/past-results), Singapore 4D section. For official results see Singapore Pools.
- Starts at draw #4024 (2 Nov 2016). Draws #5350 (9 Jul 2025) and #5362–5367 (6–17 Aug 2025) are missing from the source. No draws were held April–June 2020 (COVID-19).
- The same number can win two prizes in one draw (each prize is drawn separately). This happens in ~2.5% of draws, as chance predicts.
- Big-bet payouts used: 1st $2,000, 2nd $1,000, 3rd $490, Starter $250, Consolation $60 per $1.

Not affiliated with Singapore Pools. Play responsibly.
