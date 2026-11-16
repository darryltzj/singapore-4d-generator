// Run: node --test tests/
// Checks the website's statistics against values verified independently in Python (scripts/analyse.py)
// for the first 1,532 draws (2 Nov 2016 – 15 Nov 2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../site/stats.js');

const all = S.parseCSV(fs.readFileSync(path.join(__dirname, '..', 'data', 'sg4d_results.csv'), 'utf8'));
const base = all.filter((r) => +r.draw_no <= 5562);
const R = S.computeAll(base);

test('summary', () => {
  assert.equal(R.summary.draws, 1532);
  assert.equal(R.summary.never_seen, 305);
  assert.equal(R.summary.chance_next_pct, 0.23);
});

test('every draw has 23 four-digit numbers', () => {
  for (const r of all) for (const c of S.COLS) assert.match(r[c], /^\d{4}$/, `${r.date} ${c}`);
});

test('chi-square tests match scipy', () => {
  const p = Object.fromEntries(R.tests.map((t) => [t.test, t.p]));
  assert.equal(p['Digit position 1'], 0.466);
  assert.equal(p['Digit position 2'], 0.7);
  assert.equal(p['Digit position 3'], 0.056);
  assert.equal(p['Digit position 4'], 0.147);
  assert.equal(p['Wins per number'], 0.742);
  assert.equal(p['Gap groups vs next draw'], 0.777);
});

test('overdue backtest matches python', () => {
  const g = Object.fromEntries(R.gapbt.map((r) => [r.bin, r]));
  assert.equal(g['1000 or more'].hits, 562);
  assert.equal(g['1000 or more'].checks, 232491);
  assert.equal(g['under 50'].hits, 3039);
});

test('per-number history', () => {
  const n = R.pernum[5126];
  assert.equal(n.appearances, 13);
  assert.equal(n.draws_since, 0);
  assert.equal(R.frequent[0].number, '5126');
  assert.equal(S.appearancesOf(R.rows, '5126').length, 13);
});
