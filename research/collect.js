// Data collection for the CDRF study.
// Sources: ecosyste.ms Packages API (sampling frame), deps.dev API (versions, resolved
// dependency graphs, dependent counts, OpenSSF Scorecard), OSV.dev (vulnerabilities).
// All responses are cached under data/raw so the run is reproducible and resumable.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UA = { 'User-Agent': 'academic-dependency-resilience-study/1.0 (non-commercial university research)' };
const RAW = path.join(__dirname, 'data', 'raw');
fs.mkdirSync(RAW, { recursive: true });

// Seeded PRNG (mulberry32) so the sample can be regenerated exactly.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20260720);
function sampleRanks(lo, hi, n) { const s = new Set(); while (s.size < n) s.add(lo + Math.floor(rand() * (hi - lo + 1))); return [...s].sort((a, b) => a - b); }

const ECOS = {
  npm:   { reg: 'npmjs.org',       deps: 'npm',   osv: 'npm',   strata: [[1, 100, 50], [101, 1000, 100], [1001, 10000, 150]] },
  pypi:  { reg: 'pypi.org',        deps: 'pypi',  osv: 'PyPI',  strata: [[1, 100, 40], [101, 1000, 80], [1001, 10000, 130]] },
  maven: { reg: 'repo1.maven.org', deps: 'maven', osv: 'Maven', strata: [[1, 100, 40], [101, 1000, 80], [1001, 10000, 130]] },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function cached(key, fn) {
  const f = path.join(RAW, crypto.createHash('sha1').update(key).digest('hex') + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = await fn();
  fs.writeFileSync(f, JSON.stringify(v));
  return v;
}
async function getJSON(url, opts = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } });
      if (r.status === 404) return { __status: 404 };
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      if (!r.ok) return { __status: r.status, __body: (await r.text()).slice(0, 300) };
      return await r.json();
    } catch (e) { await sleep(1500 * (i + 1)); }
  }
  return { __status: 'failed' };
}
const enc = encodeURIComponent;
async function pool(items, n, fn) { let i = 0; const out = new Array(items.length); await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

function trimFrame(p, rank, stratum, eco) {
  const rm = p.repo_metadata || {};
  return {
    eco, rank, stratum, name: p.name,
    dependents_packages: p.dependent_packages_count, dependents_repos: p.dependent_repos_count,
    downloads: p.downloads, downloads_period: p.downloads_period,
    versions_count: p.versions_count, first_release: p.first_release_published_at, latest_release: p.latest_release_published_at,
    status: p.status, critical: p.critical, maintainers_count: Array.isArray(p.maintainers) ? p.maintainers.length : null,
    funding_links: (p.funding_links || []).length, advisories_ecosystems: (p.advisories || []).length,
    repository_url: p.repository_url, licenses: p.licenses,
    repo: rm.full_name ? { archived: rm.archived, pushed_at: rm.pushed_at, stars: rm.stargazers_count, forks: rm.forks_count, open_issues: rm.open_issues_count, owner_kind: rm.owner_record ? rm.owner_record.kind : null, has_security_md: !!(rm.metadata && rm.metadata.files && rm.metadata.files.security), has_funding: !!(rm.metadata && rm.metadata.files && rm.metadata.files.funding) } : null,
    issues: p.issue_metadata ? { issues_count: p.issue_metadata.issues_count, avg_close_days: p.issue_metadata.avg_time_to_close_issue ? p.issue_metadata.avg_time_to_close_issue / 86400 : null, past_year_issues: p.issue_metadata.past_year_issues_count, past_year_committers: p.issue_metadata.past_year_issue_authors_count, maintainers: (p.issue_metadata.maintainers || []).length, active_maintainers: (p.issue_metadata.active_maintainers || []).length } : null,
  };
}

async function frame(ecoKey) {
  const E = ECOS[ecoKey];
  const want = [];
  for (const [lo, hi, n] of E.strata) for (const r of sampleRanks(lo, hi, n)) want.push({ rank: r, stratum: lo === 1 ? 'A' : lo === 101 ? 'B' : 'C' });
  const pages = [...new Set(want.map(w => Math.ceil(w.rank / 100)))];
  const pageData = {};
  await pool(pages, 3, async pg => {
    pageData[pg] = await cached(`frame:${E.reg}:${pg}`, async () => {
      const j = await getJSON(`https://packages.ecosyste.ms/api/v1/registries/${E.reg}/packages?sort=dependent_packages_count&order=desc&per_page=100&page=${pg}`);
      await sleep(400);
      return j;
    });
  });
  return want.map(w => { const pg = pageData[Math.ceil(w.rank / 100)]; const p = Array.isArray(pg) ? pg[(w.rank - 1) % 100] : null; return p ? trimFrame(p, w.rank, w.stratum, ecoKey) : null; }).filter(Boolean);
}

async function enrich(pkg) {
  const E = ECOS[pkg.eco];
  const base = `https://api.deps.dev/v3/systems/${E.deps}/packages/${enc(pkg.name)}`;
  const info = await cached(`deps:pkg:${pkg.eco}:${pkg.name}`, () => getJSON(base));
  if (!info.versions) return { ...pkg, depsdev: false };
  const versions = info.versions.filter(v => v.publishedAt).map(v => ({ v: v.versionKey.version, t: v.publishedAt, def: v.isDefault, dep: v.isDeprecated }));
  const def = info.versions.find(v => v.isDefault) || info.versions[info.versions.length - 1];
  const ver = def.versionKey.version;
  const vurl = `${base}/versions/${enc(ver)}`;
  const [vinfo, graph, dependents] = await Promise.all([
    cached(`deps:ver:${pkg.eco}:${pkg.name}:${ver}`, () => getJSON(vurl)),
    cached(`deps:graph:${pkg.eco}:${pkg.name}:${ver}`, () => getJSON(vurl + ':dependencies')),
    cached(`deps:dependents:${pkg.eco}:${pkg.name}:${ver}`, () => getJSON(`https://api.deps.dev/v3alpha/systems/${E.deps}/packages/${enc(pkg.name)}/versions/${enc(ver)}:dependents`)),
  ]);
  let scorecard = null, project = null;
  const proj = (vinfo.relatedProjects || []).find(p => p.relationType === 'SOURCE_REPO') || (vinfo.relatedProjects || [])[0];
  if (proj) {
    const pj = await cached(`deps:project:${proj.projectKey.id}`, () => getJSON(`https://api.deps.dev/v3/projects/${enc(proj.projectKey.id)}`));
    if (pj && !pj.__status) {
      project = { id: proj.projectKey.id, stars: pj.starsCount, forks: pj.forksCount, openIssues: pj.openIssuesCount };
      if (pj.scorecard) scorecard = { overall: pj.scorecard.overallScore, date: pj.scorecard.date, checks: Object.fromEntries((pj.scorecard.checks || []).map(c => [c.name, c.score])) };
    }
  }
  // Historical advisories for the package (any version).
  const hist = await cached(`osv:pkg:${E.osv}:${pkg.name}`, () => getJSON('https://api.osv.dev/v1/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package: { name: pkg.name, ecosystem: E.osv } }) }));
  const histVulns = (hist.vulns || []).filter(v => !v.withdrawn).map(v => ({ id: v.id, published: v.published, sev: (v.database_specific && v.database_specific.severity) || null, aliases: (v.aliases || []).filter(a => a.startsWith('CVE')) }));
  const nodes = graph.nodes ? graph.nodes.map(n => ({ name: n.versionKey.name, version: n.versionKey.version, rel: n.relation })) : [];
  const edges = graph.edges ? graph.edges.map(e => [e.fromNode, e.toNode]) : [];
  return {
    ...pkg, depsdev: true, default_version: ver, versions,
    licenses_dd: vinfo.licenses, advisoryKeys_latest: (vinfo.advisoryKeys || []).map(a => a.id),
    dependents_dd: dependents && !dependents.__status ? dependents : null,
    graph_ok: !!graph.nodes, graph_error: graph.error || null, nodes, edges,
    project, scorecard, hist_vulns: histVulns,
  };
}

// OSV querybatch: which resolved transitive nodes carry known vulnerabilities.
async function osvExposure(pkgs) {
  const uniq = new Map();
  for (const p of pkgs) for (const n of (p.nodes || []).slice(1)) uniq.set(`${p.eco}|${n.name}|${n.version}`, { eco: ECOS[p.eco].osv, name: n.name, version: n.version });
  const keys = [...uniq.keys()];
  const res = {};
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500);
    const out = await cached('osv:batch:' + chunk.join(','), () => getJSON('https://api.osv.dev/v1/querybatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries: chunk.map(k => { const q = uniq.get(k); return { package: { name: q.name, ecosystem: q.eco }, version: q.version }; }) }) }));
    (out.results || []).forEach((r, j) => { res[chunk[j]] = (r.vulns || []).map(v => v.id); });
    process.stdout.write(`osv batch ${i / 500 + 1}/${Math.ceil(keys.length / 500)}\r`);
  }
  return res;
}

(async () => {
  const all = [];
  for (const eco of Object.keys(ECOS)) {
    const f = await frame(eco);
    console.log(eco, 'frame sample', f.length);
    let done = 0;
    const rich = await pool(f, 6, async p => { const r = await enrich(p); if (++done % 25 === 0) console.log(eco, done, '/', f.length); return r; });
    all.push(...rich);
  }
  console.log('total', all.length, 'with deps.dev', all.filter(p => p.depsdev).length, 'graphs', all.filter(p => p.graph_ok).length);
  const exp = await osvExposure(all);
  for (const p of all) {
    const vulnNodes = (p.nodes || []).slice(1).filter(n => (exp[`${p.eco}|${n.name}|${n.version}`] || []).length);
    p.transitive_vuln_nodes = vulnNodes.map(n => ({ name: n.name, version: n.version, rel: n.rel, ids: exp[`${p.eco}|${n.name}|${n.version}`] }));
  }
  fs.writeFileSync(path.join(__dirname, 'data', 'sample.json'), JSON.stringify(all));
  console.log('\nwrote data/sample.json');
})();
