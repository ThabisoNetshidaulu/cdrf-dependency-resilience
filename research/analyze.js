// Analysis for Objectives 1-3. Reads data/sample.json, writes results/results.json and figures.
const fs = require('fs');
const path = require('path');
const S = require('./stats');
const ch = require('./charts');

const OUT = path.join(__dirname, 'results'); const FIG = path.join(OUT, 'fig');
fs.mkdirSync(FIG, { recursive: true });
const T_OBS = new Date('2026-11-21T00:00:00Z'); const T0 = new Date('2024-11-21T00:00:00Z');
const MONTH = 30.4375 * 864e5, YEAR = 365.25 * 864e5;
const ECOL = { npm: ch.C.npm, pypi: ch.C.pypi, maven: ch.C.maven }; const ENAME = { npm: 'npm', pypi: 'PyPI', maven: 'Maven' };
const R = {}; // results bag
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sample.json'), 'utf8'));
const log1p = Math.log1p, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000, pct = (a, b) => (b ? (100 * a) / b : 0);

// ---------- derive variables ----------
function depth(nodes, edges) { if (!nodes.length) return 0; const adj = nodes.map(() => []); edges.forEach(([a, b]) => adj[a || 0].push(b || 0)); const d = new Array(nodes.length).fill(-1); d[0] = 0; const q = [0]; while (q.length) { const u = q.shift(); for (const v of adj[u]) if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } } return Math.max(0, ...d); }
const SPAM = new Set(['angle-pupil', 'arm-road-mine-planet', 'against-closer', 'again-basis-indeed-minerals', 'anakjalanan', 'api-chatfb']);
R.excluded_spam = raw.filter(p => p.eco === 'npm' && SPAM.has(p.name)).map(p => p.name);
R.excluded_nodepsdev = raw.filter(p => !(p.depsdev && p.versions && p.versions.length)).map(p => p.eco + ':' + p.name);
R.compromised_versions = raw.filter(p => !SPAM.has(p.name) && (p.hist_vulns || []).some(v => v.id.startsWith('MAL-'))).map(p => ({ eco: p.eco, name: p.name, ids: p.hist_vulns.filter(v => v.id.startsWith('MAL-')).map(v => v.id + ' ' + v.published) }));
const pk = raw.filter(p => p.depsdev && p.versions && p.versions.length && !(p.eco === 'npm' && SPAM.has(p.name))).map(p => {
  const ts = p.versions.map(v => new Date(v.t)).filter(d => !isNaN(d)).sort((a, b) => a - b);
  const before = d => ts.filter(t => t <= d); const first = ts[0], last = ts[ts.length - 1];
  const lastBefore = d => { const b = before(d); return b.length ? b[b.length - 1] : null; };
  const inWin = (end, months) => ts.filter(t => t <= end && t > new Date(end - months * MONTH)).length;
  const defv = p.versions.find(v => v.def) || {};
  const archived = !!(p.repo && p.repo.archived); const deprecated = !!defv.dep || p.status === 'deprecated';
  const nDirect = p.nodes.filter(n => n.rel === 'DIRECT').length, nIndirect = p.nodes.filter(n => n.rel === 'INDIRECT').length;
  const vn = p.transitive_vuln_nodes || [];
  const lb0 = lastBefore(T0);
  return {
    eco: p.eco, name: p.name, stratum: p.stratum, rank: p.rank,
    dependents: p.dependents_packages || 0, dd_total: p.dependents_dd ? p.dependents_dd.dependentCount : null, dd_direct: p.dependents_dd ? p.dependents_dd.directDependentCount : null,
    downloads: p.downloads, stars: (p.project && p.project.stars) || (p.repo && p.repo.stars) || 0,
    maintainers: p.maintainers_count, versions_total: ts.length, age_years: (T_OBS - first) / YEAR,
    months_since_release: (T_OBS - last) / MONTH, releases_12m: inWin(T_OBS, 12),
    archived, deprecated,
    graph_ok: p.graph_ok && p.nodes.length > 0, n_direct: nDirect, n_indirect: nIndirect, tree: Math.max(0, p.nodes.length - 1), depth: p.graph_ok ? depth(p.nodes, p.edges) : null,
    hist_vulns: p.hist_vulns.length, has_hist_vuln: p.hist_vulns.length > 0 ? 1 : 0, cur_adv: p.advisoryKeys_latest.length,
    vuln_nodes: vn.length, vuln_nodes_direct: vn.filter(n => n.rel === 'DIRECT').length, vuln_nodes_indirect: vn.filter(n => n.rel === 'INDIRECT').length,
    scorecard: p.scorecard ? p.scorecard.overall : null, sc_maintained: p.scorecard ? p.scorecard.checks.Maintained : null,
    sc_security_policy: p.scorecard ? p.scorecard.checks['Security-Policy'] : null, sc_code_review: p.scorecard ? p.scorecard.checks['Code-Review'] : null,
    funding: p.funding_links || 0,
    // retrospective (T0) features
    t0_exists: first <= new Date(T0 - 12 * MONTH),
    t0_active: lb0 ? (T0 - lb0) / MONTH <= 24 : false,
    t0_rel12: inWin(T0, 12), t0_rel24: inWin(T0, 24), t0_gap: lb0 ? (T0 - lb0) / MONTH : null, t0_age: (T0 - first) / YEAR, t0_versions: before(T0).length,
    released_after_t0: ts.some(t => t > T0),
    nodes: p.nodes, edges: p.edges, vuln_detail: vn,
  };
});
pk.forEach(p => { p.dormant_now = (p.months_since_release > 24 || p.archived || p.deprecated) ? 1 : 0; p.became_dormant = (!p.released_after_t0 || p.archived || p.deprecated) ? 1 : 0; });
R.n_frame = raw.length; R.n = pk.length; R.n_graph = pk.filter(p => p.graph_ok).length;

