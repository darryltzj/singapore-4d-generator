/*
 * Singapore 4D statistics. Pure functions, no DOM and no dependencies, so the same
 * code runs in the browser (window.S4Stats) and in Node tests (require/import).
 *
 * Input: rows parsed from data/sg4d_results.csv, each an object with
 *   date, draw_no, first, second, third, starter1..10, consolation1..10 (strings).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.S4Stats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLS = ['first', 'second', 'third'];
  for (let i = 1; i <= 10; i++) COLS.push('starter' + i);
  for (let i = 1; i <= 10; i++) COLS.push('consolation' + i);
  const TIER = COLS.map((c, i) => (i < 3 ? i : i < 13 ? 3 : 4));
  const TIER_NAME = ['1st', '2nd', '3rd', 'Starter', 'Consolation'];
  const PAY = [2000, 1000, 490, 250, 60]; // Big bet payout per $1 (Singapore Pools prize table)
  const WARM = 300;                       // draws used only to build history before backtests start
  const P_ANY = 1 - Math.pow(9999 / 10000, 23); // chance a given number wins any Big-bet prize in one draw

  const sum = (a, f) => { let s = 0; for (const x of a) s += f ? f(x) : x; return s; };
  const r2 = (x) => Math.round(x * 100) / 100;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const parseD = (s) => new Date(s + 'T00:00:00Z');
  const fmtD = (s) => { const d = parseD(s); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const fmtDW = (s) => `${DOW[parseD(s).getUTCDay()]} ${fmtD(s)}`;

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const hdr = lines[0].split(',');
    return lines.slice(1).map((l) => { const v = l.split(','); const o = {}; hdr.forEach((h, i) => { o[h] = v[i]; }); return o; });
  }

  /* ---------- chi-square helpers ---------- */
  function lnG(z) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnG(1 - z);
    z -= 1; let x = c[0]; for (let i = 1; i < 9; i++) x += c[i] / (z + i);
    const t = z + 7.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  function gammaQ(a, x) { // regularized upper incomplete gamma
    if (x <= 0) return 1;
    if (x < a + 1) {
      let ap = a, s = 1 / a, del = s;
      for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-15) break; }
      return 1 - s * Math.exp(-x + a * Math.log(x) - lnG(a));
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
    }
    return Math.exp(-x + a * Math.log(x) - lnG(a)) * h;
  }
  const chiP = (chi, df) => gammaQ(df / 2, chi / 2);
  const chiGof = (obs, exp) => obs.reduce((s, o, i) => s + (o - exp[i]) ** 2 / exp[i], 0);
  function contingency(tab) { // tab: [[hit, miss], ...]
    const rs = tab.map((r) => r[0] + r[1]), cs = [sum(tab, (r) => r[0]), sum(tab, (r) => r[1])], N = cs[0] + cs[1];
    let chi = 0; tab.forEach((r, i) => r.forEach((o, j) => { const e = rs[i] * cs[j] / N; chi += (o - e) ** 2 / e; }));
    return { chi, df: tab.length - 1 };
  }

  /* ---------- core ---------- */
  function prep(rawRows) {
    const rows = rawRows.slice().sort((a, b) => +a.draw_no - +b.draw_no);
    const D = rows.length, nums = new Int16Array(D * 23);
    rows.forEach((row, t) => COLS.forEach((c, j) => { nums[t * 23 + j] = parseInt(row[c], 10); }));
    return { rows, D, nums };
  }

  function perNumber(P) {
    const { D, nums } = P;
    const cnt = new Int32Array(10000), drawsWith = new Int32Array(10000), last = new Int32Array(10000).fill(-1), seen = new Int32Array(10000).fill(-1);
    const tier = Array.from({ length: 5 }, () => new Int32Array(10000));
    for (let t = 0; t < D; t++) for (let j = 0; j < 23; j++) {
      const n = nums[t * 23 + j]; cnt[n]++; tier[TIER[j]][n]++; last[n] = t;
      if (seen[n] !== t) { seen[n] = t; drawsWith[n]++; }
    }
    const out = [];
    for (let n = 0; n < 10000; n++) {
      const l = last[n];
      out.push({
        number: String(n).padStart(4, '0'), appearances: cnt[n], draws_without: D - drawsWith[n],
        draws_since: l < 0 ? null : D - 1 - l, last_date: l < 0 ? null : P.rows[l].date,
        hist_rate_pct: r3(cnt[n] / D * 100),
        first: tier[0][n], second: tier[1][n], third: tier[2][n], starter: tier[3][n], consolation: tier[4][n],
      });
    }
    return out;
  }

  // Walk through every draw in order; every check uses only results known before that draw.
  function walk(P) {
    const { D, nums } = P;
    const last = new Int32Array(10000).fill(-1), win100 = new Int16Array(10000);
    const hit = new Uint8Array(10000), pay = new Float64Array(10000);
    const bins = [[0, 50, 'under 50'], [50, 150, '50 to 149'], [150, 300, '150 to 299'], [300, 450, '300 to 449'], [450, 700, '450 to 699'], [700, 1000, '700 to 999'], [1000, 1e9, '1000 or more']];
    const gN = new Float64Array(bins.length + 1), gH = new Float64Array(bins.length + 1);
    const hN = new Float64Array(4), hH = new Float64Array(4);
    const strat = { overdue: [0, 0], recent: [0, 0] };
    const cmpWith = (better) => (a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : a - b);
    const pick10 = (better) => {
      const cmp = cmpWith(better), best = [];
      for (let n = 0; n < 10000; n++) {
        if (best.length < 10) { best.push(n); best.sort(cmp); } else if (better(n, best[9])) { best[9] = n; best.sort(cmp); }
      }
      return best;
    };
    for (let t = 0; t < D; t++) {
      const base = t * 23;
      for (let j = 0; j < 23; j++) { const n = nums[base + j]; hit[n] = 1; pay[n] += PAY[TIER[j]]; }
      if (t >= WARM) {
        for (let n = 0; n < 10000; n++) {
          const l = last[n]; let b;
          if (l < 0) b = bins.length; else { const g = t - l; b = 0; while (g >= bins[b][1]) b++; }
          gN[b]++; gH[b] += hit[n];
          const h = Math.min(win100[n], 3); hN[h]++; hH[h] += hit[n];
        }
        const od = pick10((a, b) => last[a] < last[b]);
        const rc = pick10((a, b) => last[a] > last[b]);
        [['overdue', od], ['recent', rc]].forEach(([k, p]) => { strat[k][0] += 10; p.forEach((n) => { strat[k][1] += pay[n]; }); });
      }
      for (let j = 0; j < 23; j++) { const n = nums[base + j]; hit[n] = 0; pay[n] = 0; last[n] = t; win100[n]++; }
      if (t >= 100) for (let j = 0; j < 23; j++) win100[nums[(t - 100) * 23 + j]]--;
    }
    const labels = bins.map((b) => b[2]).concat(['never seen yet']);
    return {
      gapbt: labels.map((bin, i) => ({ bin, checks: gN[i], hits: gH[i], rate_pct: r3(gH[i] / gN[i] * 100) })),
      hotbt: ['0 times', '1 time', '2 times', '3+ times'].map((group, i) => ({ group, checks: hN[i], hits: hH[i], rate_pct: r3(hH[i] / hN[i] * 100) })),
      strat,
    };
  }

  function strategies(strat) {
    // Long-run average, and a 95% luck range from 20,000 simulated runs of the same number of $1 bets
    // (prize counts per tier drawn as Poisson; payouts are too lopsided for a bell-curve estimate).
    const tiers = [[1, PAY[0]], [1, PAY[1]], [1, PAY[2]], [10, PAY[3]], [10, PAY[4]]];
    const ev = sum(tiers, (t) => t[0] * t[1]) / 10000, n = strat.overdue[0];
    let seed = 7;
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pois = (lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
    const sims = [];
    if (n > 0) for (let i = 0; i < 20000; i++) { let won = 0; tiers.forEach(([k, pay]) => { won += pois(n * k / 10000) * pay; }); sims.push(won / n); }
    sims.sort((a, b) => a - b);
    const lo = sims.length ? r2(sims[Math.floor(0.025 * sims.length)]) : null, hi = sims.length ? r2(sims[Math.floor(0.975 * sims.length)]) : null;
    const row = (strategy, s) => ({ strategy, staked: s[0], returned: s[1], per_dollar: s[0] ? r2(s[1] / s[0]) : null, luck_low: lo, luck_high: hi });
    return [
      row('10 longest-absent numbers', strat.overdue),
      row('10 most recently drawn numbers', strat.recent),
      { strategy: 'Any number (long-run average)', staked: null, returned: null, per_dollar: r2(ev), luck_low: lo, luck_high: hi },
    ];
  }

  function digits(P) {
    const c = Array.from({ length: 4 }, () => new Array(10).fill(0));
    for (let i = 0; i < P.nums.length; i++) { const n = P.nums[i]; c[0][Math.floor(n / 1000)]++; c[1][Math.floor(n / 100) % 10]++; c[2][Math.floor(n / 10) % 10]++; c[3][n % 10]++; }
    return [...Array(10).keys()].map((d) => ({ digit: String(d), pos1: c[0][d], pos2: c[1][d], pos3: c[2][d], pos4: c[3][d] }));
  }

  function countdist(P, pernum) {
    const p = 23 / 10000, n = P.D;
    const kmax = Math.max(...pernum.map((r) => r.appearances)), obs = new Array(kmax + 1).fill(0);
    pernum.forEach((r) => obs[r.appearances]++);
    let lp = n * Math.log(1 - p); const exp = [];
    for (let k = 0; k <= kmax; k++) { exp.push(10000 * Math.exp(lp)); lp += Math.log((n - k) / (k + 1)) + Math.log(p / (1 - p)); }
    return obs.map((o, k) => ({ times_won: String(k), numbers: o, expected: Math.round(exp[k] * 10) / 10 }));
  }

  function tests(dig, cd, gapbt, hotbt) {
    const out = [], add = (test, chi, df) => { const p = chiP(chi, df); out.push({ test, chi2: r2(chi), df, p: r3(p), verdict: p < 0.01 ? 'Possible bias' : 'Consistent with random' }); };
    ['pos1', 'pos2', 'pos3', 'pos4'].forEach((k, i) => { const o = dig.map((r) => r[k]); const e = sum(o) / 10; add(`Digit position ${i + 1}`, chiGof(o, o.map(() => e)), 9); });
    const cut = Math.min(9, cd.length - 1), o = cd.map((r) => r.numbers), e = cd.map((r) => r.expected);
    const oo = o.slice(0, cut).concat([sum(o.slice(cut))]), ee = e.slice(0, cut); ee.push(10000 - sum(ee));
    add('Wins per number', chiGof(oo, ee), cut);
    const g = contingency(gapbt.map((r) => [r.hits, r.checks - r.hits])); add('Gap groups vs next draw', g.chi, g.df);
    const h = contingency(hotbt.map((r) => [r.hits, r.checks - r.hits])); add('Hot groups vs next draw', h.chi, h.df);
    return out;
  }

  function odds() {
    const tiers = [['1st prize', 1, PAY[0]], ['2nd prize', 1, PAY[1]], ['3rd prize', 1, PAY[2]], ['Starter (any of 10)', 10, PAY[3]], ['Consolation (any of 10)', 10, PAY[4]]];
    const rows = tiers.map(([prize, k, pays]) => { const p = 1 - Math.pow(9999 / 10000, k); return { prize, numbers_drawn: k, chance: r3(p * 100) + '%', one_in: Math.round(1 / p), pays_big: pays }; });
    rows.push({ prize: 'Any prize (Big bet)', numbers_drawn: 23, chance: r3(P_ANY * 100) + '%', one_in: Math.round(1 / P_ANY), pays_big: null });
    return rows;
  }

  /** Everything the website shows, from the raw CSV rows. */
  function computeAll(rawRows) {
    const P = prep(rawRows);
    const pernum = perNumber(P);
    const w = walk(P);
    const dig = digits(P), cd = countdist(P, pernum);
    const tst = tests(dig, cd, w.gapbt, w.hotbt);
    const never = pernum.filter((r) => r.appearances === 0).length;
    const summary = {
      draws: P.D, first_date: P.rows[0].date, last_date: P.rows[P.D - 1].date,
      never_seen: never, never_expected: Math.round(10000 * Math.pow(1 - P_ANY, P.D)),
      chance_next_pct: r3(P_ANY * 100), expected_wins: Math.round(P.D * 23 / 10000 * 10) / 10,
      tests_run: tst.length, tests_flagged: tst.filter((t) => t.p < 0.01).length,
    };
    const byNum = (a, b) => (a.number < b.number ? -1 : 1);
    return {
      rows: P.rows, summary, pernum, odds: odds(), gapbt: w.gapbt, hotbt: w.hotbt, strategies: strategies(w.strat),
      digits: dig, countdist: cd, tests: tst,
      overdue: pernum.filter((r) => r.draws_since != null).sort((a, b) => b.draws_since - a.draws_since || byNum(a, b)).slice(0, 20),
      frequent: pernum.slice().sort((a, b) => b.appearances - a.appearances || byNum(a, b)).slice(0, 20),
      never: pernum.filter((r) => r.appearances === 0).map((r) => r.number),
    };
  }

  /** Every prize a number won: [{date, draw_no, column, tier}], newest first. */
  function appearancesOf(rows, number) {
    const hits = [];
    rows.forEach((d) => COLS.forEach((c, j) => { if (d[c] === number) hits.push({ date: d.date, draw_no: d.draw_no, column: c, tier: TIER_NAME[TIER[j]] }); }));
    return hits.reverse();
  }

  return { COLS, TIER, TIER_NAME, PAY, WARM, P_ANY, parseCSV, computeAll, appearancesOf, fmtD, fmtDW, chiP };
});
