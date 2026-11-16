import json, sys
import numpy as np, pandas as pd
from scipy import stats

df = pd.read_csv(sys.argv[1], dtype=str)
df['draw_no'] = df['draw_no'].astype(int)
cols = [c for c in df.columns if c not in ('date', 'draw_no')]
D = len(df)
nums = df[cols].astype(int).to_numpy()          # D x 23
tier = np.array([0, 1, 2] + [3]*10 + [4]*10)    # 1st,2nd,3rd,starter,consol
PAY = np.array([2000, 1000, 490, 250, 60])
P_HIT = 23/10000
out = {'draws': D, 'first_date': df.date.iloc[0], 'last_date': df.date.iloc[-1],
       'first_no': int(df.draw_no.iloc[0]), 'last_no': int(df.draw_no.iloc[-1])}

# sanity
out['all_distinct_within_draw'] = bool(all(len(set(r)) == 23 for r in nums))

# 1. digit by position
digits = np.stack([(nums // 10**(3-p)) % 10 for p in range(4)], axis=-1).reshape(-1, 4)
pos = []
for p in range(4):
    c = np.bincount(digits[:, p], minlength=10)
    chi, pv = stats.chisquare(c)
    pos.append({'counts': c.tolist(), 'chi2': round(chi, 2), 'p': round(pv, 3)})
out['digit_pos'] = pos
allc = np.bincount(digits.ravel(), minlength=10)
chi, pv = stats.chisquare(allc)
out['digit_all'] = {'counts': allc.tolist(), 'chi2': round(chi, 2), 'p': round(pv, 3)}

# 1st-prize-only digits
fd = np.stack([(nums[:, 0] // 10**(3-p)) % 10 for p in range(4)], axis=-1)
c = np.bincount(fd.ravel(), minlength=10)
chi, pv = stats.chisquare(c)
out['digit_first'] = {'counts': c.tolist(), 'chi2': round(chi, 2), 'p': round(pv, 3)}

# 2. per-number counts vs binomial
cnt = np.bincount(nums.ravel(), minlength=10000)
lam = D * P_HIT
kmax = int(cnt.max())
obs = np.bincount(cnt, minlength=kmax+1)
exp = stats.binom.pmf(np.arange(kmax+1), D, P_HIT) * 10000
# pool tail >= 9 for chi2
cut = 9
o = np.append(obs[:cut], obs[cut:].sum()); e = np.append(exp[:cut], 10000 - exp[:cut].sum())
chi, pv = stats.chisquare(o, e)
out['count_dist'] = {'k': list(range(kmax+1)), 'observed': obs.tolist(),
                     'expected': [round(x, 1) for x in exp], 'chi2': round(chi, 2), 'p': round(pv, 3),
                     'mean': round(cnt.mean(), 3), 'expected_mean': round(lam, 3)}
out['top_count'] = [[f'{i:04d}', int(cnt[i])] for i in np.argsort(-cnt, kind='stable')[:15]]

# 3. walk through draws: gap backtest + hot backtest + overdue strategy
last = np.full(10000, -1)          # index of last appearance
recent = []                         # for hot window
WARM = 300                          # skip first draws so gaps are meaningful
bins = [(0, 50), (50, 150), (150, 300), (300, 450), (450, 700), (700, 1000), (1000, 99999)]
bin_lab = ['<50', '50–149', '150–299', '300–449', '450–699', '700–999', '1000+']
nb = np.zeros(len(bins)); hb = np.zeros(len(bins))
never_n = 0; never_h = 0
hot_n = np.zeros(4); hot_h = np.zeros(4)   # appearances in last 100 draws: 0,1,2,3+
win100 = np.zeros(10000, int)
strat = {'overdue10': [0, 0], 'recent10': [0, 0], 'random10': [0, 0]}
rng = np.random.default_rng(7)
repeat_n = 0; repeat_h = 0
for t in range(D):
    row = nums[t]; hit = np.zeros(10000, bool); hit[row] = True
    pay_of = np.zeros(10000); pay_of[row] = PAY[tier]
    if t >= WARM:
        seen = last >= 0
        gap = np.where(seen, t - last, -1)
        for i, (a, b) in enumerate(bins):
            m = seen & (gap >= a) & (gap < b)
            nb[i] += m.sum(); hb[i] += hit[m].sum()
        never_n += (~seen).sum(); never_h += hit[~seen].sum()
        hk = np.minimum(win100, 3)
        for k in range(4):
            m = hk == k; hot_n[k] += m.sum(); hot_h[k] += hit[m].sum()
        # strategies: $1 Big on 10 numbers each draw
        g2 = np.where(seen, t - last, 10**6)
        od = np.argsort(-g2, kind='stable')[:10]
        rc = np.argsort(np.where(seen, t - last, 10**6), kind='stable')[:10]
        rd = rng.choice(10000, 10, replace=False)
        for k, pick in (('overdue10', od), ('recent10', rc), ('random10', rd)):
            strat[k][0] += 10; strat[k][1] += pay_of[pick].sum()
        prev = nums[t-1]; repeat_n += 23; repeat_h += hit[prev].sum()
    last[row] = t
    win100[row] += 1
    if t >= 100: win100[nums[t-100]] -= 1

out['gap_backtest'] = [{'bin': bin_lab[i], 'trials': int(nb[i]), 'hits': int(hb[i]),
                        'rate_pct': round(100*hb[i]/nb[i], 4) if nb[i] else None} for i in range(len(bins))]
out['gap_backtest'].append({'bin': 'not seen yet', 'trials': int(never_n), 'hits': int(never_h),
                            'rate_pct': round(100*never_h/never_n, 4)})
# chi2 test of independence on gap bins
tab = np.array([[hb[i], nb[i]-hb[i]] for i in range(len(bins))] + [[never_h, never_n-never_h]])
chi, pv, _, _ = stats.chi2_contingency(tab)
out['gap_test'] = {'chi2': round(chi, 2), 'p': round(pv, 3)}
out['hot_backtest'] = [{'bin': ['0', '1', '2', '3+'][k], 'trials': int(hot_n[k]), 'hits': int(hot_h[k]),
                        'rate_pct': round(100*hot_h[k]/hot_n[k], 4) if hot_n[k] else None} for k in range(4)]
out['repeat_next_draw'] = {'trials': repeat_n, 'hits': int(repeat_h), 'rate_pct': round(100*repeat_h/repeat_n, 4)}
out['strategies'] = {k: {'staked': v[0], 'returned': round(v[1]), 'return_per_dollar': round(v[1]/v[0], 3)}
                     for k, v in strat.items()}
out['strategy_draws'] = D - WARM
out['p_hit_pct'] = 100*P_HIT
out['theoretical_return'] = round(PAY[tier].sum()/10000, 3)

# 4. current state per number (as of last draw)
cur_gap = np.where(last >= 0, D - last, -1)   # draws since last seen (1 = appeared in last draw)
out['never_seen'] = int((last < 0).sum())
out['never_seen_expected'] = round(10000 * (1-P_HIT)**D, 1)
order = np.argsort(-np.where(last >= 0, cur_gap, 10**6), kind='stable')
seen_order = [i for i in order if last[i] >= 0]
out['most_overdue_seen'] = [[f'{i:04d}', int(cur_gap[i]), df.date.iloc[last[i]]] for i in seen_order[:15]]
out['gap_hist'] = np.histogram(cur_gap[cur_gap > 0], bins=[1, 50, 150, 300, 450, 700, 1000, 1300, 1600])[0].tolist()
out['prob_next_any'] = P_HIT

json.dump(out, open(sys.argv[2], 'w'), indent=1)

# compact per-number table for dashboard: count, gap(-1 never), last date idx
tbl = {'dates': df.date.tolist(), 'cnt': cnt.tolist(), 'last': last.tolist(),
       'first': nums[:, 0].tolist(), 'top3': nums[:, :3].tolist()}
# best tier per number
best = np.full(10000, 9)
for t in range(D):
    for j, n in enumerate(nums[t]):
        best[n] = min(best[n], tier[j])
tbl['best'] = best.tolist()
json.dump(tbl, open(sys.argv[3], 'w'), separators=(',', ':'))
print(json.dumps(out, indent=1))