// ---------- sample description ----------
const ecos = ['npm', 'pypi', 'maven'];
R.sample = ecos.map(e => { const a = pk.filter(p => p.eco === e); return { eco: ENAME[e], A: a.filter(p => p.stratum === 'A').length, B: a.filter(p => p.stratum === 'B').length, C: a.filter(p => p.stratum === 'C').length, n: a.length, graphs: a.filter(p => p.graph_ok).length, scorecard: a.filter(p => p.scorecard != null).length }; });
const desc = (a, f) => { const v = a.map(f).filter(x => x != null && !isNaN(x)); return { median: r2(S.median(v)), q1: r2(S.quantile(v, 0.25)), q3: r2(S.quantile(v, 0.75)), mean: r2(S.mean(v)), max: r2(Math.max(...v)) }; };
R.desc = ecos.map(e => { const a = pk.filter(p => p.eco === e), g = a.filter(p => p.graph_ok); return { eco: ENAME[e], dependents: desc(a, p => p.dependents), dd_total: desc(a, p => p.dd_total), direct: desc(g, p => p.n_direct), tree: desc(g, p => p.tree), depth: desc(g, p => p.depth), age: desc(a, p => p.age_years), hist_vuln_pct: r2(pct(a.filter(p => p.has_hist_vuln).length, a.length)), cur_adv_pct: r2(pct(a.filter(p => p.cur_adv > 0).length, a.length)), vuln_tree_pct: r2(pct(g.filter(p => p.vuln_nodes > 0).length, g.length)), dormant_pct: r2(pct(a.filter(p => p.dormant_now).length, a.length)), amplification: r2(S.median(g.filter(p => p.n_direct > 0).map(p => p.tree / p.n_direct))) }; });

