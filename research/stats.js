// Statistics helpers: descriptive stats, Spearman, Mann-Whitney U, chi-square,
// logistic regression (IRLS) with Wald tests, AUC and k-fold cross-validation.
const { jStat } = require('jstat');

const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / ((a.length - 1) || 1)); };
const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return NaN; const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };
const median = a => quantile(a, 0.5);

function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rk; i = j + 1; } return r; }
function pearson(x, y) { const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0; for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; } return n / Math.sqrt(dx * dy); }
function spearman(x, y) { const rho = pearson(ranks(x), ranks(y)); const n = x.length; const t = rho * Math.sqrt((n - 2) / (1 - rho * rho)); const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), n - 2)); return { rho, p, n }; }
function partialSpearman(x, y, z) { const rx = ranks(x), ry = ranks(y), rz = ranks(z); const rxy = pearson(rx, ry), rxz = pearson(rx, rz), ryz = pearson(ry, rz); const r = (rxy - rxz * ryz) / Math.sqrt((1 - rxz ** 2) * (1 - ryz ** 2)); const n = x.length; const t = r * Math.sqrt((n - 3) / (1 - r * r)); return { rho: r, p: 2 * (1 - jStat.studentt.cdf(Math.abs(t), n - 3)), n }; }
function mannWhitney(a, b) { const all = a.concat(b); const r = ranks(all); const ra = r.slice(0, a.length).reduce((s, v) => s + v, 0); const U = ra - a.length * (a.length + 1) / 2; const mu = a.length * b.length / 2; const sig = Math.sqrt(a.length * b.length * (a.length + b.length + 1) / 12); const z = (U - mu) / sig; return { U, z, p: 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1)), r: Math.abs(z) / Math.sqrt(a.length + b.length) }; }
function chiSquare(table) { const R = table.length, K = table[0].length; const rs = table.map(r => r.reduce((s, v) => s + v, 0)); const cs = table[0].map((_, j) => table.reduce((s, r) => s + r[j], 0)); const N = rs.reduce((s, v) => s + v, 0); let x2 = 0; for (let i = 0; i < R; i++) for (let j = 0; j < K; j++) { const e = rs[i] * cs[j] / N; if (e > 0) x2 += (table[i][j] - e) ** 2 / e; } const df = (R - 1) * (K - 1); return { x2, df, p: 1 - jStat.chisquare.cdf(x2, df), cramersV: Math.sqrt(x2 / (N * (Math.min(R, K) - 1))) }; }
function kruskal(groups) { const all = groups.flat(); const r = ranks(all); let off = 0, H = 0; const N = all.length; for (const g of groups) { const rs = r.slice(off, off + g.length).reduce((s, v) => s + v, 0); H += rs * rs / g.length; off += g.length; } H = 12 / (N * (N + 1)) * H - 3 * (N + 1); const df = groups.length - 1; return { H, df, p: 1 - jStat.chisquare.cdf(H, df), eps2: H / ((N * N - 1) / (N + 1)) }; }

// Logistic regression by IRLS. X: rows of predictors (no intercept), y: 0/1.
function logistic(X, y, names, { ridge = 1e-6, iters = 50 } = {}) {
  const n = X.length, k = X[0].length + 1; const A = X.map(r => [1, ...r]); let b = new Array(k).fill(0);
  let cov;
  for (let it = 0; it < iters; it++) {
    const p = A.map(r => 1 / (1 + Math.exp(-r.reduce((s, v, j) => s + v * b[j], 0))));
    const H = Array.from({ length: k }, () => new Array(k).fill(0)); const g = new Array(k).fill(0);
    for (let i = 0; i < n; i++) { const w = p[i] * (1 - p[i]); for (let a = 0; a < k; a++) { g[a] += A[i][a] * (y[i] - p[i]); for (let c = 0; c < k; c++) H[a][c] += w * A[i][a] * A[i][c]; } }
    for (let a = 0; a < k; a++) H[a][a] += ridge;
    cov = jStat.inv(H); const step = cov.map(r => r.reduce((s, v, j) => s + v * g[j], 0));
    b = b.map((v, j) => v + step[j]); if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  const p = A.map(r => 1 / (1 + Math.exp(-r.reduce((s, v, j) => s + v * b[j], 0))));
  const ll = y.reduce((s, yi, i) => s + yi * Math.log(p[i] + 1e-12) + (1 - yi) * Math.log(1 - p[i] + 1e-12), 0);
  const p0 = mean(y); const ll0 = y.reduce((s, yi) => s + yi * Math.log(p0) + (1 - yi) * Math.log(1 - p0), 0);
  const coefs = b.map((est, j) => { const se = Math.sqrt(cov[j][j]); const z = est / se; return { name: j === 0 ? '(Intercept)' : names[j - 1], b: est, se, z, p: 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1)), or: Math.exp(est), lo: Math.exp(est - 1.96 * se), hi: Math.exp(est + 1.96 * se) }; });
  const LR = 2 * (ll - ll0);
  return { coefs, b, n, ll, ll0, mcfadden: 1 - ll / ll0, LR, LRp: 1 - jStat.chisquare.cdf(LR, k - 1), auc: auc(p, y), predict: rows => rows.map(r => 1 / (1 + Math.exp(-(b[0] + r.reduce((s, v, j) => s + v * b[j + 1], 0))))) };
}
function auc(p, y) { const pos = [], neg = []; p.forEach((v, i) => (y[i] ? pos : neg).push(v)); if (!pos.length || !neg.length) return NaN; return mannWhitneyAUC(pos, neg); }
function mannWhitneyAUC(pos, neg) { const r = ranks(pos.concat(neg)); const rp = r.slice(0, pos.length).reduce((s, v) => s + v, 0); return (rp - pos.length * (pos.length + 1) / 2) / (pos.length * neg.length); }
function cvAUC(X, y, names, k = 5, seed = 7) { let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const idx = X.map((_, i) => i).sort(() => rnd() - 0.5); const pr = new Array(X.length); for (let f = 0; f < k; f++) { const test = idx.filter((_, i) => i % k === f), train = idx.filter((_, i) => i % k !== f); const m = logistic(train.map(i => X[i]), train.map(i => y[i]), names); const pp = m.predict(test.map(i => X[i])); test.forEach((i, j) => pr[i] = pp[j]); } return { auc: auc(pr, y), preds: pr }; }
function standardize(cols) { return cols.map(c => { const m = mean(c), s = sd(c) || 1; return c.map(v => (v - m) / s); }); }

module.exports = { mean, sd, median, quantile, spearman, partialSpearman, mannWhitney, chiSquare, kruskal, logistic, auc, cvAUC, standardize, ranks };
