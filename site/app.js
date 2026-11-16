/* Singapore 4D Generator: page logic. Statistics live in stats.js. */
(async function () {
  const S = window.S4Stats;
  const $ = (id) => document.getElementById(id);
  const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };

  /* ---------- tabs ---------- */
  const TABS = ['lucky', 'results', 'check', 'analysis'];
  const drawn = new Set();
  function openTab(name) {
    document.querySelectorAll('.sec').forEach((s) => { s.hidden = s.id !== name; });
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
    if (R && name === 'analysis' && !drawn.has('analysis')) { drawAnalysis(); drawn.add('analysis'); }
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));

  /* ---------- load data ---------- */
  let R = null;
  async function loadCSV() {
    for (const url of ['data/sg4d_results.csv', '../data/sg4d_results.csv']) {
      try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) return await r.text(); } catch (e) { /* try next */ }
    }
    throw new Error('Could not load sg4d_results.csv');
  }
  try {
    R = S.computeAll(S.parseCSV(await loadCSV()));
  } catch (e) {
    setText('status', 'Could not load the draw data. ' + e.message);
    return;
  }
  $('status').hidden = true;

  const sum = R.summary;
  setText('sum-draws', fmt(sum.draws));
  setText('sum-first', S.fmtD(sum.first_date));
  setText('sum-last', S.fmtD(sum.last_date));
  document.querySelectorAll('.chance').forEach((e) => { e.textContent = sum.chance_next_pct; });

  /* ---------- lucky numbers ---------- */
  setText('lucky-never-n', fmt(sum.never_seen));
  setText('lucky-since', S.fmtD(sum.first_date));
  const pick = (pool, k) => { const a = pool.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k).sort(); };
  const luckyCards = (box, nums) => box.replaceChildren(...nums.map((num) => {
    const r = R.pernum[parseInt(num, 10)];
    return el('div', { className: 'tile' },
      el('span', { className: 'big', textContent: num }),
      el('div', { className: 'tile-l', textContent: `Won ${r.appearances} ${r.appearances === 1 ? 'time' : 'times'}` }),
      el('div', { className: 'tile-l', textContent: r.last_date ? `Last: ${S.fmtD(r.last_date)}` : 'Not drawn in 10 years' }));
  }));
  function generate() {
    luckyCards($('lucky-never'), pick(R.never, 5));
    luckyCards($('lucky-top'), pick(R.frequent.map((r) => r.number), 5));
  }
  $('lucky-gen').addEventListener('click', generate);
  generate();

  /* ---------- past results ---------- */
  const rows = R.rows;
  let cur = rows.length - 1;
  const pickSel = $('draw-pick');
  pickSel.replaceChildren(...rows.map((r, i) => new Option(`${S.fmtDW(r.date)} · #${r.draw_no}`, String(i))).reverse());
  function showDraw(i) {
    cur = Math.max(0, Math.min(rows.length - 1, i));
    const r = rows[cur];
    pickSel.value = String(cur);
    $('draw-prev').disabled = cur === 0;
    $('draw-next').disabled = cur === rows.length - 1;
    const top = el('div', { className: 'top3' }, ...[['first', '1st prize'], ['second', '2nd prize'], ['third', '3rd prize']].map(([c, l]) =>
      el('div', {}, el('div', { className: 'tile-l', textContent: l }), el('span', { className: 'big', textContent: r[c] }))));
    const grid = (label, prefix) => [el('div', { className: 'tile-l', textContent: label }),
      el('div', { className: 'grid5' }, ...[...Array(10).keys()].map((i) => el('span', { textContent: r[prefix + (i + 1)] })))];
    $('draw-view').replaceChildren(el('p', { className: 'note', textContent: `${S.fmtDW(r.date)} · Draw #${r.draw_no}` }), top,
      ...grid('Starter prizes', 'starter'), ...grid('Consolation prizes', 'consolation'));
  }
  pickSel.addEventListener('change', () => showDraw(+pickSel.value));
  $('draw-prev').addEventListener('click', () => showDraw(cur - 1));
  $('draw-next').addEventListener('click', () => showDraw(cur + 1));
  showDraw(cur);

  const years = [...new Set(rows.map((r) => r.date.slice(0, 4)))].sort().reverse();
  const yearSel = $('year-pick');
  yearSel.replaceChildren(...years.map((y) => new Option(y, y)));
  function showYear(y) {
    $('year-table').replaceChildren(...rows.map((r, i) => [r, i]).filter(([r]) => r.date.startsWith(y)).reverse().map(([r, i]) => {
      const tr = el('tr', { className: 'click' }, ...[S.fmtD(r.date), r.draw_no, r.first, r.second, r.third].map((v) => el('td', { textContent: v })));
      tr.addEventListener('click', () => { showDraw(i); $('draw-viewer').scrollIntoView({ behavior: 'smooth' }); });
      return tr;
    }));
  }
  yearSel.addEventListener('change', () => showYear(yearSel.value));
  showYear(years[0]);

  /* ---------- check a number ---------- */
  setText('lk-draws', fmt(sum.draws));
  setText('lk-avg', sum.expected_wins);
  const inp = $('lk-input');
  function showNumber() {
    const v = inp.value;
    if (!/^\d{1,4}$/.test(v)) { ['lk-app', 'lk-without', 'lk-since', 'lk-last', 'lk-hist'].forEach((id) => setText(id, '—')); $('lk-tiers').textContent = 'Enter a number from 0000 to 9999.'; $('lk-list').textContent = ''; return; }
    const r = R.pernum[parseInt(v, 10)];
    setText('lk-app', r.appearances);
    setText('lk-without', fmt(r.draws_without));
    setText('lk-since', r.draws_since == null ? 'Never drawn' : r.draws_since === 0 ? '0 (latest draw)' : fmt(r.draws_since));
    setText('lk-last', r.last_date ? S.fmtD(r.last_date) : 'never in these draws');
    setText('lk-hist', r.hist_rate_pct + '%');
    $('lk-tiers').replaceChildren(el('table', {},
      el('thead', {}, el('tr', {}, ...['1st', '2nd', '3rd', 'Starter', 'Consolation'].map((h) => el('th', { className: 'n', textContent: h })))),
      el('tbody', {}, el('tr', {}, ...['first', 'second', 'third', 'starter', 'consolation'].map((f) => el('td', { className: 'n', textContent: r[f] }))))));
    const hits = S.appearancesOf(rows, r.number);
    $('lk-list').replaceChildren(hits.length
      ? el('ul', { className: 'list' }, ...hits.map((h) => el('li', { textContent: `${S.fmtD(h.date)} (#${h.draw_no}): ${h.tier}` })))
      : el('p', { className: 'note', textContent: `${r.number} has not won any prize in these draws.` }));
  }
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); showNumber(); });
  inp.addEventListener('blur', () => { if (inp.value && inp.value.length < 4) { inp.value = inp.value.padStart(4, '0'); showNumber(); } });
  showNumber();
  $('odds-table').replaceChildren(...R.odds.map((r) => el('tr', {},
    el('td', { textContent: r.prize }), el('td', { className: 'n', textContent: r.numbers_drawn }), el('td', { className: 'n', textContent: r.chance }),
    el('td', { className: 'n', textContent: fmt(r.one_in) }), el('td', { className: 'n', textContent: r.pays_big == null ? '' : '$' + fmt(r.pays_big) }))));

  /* ---------- analysis ---------- */
  function bars(box, data, o) {
    box.replaceChildren();
    const W = Math.max(280, box.clientWidth), H = 240, m = { t: 10, r: 10, b: 44, l: 10 };
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', o.label);
    const y = d3.scaleLinear().domain([0, (d3.max(data, (d) => Math.max(o.y(d), o.dots ? o.dots(d) : 0)) * 1.15) || 1]).range([H - m.b, m.t]).nice(4);
    const yAxis = svg.append('g').call(d3.axisLeft(y).ticks(4).tickFormat(o.yfmt)).call((g) => g.select('.domain').remove());
    let lw = 0; yAxis.selectAll('text').each(function () { lw = Math.max(lw, this.getComputedTextLength()); });
    m.l = lw + 14; yAxis.attr('transform', `translate(${m.l},0)`);
    yAxis.selectAll('line').attr('x2', W - m.l - m.r).style('stroke', 'var(--grid)');
    const x = d3.scaleBand().domain(data.map(o.x)).range([m.l, W - m.r]).padding(0.25);
    const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickSize(0));
    xa.select('.domain').style('stroke', 'var(--line)');
    xa.selectAll('text').attr('dy', '1.2em');
    if (x.bandwidth() < 60) xa.selectAll('text').text((d) => String(d).replace(' or more', '+').replace(' to ', '–').replace('never seen yet', 'never'));
    if (o.xTitle) svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 4).attr('text-anchor', 'middle').text(o.xTitle);
    const tip = d3.select(box).append('div').attr('class', 'tip').style('display', 'none');
    svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', (d) => x(o.x(d))).attr('width', x.bandwidth()).attr('y', (d) => y(o.y(d))).attr('height', (d) => y(0) - y(o.y(d))).attr('rx', 2).style('fill', 'var(--accent)')
      .on('pointerenter pointermove', (ev, d) => { const [px, py] = d3.pointer(ev, box); tip.style('display', null).text(o.tip(d)); const tw = tip.node().offsetWidth; tip.style('left', Math.min(Math.max(0, px - tw / 2), box.clientWidth - tw) + 'px').style('top', Math.max(0, py - 40) + 'px'); })
      .on('pointerleave', () => tip.style('display', 'none'));
    if (o.dots) svg.append('g').selectAll('circle').data(data).join('circle').attr('cx', (d) => x(o.x(d)) + x.bandwidth() / 2).attr('cy', (d) => y(o.dots(d))).attr('r', 4)
      .style('fill', 'var(--panel)').style('stroke', 'var(--fg)').style('stroke-width', 1.5).style('pointer-events', 'none');
    if (o.ref != null) svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(o.ref)).attr('y2', y(o.ref)).style('stroke', 'var(--ref)').style('stroke-dasharray', '4 3').style('stroke-width', 1.5);
    if (o.labels) svg.append('g').selectAll('text').data(data).join('text').attr('x', (d) => x(o.x(d)) + x.bandwidth() / 2).attr('y', (d) => y(o.y(d)) - 4).attr('text-anchor', 'middle').text(o.labels);
  }
  const fillTable = (id, data, cols) => $(id).replaceChildren(...data.map((r) => el('tr', {}, ...cols.map(([f, f2, cls]) => el('td', { className: cls || '', textContent: r[f] == null ? '' : (f2 ? f2(r[f]) : String(r[f])) })))));

  function drawAnalysis() {
    const g = Object.fromEntries(R.gapbt.map((r) => [r.bin, r]));
    setText('tk-cold', g['1000 or more'].rate_pct);
    setText('tk-hot', g['under 50'].rate_pct);
    setText('t-never', fmt(sum.never_seen));
    setText('t-never-exp', fmt(sum.never_expected));
    const avg = R.strategies.find((s) => s.strategy.startsWith('Any number'));
    setText('t-ret', avg.per_dollar.toFixed(2));
    setText('luck-lo', avg.luck_low.toFixed(2));
    setText('luck-hi', avg.luck_high.toFixed(2));
    setText('t-biased', sum.tests_flagged);
    setText('t-ntests', sum.tests_run);
    setText('gap-p', R.tests.find((t) => t.test === 'Gap groups vs next draw').p);
    const pct = (v) => v.toFixed(2) + '%';
    bars($('gap-chart'), R.gapbt, { x: (r) => r.bin, y: (r) => r.rate_pct, ref: sum.chance_next_pct, yfmt: pct, labels: (r) => r.rate_pct.toFixed(3) + '%', xTitle: 'Draws since last appearance',
      label: 'Chance of appearing next draw by draws since last appearance', tip: (r) => `${r.bin} draws: ${fmt(r.hits)} hits in ${fmt(r.checks)} checks = ${r.rate_pct}%` });
    bars($('hot-chart'), R.hotbt, { x: (r) => r.group, y: (r) => r.rate_pct, ref: sum.chance_next_pct, yfmt: pct, labels: (r) => r.rate_pct.toFixed(3) + '%', xTitle: 'Wins in the previous 100 draws',
      label: 'Chance of appearing next draw by recent wins', tip: (r) => `${r.group}: ${fmt(r.hits)} hits in ${fmt(r.checks)} checks = ${r.rate_pct}%` });
    bars($('count-chart'), R.countdist, { x: (r) => r.times_won, y: (r) => r.numbers, dots: (r) => r.expected, yfmt: d3.format(','), xTitle: 'Times a number won a prize',
      label: 'Count of numbers by times won, with the count pure chance predicts', tip: (r) => `Won ${r.times_won}×: ${fmt(r.numbers)} numbers (chance predicts ${r.expected})` });
    const money = (v) => '$' + fmt(Math.round(v));
    fillTable('strat-table', R.strategies, [['strategy'], ['staked', money, 'n'], ['returned', money, 'n'], ['per_dollar', (v) => '$' + v.toFixed(2), 'n']]);
    fillTable('test-table', R.tests, [['test'], ['chi2', (v) => v.toFixed(2), 'n'], ['df', null, 'n'], ['p', (v) => v.toFixed(3), 'n'], ['verdict']]);
    fillTable('digit-table', R.digits, [['digit'], ['pos1', fmt, 'n'], ['pos2', fmt, 'n'], ['pos3', fmt, 'n'], ['pos4', fmt, 'n']]);
    fillTable('overdue-table', R.overdue, [['number'], ['draws_since', fmt, 'n'], ['last_date', S.fmtD]]);
    fillTable('frequent-table', R.frequent, [['number'], ['appearances', null, 'n']]);
  }
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (drawn.has('analysis') && !$('analysis').hidden) drawAnalysis(); }, 200); });

  const start = location.hash.slice(1);
  openTab(TABS.includes(start) ? start : 'lucky');
})();