// ---------- Objective 1: network structure ----------
// (a) concentration of ecosystem in-degree in the frame sample (heavy tail)
R.concentration = ecos.map(e => { const d = pk.filter(p => p.eco === e).map(p => p.dependents).sort((a, b) => b - a); const tot = d.reduce((s, v) => s + v, 0); const top10 = d.slice(0, Math.ceil(d.length * 0.1)).reduce((s, v) => s + v, 0); return { eco: ENAME[e], top10_share: r2(pct(top10, tot)), gini: r3(gini(d)) }; });
function gini(a) { const s = [...a].sort((x, y) => x - y); const n = s.length, sum = s.reduce((t, v) => t + v, 0); let c = 0; s.forEach((v, i) => c += (2 * (i + 1) - n - 1) * v); return c / (n * sum); }
// (b) union dependency graph per ecosystem, built from resolved trees
function brandes(nodes, adj, sources) { const CB = new Map(nodes.map(n => [n, 0])); for (const s of sources) { const St = [], P = new Map(), sig = new Map(), d = new Map(); for (const n of nodes) { P.set(n, []); sig.set(n, 0); d.set(n, -1); } sig.set(s, 1); d.set(s, 0); const Q = [s]; while (Q.length) { const v = Q.shift(); St.push(v); for (const w of adj.get(v) || []) { if (d.get(w) < 0) { Q.push(w); d.set(w, d.get(v) + 1); } if (d.get(w) === d.get(v) + 1) { sig.set(w, sig.get(w) + sig.get(v)); P.get(w).push(v); } } } const del = new Map(nodes.map(n => [n, 0])); while (St.length) { const w = St.pop(); for (const v of P.get(w)) del.set(v, del.get(v) + (sig.get(v) / sig.get(w)) * (1 + del.get(w))); if (w !== s) CB.set(w, CB.get(w) + del.get(w)); } } return CB; }
R.union = {};
const unionStats = {};
for (const e of ecos) {
  const adj = new Map(), indeg = new Map(); const nodeSet = new Set();
  for (const p of pk.filter(q => q.eco === e && q.graph_ok)) { p.edges.forEach(([a, b]) => { const u = p.nodes[a || 0].name, v = p.nodes[b || 0].name; if (u === v) return; nodeSet.add(u); nodeSet.add(v); if (!adj.has(u)) adj.set(u, new Set()); if (!adj.get(u).has(v)) { adj.get(u).add(v); indeg.set(v, (indeg.get(v) || 0) + 1); } }); }
  const nodes = [...nodeSet]; const adjA = new Map([...adj].map(([k, v]) => [k, [...v]]));
  const E = [...adj.values()].reduce((s, v) => s + v.size, 0);
  const CB = brandes(nodes, adjA, nodes.filter(n => adjA.has(n)));
  const top = [...CB].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, v]) => ({ name: n, betweenness: Math.round(v), indeg: indeg.get(n) || 0 }));
  const topIn = [...indeg].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, v]) => ({ name: n, indeg: v }));
  const degs = nodes.map(n => indeg.get(n) || 0); const tot = degs.reduce((s, v) => s + v, 0); const sd = [...degs].sort((a, b) => b - a);
  const top1 = sd.slice(0, Math.ceil(sd.length * 0.01)).reduce((s, v) => s + v, 0);
  const cbVals = [...CB.values()].sort((a, b) => b - a); const cbTot = cbVals.reduce((s, v) => s + v, 0); const cbTop1 = cbVals.slice(0, Math.ceil(cbVals.length * 0.01)).reduce((s, v) => s + v, 0);
  R.union[e] = { nodes: nodes.length, edges: E, density: r3(E / (nodes.length * (nodes.length - 1)) * 1000), top1pct_indeg_share: r2(pct(top1, tot)), top1pct_betw_share: r2(pct(cbTop1, cbTot)), top_betweenness: top, top_indegree: topIn };
  unionStats[e] = { CB, indeg };
  pk.filter(q => q.eco === e).forEach(q => { q.betweenness = CB.get(q.name) || 0; q.union_indeg = indeg.get(q.name) || 0; });
}
// (c) H1: network position vs vulnerability history (logistic, controls)
const h1rows = pk.filter(p => p.stars != null);
const X1 = h1rows.map(p => [log1p(p.dependents), log1p(p.betweenness), log1p(p.age_years), log1p(p.versions_total), log1p(p.stars), p.eco === 'pypi' ? 1 : 0, p.eco === 'maven' ? 1 : 0]);
const n1 = ['log(ecosystem dependents)', 'log(betweenness, union graph)', 'log(age, years)', 'log(versions)', 'log(GitHub stars)', 'PyPI (vs npm)', 'Maven (vs npm)'];
const Xs1 = transpose(S.standardize(transpose(X1).map((c, i) => i >= 5 ? c : c))).map(r => r);
function transpose(m) { return m[0].map((_, j) => m.map(r => r[j])); }
const zcols = transpose(X1).map((c, i) => i < 5 ? S.standardize([c])[0] : c);
const X1z = transpose(zcols);
const m1 = S.logistic(X1z, h1rows.map(p => p.has_hist_vuln), n1);
R.h1 = { model: summarise(m1), spearman_dep_hist: sp(h1rows.map(p => p.dependents), h1rows.map(p => p.hist_vulns)), spearman_betw_hist: sp(h1rows.map(p => p.betweenness), h1rows.map(p => p.hist_vulns)), partial_dep_hist_ctrl_stars: psp(h1rows.map(p => p.dependents), h1rows.map(p => p.hist_vulns), h1rows.map(p => p.stars)), by_eco: ecos.map(e => { const a = h1rows.filter(p => p.eco === e); return { eco: ENAME[e], ...sp(a.map(p => p.dependents), a.map(p => p.hist_vulns)) }; }) };
function sp(x, y) { const r = S.spearman(x, y); return { rho: r3(r.rho), p: r.p, n: r.n }; }
function psp(x, y, z) { const r = S.partialSpearman(x, y, z); return { rho: r3(r.rho), p: r.p, n: r.n }; }
function summarise(m) { return { n: m.n, mcfadden: r3(m.mcfadden), LR: r2(m.LR), LRp: m.LRp, auc: r3(m.auc), coefs: m.coefs.map(c => ({ name: c.name, b: r3(c.b), se: r3(c.se), or: r2(c.or), lo: r2(c.lo), hi: r2(c.hi), p: c.p })) }; }
// (d) H3 (transitive amplification): depth & breadth vs vulnerable transitive nodes
const g = pk.filter(p => p.graph_ok && p.tree > 0);
const X3 = g.map(p => [p.depth, log1p(p.n_direct), log1p(p.age_years), p.eco === 'pypi' ? 1 : 0, p.eco === 'maven' ? 1 : 0]);
const X3z = transpose(transpose(X3).map((c, i) => i < 3 ? S.standardize([c])[0] : c));
const m3 = S.logistic(X3z, g.map(p => (p.vuln_nodes > 0 ? 1 : 0)), ['Dependency depth (levels)', 'log(direct dependencies)', 'log(age, years)', 'PyPI (vs npm)', 'Maven (vs npm)']);
R.h3 = { model: summarise(m3), n: g.length, tree_vs_vuln: sp(g.map(p => p.tree), g.map(p => p.vuln_nodes)), share_indirect_of_vuln_nodes: r2(pct(g.reduce((s, p) => s + p.vuln_nodes_indirect, 0), g.reduce((s, p) => s + p.vuln_nodes, 0))), by_depth: [[0, 1], [2, 2], [3, 4], [5, 99]].map(([lo, hi]) => { const a = g.filter(p => p.depth >= lo && p.depth <= hi); return { label: hi === 99 ? `${lo}+` : lo === hi ? `${lo}` : `${lo}-${hi}`, n: a.length, pct: r2(pct(a.filter(p => p.vuln_nodes > 0).length, a.length)) }; }) };
R.tree_share_transitive = r2(pct(g.reduce((s, p) => s + p.n_indirect, 0), g.reduce((s, p) => s + p.tree, 0)));

// ---------- Objective 2: abandonment ----------
const cohort = pk.filter(p => p.t0_exists && p.t0_active);
const feat = p => [log1p(p.t0_rel12), p.t0_gap, log1p(p.t0_age), log1p(p.t0_versions), log1p(p.dependents), log1p(p.stars), p.eco === 'pypi' ? 1 : 0, p.eco === 'maven' ? 1 : 0];
const n2 = ['log(releases in prior 12 months)', 'Months since last release', 'log(age, years)', 'log(total versions)', 'log(ecosystem dependents)', 'log(GitHub stars)', 'PyPI (vs npm)', 'Maven (vs npm)'];
const X2raw = cohort.map(feat); const means2 = transpose(X2raw).map(c => S.mean(c)), sds2 = transpose(X2raw).map(c => S.sd(c) || 1);
const zf = rows => rows.map(r => r.map((v, i) => (i < 6 ? (v - means2[i]) / sds2[i] : v)));
const y2 = cohort.map(p => p.became_dormant);
const m2 = S.logistic(zf(X2raw), y2, n2);
const activityOnly = [0, 1, 2, 3, 6, 7]; const pick = (rows, idx) => rows.map(r => idx.map(i => r[i]));
const cvFull = S.cvAUC(zf(X2raw), y2, n2, 5); const cvAct = S.cvAUC(pick(zf(X2raw), activityOnly), y2, activityOnly.map(i => n2[i]), 5);
R.h2 = { cohort: cohort.length, dormant: y2.reduce((s, v) => s + v, 0), rate: r2(pct(y2.reduce((s, v) => s + v, 0), y2.length)), model: summarise(m2), cv_auc_full: r3(cvFull.auc), cv_auc_activity_only: r3(cvAct.auc),
  by_stratum: ['A', 'B', 'C'].map(s => { const a = cohort.filter(p => p.stratum === s); return { stratum: s, n: a.length, rate: r2(pct(a.filter(p => p.became_dormant).length, a.length)) }; }),
  by_eco: ecos.map(e => { const a = cohort.filter(p => p.eco === e); return { eco: ENAME[e], n: a.length, rate: r2(pct(a.filter(p => p.became_dormant).length, a.length)) }; }) };
R.h2.chi_stratum = (() => { const t = ['A', 'B', 'C'].map(s => { const a = cohort.filter(p => p.stratum === s); const d = a.filter(p => p.became_dormant).length; return [d, a.length - d]; }); const c = S.chiSquare(t); return { x2: r2(c.x2), df: c.df, p: c.p, v: r3(c.cramersV) }; })();
R.dormant_now = { all: r2(pct(pk.filter(p => p.dormant_now).length, pk.length)), by_stratum: ['A', 'B', 'C'].map(s => { const a = pk.filter(p => p.stratum === s); return { stratum: s, n: a.length, pct: r2(pct(a.filter(p => p.dormant_now).length, a.length)) }; }), by_eco: ecos.map(e => { const a = pk.filter(p => p.eco === e); return { eco: ENAME[e], pct: r2(pct(a.filter(p => p.dormant_now).length, a.length)) }; }), critical_dormant: pk.filter(p => p.dormant_now && p.stratum === 'A').map(p => ({ eco: ENAME[p.eco], name: p.name, dependents: p.dependents, months: Math.round(p.months_since_release) })) };
// scorecard maintained vs dormancy
const scm = pk.filter(p => p.sc_maintained != null && p.sc_maintained >= 0);
R.scorecard_maintained = { n: scm.length, dormant_median: S.median(scm.filter(p => p.dormant_now).map(p => p.sc_maintained)), active_median: S.median(scm.filter(p => !p.dormant_now).map(p => p.sc_maintained)), mw: (() => { const m = S.mannWhitney(scm.filter(p => p.dormant_now).map(p => p.sc_maintained), scm.filter(p => !p.dormant_now).map(p => p.sc_maintained)); return { z: r2(m.z), p: m.p, r: r3(m.r) }; })() };

// ---------- Objective 3: CDRF scoring ----------
// Abandonment likelihood A: the T0 model applied to features measured today (forward 24-month risk).
const nowFeat = p => [log1p(p.releases_12m), p.months_since_release, log1p(p.age_years), log1p(p.versions_total), log1p(p.dependents), log1p(p.stars), p.eco === 'pypi' ? 1 : 0, p.eco === 'maven' ? 1 : 0];
function pctRank(arr) { const s = [...arr].sort((a, b) => a - b); return v => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; } return lo / (s.length - 1 || 1); }; }
const cdrf = (weights = { a: 0.6, v: 0.4 }, thr = { c: 0.5, a: 0.5 }) => {
  const out = [];
  for (const e of ecos) {
    const a = pk.filter(p => p.eco === e); const pr1 = pctRank(a.map(p => p.dependents)), pr2 = pctRank(a.map(p => p.dd_total || 0));
    a.forEach(p => {
      const C = pr1(p.dependents);
      const A = p.dormant_now ? 1 : m2.predict(zf([nowFeat(p)]))[0];
      const V = Math.min(1, 0.5 * (p.cur_adv > 0 ? 1 : 0) + 0.3 * Math.min(1, p.vuln_nodes / 3) + 0.2 * Math.min(1, p.hist_vulns / 5));
      const E = weights.a * A + weights.v * V; const RRI = 100 * C * E;
      let resp = C >= thr.c ? (A >= thr.a ? 'Support or fork' : 'Sustain') : (A >= thr.a ? 'Migrate' : 'Accept and monitor');
      out.push({ eco: p.eco, name: p.name, stratum: p.stratum, C, A, V, E, RRI, resp, remediate: p.cur_adv > 0 || p.vuln_nodes_direct > 0 });
    });
  }
  return out;
};
const base = cdrf();
R.cdrf = { responses: ['Accept and monitor', 'Sustain', 'Migrate', 'Support or fork'].map(r => ({ resp: r, n: base.filter(x => x.resp === r).length, pct: r2(pct(base.filter(x => x.resp === r).length, base.length)), by_eco: ecos.map(e => base.filter(x => x.eco === e && x.resp === r).length) })), remediate_pct: r2(pct(base.filter(x => x.remediate).length, base.length)),
  top20: [...base].sort((a, b) => b.RRI - a.RRI).slice(0, 20).map(x => ({ eco: ENAME[x.eco], name: x.name, C: r2(x.C), A: r2(x.A), V: r2(x.V), RRI: r2(x.RRI), resp: x.resp })) };
// SCA blind spot: high-criticality, high-abandonment packages with no current advisory.
const hiHi = base.filter(x => x.C >= 0.5 && x.A >= 0.5); const pkBy = new Map(pk.map(p => [p.eco + '|' + p.name, p]));
R.cdrf.blindspot = { highC_highA: hiHi.length, no_current_advisory: hiHi.filter(x => pkBy.get(x.eco + '|' + x.name).cur_adv === 0).length };
R.cdrf.blindspot.pct = r2(pct(R.cdrf.blindspot.no_current_advisory, R.cdrf.blindspot.highC_highA));
// top-decile overlap between CDRF ranking and a vulnerability-only (SCA-like) ranking
const k = Math.ceil(base.length * 0.1); const topC = new Set([...base].sort((a, b) => b.RRI - a.RRI).slice(0, k).map(x => x.eco + x.name)); const topV = new Set([...base].sort((a, b) => b.V - a.V || b.C - a.C).slice(0, k).map(x => x.eco + x.name));
R.cdrf.top_decile_overlap = r2(pct([...topC].filter(x => topV.has(x)).length, k));
// sensitivity analysis
const variants = [['Baseline (A 0.6 / V 0.4; thresholds 0.5)', { a: 0.6, v: 0.4 }, { c: 0.5, a: 0.5 }], ['Equal weights (0.5 / 0.5)', { a: 0.5, v: 0.5 }, { c: 0.5, a: 0.5 }], ['Abandonment-heavy (0.8 / 0.2)', { a: 0.8, v: 0.2 }, { c: 0.5, a: 0.5 }], ['Vulnerability-heavy (0.3 / 0.7)', { a: 0.3, v: 0.7 }, { c: 0.5, a: 0.5 }], ['Stricter thresholds (0.67)', { a: 0.6, v: 0.4 }, { c: 0.67, a: 0.67 }], ['Looser thresholds (0.33)', { a: 0.6, v: 0.4 }, { c: 0.33, a: 0.33 }]];
const baseRank = new Map(base.map(x => [x.eco + x.name, x.RRI]));
R.sensitivity = variants.map(([label, w, t]) => { const v = cdrf(w, t); const rho = S.spearman(v.map(x => baseRank.get(x.eco + x.name)), v.map(x => x.RRI)).rho; const tv = new Set([...v].sort((a, b) => b.RRI - a.RRI).slice(0, k).map(x => x.eco + x.name)); const agree = v.filter((x, i) => x.resp === base[i].resp).length; return { label, rho: r3(rho), topdecile_jaccard: r2([...tv].filter(x => topC.has(x)).length / new Set([...tv, ...topC]).size), resp_agreement: r2(pct(agree, v.length)) }; });
fs.writeFileSync(path.join(OUT, 'cdrf_scores.json'), JSON.stringify(base.map(x => ({ ...x, C: r3(x.C), A: r3(x.A), V: r3(x.V), E: r3(x.E), RRI: r2(x.RRI) }))));
R.model2_params = { means: means2, sds: sds2, b: m2.b, names: n2 };

// ---------- Figures ----------
const F = {};
// F1 rank-frequency of ecosystem dependents (log-log)
F.dep_ccdf = ch.render(ch.scatter({ title: 'Ecosystem in-degree of sampled packages (log-log)', pts: ecos.flatMap(e => pk.filter(p => p.eco === e).map(p => ({ x: p.rank, y: p.dependents, color: ECOL[e] }))), xLabel: 'Rank by number of dependent packages (log scale)', yLabel: 'Dependent packages (log scale)', logX: true, logY: true, legend: ecos.map(e => ({ name: ENAME[e], color: ECOL[e] })) }), path.join(FIG, 'f_dep_rank.png'));
// F2 direct vs transitive (median) per ecosystem
F.tree = ch.render(ch.bars({ title: 'Median direct and transitive dependencies per package', groups: ecos.map(e => { const a = g.filter(p => p.eco === e); return { label: ENAME[e], values: [S.median(a.map(p => p.n_direct)), S.median(a.map(p => p.n_indirect)), S.median(a.map(p => p.depth))] }; }), series: [{ name: 'Direct dependencies', color: ch.C.a }, { name: 'Transitive dependencies', color: ch.C.b }, { name: 'Depth (levels)', color: ch.C.c }], yLabel: 'Median count' }), path.join(FIG, 'f_tree.png'));
// F3 vulnerable tree share by depth
F.depth = ch.render(ch.bars({ title: 'Packages whose resolved tree contains a known-vulnerable dependency, by depth', groups: R.h3.by_depth.map(d => ({ label: `Depth ${d.label}\n(n=${d.n})`, values: [d.pct] })), series: [{ name: '% with vulnerable node', color: ch.C.b }], yLabel: '% of packages', pct: true }), path.join(FIG, 'f_depth.png'));
// F4 forest H1
F.h1 = ch.render(ch.forest({ title: 'Odds of any historical advisory (H1), standardised predictors', rows: R.h1.model.coefs.slice(1).map(c => ({ label: c.name, est: c.or, lo: c.lo, hi: c.hi })), xLabel: 'Odds ratio (95% CI, log scale)' }), path.join(FIG, 'f_h1.png'));
// F5 forest H3
F.h3 = ch.render(ch.forest({ title: 'Odds of a known-vulnerable node in the resolved tree (H3)', rows: R.h3.model.coefs.slice(1).map(c => ({ label: c.name, est: c.or, lo: c.lo, hi: c.hi })), xLabel: 'Odds ratio (95% CI, log scale)' }), path.join(FIG, 'f_h3.png'));
// F6 dormancy by stratum x eco
F.dorm = ch.render(ch.bars({ title: 'Packages active in Nov 2024 that went dormant by Nov 2026', groups: ['A', 'B', 'C'].map(s => ({ label: { A: 'Rank 1-100', B: 'Rank 101-1,000', C: 'Rank 1,001-10,000' }[s], values: ecos.map(e => { const a = cohort.filter(p => p.stratum === s && p.eco === e); return pct(a.filter(p => p.became_dormant).length, a.length); }) })), series: ecos.map(e => ({ name: ENAME[e], color: ECOL[e] })), yLabel: '% became dormant', pct: true }), path.join(FIG, 'f_dormancy.png'));
// F7 forest H2
F.h2 = ch.render(ch.forest({ title: 'Odds of going dormant within 24 months (H2)', rows: R.h2.model.coefs.slice(1).map(c => ({ label: c.name, est: c.or, lo: c.lo, hi: c.hi })), xLabel: 'Odds ratio (95% CI, log scale)' }), path.join(FIG, 'f_h2.png'));
// F8 CDRF quadrant
const RC = { 'Accept and monitor': ch.C.mute, Sustain: ch.C.a, Migrate: ch.C.b, 'Support or fork': ch.C.d };
F.quad = ch.render(cdrfQuadrant(base), path.join(FIG, 'f_quadrant.png'));
function cdrfQuadrant(rows) { const w = 820, h = 560, m = { l: 80, r: 30, t: 50, b: 80 }; const pw = w - m.l - m.r, ph = h - m.t - m.b; const X = v => m.l + v * pw, Y = v => m.t + ph - v * ph; let s = ''; for (const t of [0, 0.25, 0.5, 0.75, 1]) s += `<line x1="${X(0)}" x2="${X(1)}" y1="${Y(t)}" y2="${Y(t)}" stroke="${ch.C.grid}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="12" fill="${ch.C.axis}">${t}</text><text x="${X(t)}" y="${m.t + ph + 18}" text-anchor="middle" font-size="12" fill="${ch.C.axis}">${t}</text>`; s += `<line x1="${X(0.5)}" x2="${X(0.5)}" y1="${Y(0)}" y2="${Y(1)}" stroke="${ch.C.ink}" stroke-dasharray="5 4"/><line x1="${X(0)}" x2="${X(1)}" y1="${Y(0.5)}" y2="${Y(0.5)}" stroke="${ch.C.ink}" stroke-dasharray="5 4"/>`; rows.forEach(r => s += `<circle cx="${X(r.C)}" cy="${Y(Math.min(1, r.A))}" r="3.5" fill="${RC[r.resp]}" fill-opacity="0.6"/>`); const lab = [[0.25, 0.97, 'MIGRATE'], [0.75, 0.97, 'SUPPORT OR FORK'], [0.25, 0.04, 'ACCEPT AND MONITOR'], [0.75, 0.04, 'SUSTAIN']]; lab.forEach(([x, y, t]) => s += `<text x="${X(x)}" y="${Y(y)}" text-anchor="middle" font-size="13" font-weight="bold" fill="${ch.C.ink}" fill-opacity="0.75">${t}</text>`); s += `<text x="${m.l + pw / 2}" y="${h - 40}" text-anchor="middle" font-size="13" fill="${ch.C.ink}">Criticality C (ecosystem network position, percentile)</text><text transform="translate(20 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="${ch.C.ink}">Abandonment likelihood A</text>`; Object.entries(RC).forEach(([k2, c], j) => { s += `<circle cx="${m.l + j * 175 + 6}" cy="${h - 16}" r="6" fill="${c}"/><text x="${m.l + j * 175 + 16}" y="${h - 12}" font-size="12" fill="${ch.C.ink}">${k2}</text>`; }); return ch.frame(w, h, 'CDRF decision quadrant for all sampled packages', s); }
// F9 response distribution
F.resp = ch.render(ch.bars({ title: 'Recommended CDRF response by ecosystem', groups: R.cdrf.responses.map(r => ({ label: r.resp, values: r.by_eco.map((n, i) => pct(n, pk.filter(p => p.eco === ecos[i]).length)) })), series: ecos.map(e => ({ name: ENAME[e], color: ECOL[e] })), yLabel: '% of ecosystem sample', pct: true }), path.join(FIG, 'f_responses.png'));
R.figs = F;
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(R, null, 1));
fs.writeFileSync(path.join(OUT, 'packages.json'), JSON.stringify(pk.map(({ nodes, edges, vuln_detail, ...rest }) => rest)));
console.log(JSON.stringify({ n: R.n, sample: R.sample, desc: R.desc, h1: R.h1, h3: R.h3, h2: { ...R.h2 }, dormant_now: R.dormant_now, cdrf: R.cdrf, sens: R.sensitivity, union: Object.fromEntries(Object.entries(R.union).map(([k, v]) => [k, { ...v, top_betweenness: v.top_betweenness.slice(0, 5), top_indegree: v.top_indegree.slice(0, 5) }])), conc: R.concentration, sc: R.scorecard_maintained, tst: R.tree_share_transitive }, null, 1));
