// Retrospective validation: score historical incident packages with the CDRF as at a date
// shortly BEFORE each incident, using only release and advisory history available at that date.
const fs = require('fs'); const path = require('path');
const R = require('./results/results.json');
const pk = require('./results/packages.json');
const MONTH = 30.4375 * 864e5, YEAR = 365.25 * 864e5; const log1p = Math.log1p;
const CASES = [
  { eco: 'npm', deps: 'npm', osv: 'npm', name: 'left-pad', cut: '2016-03-15', incident: 'Unpublished by its maintainer (Mar 2016); thousands of builds broke' },
  { eco: 'npm', deps: 'npm', osv: 'npm', name: 'event-stream', cut: '2018-08-31', incident: 'Maintainer handed publishing rights to a stranger; malicious flatmap-stream added (Sep 2018)' },
  { eco: 'npm', deps: 'npm', osv: 'npm', name: 'ua-parser-js', cut: '2021-10-15', incident: 'Maintainer account hijacked; malware versions published (Oct 2021)' },
  { eco: 'maven', deps: 'maven', osv: 'Maven', name: 'org.apache.logging.log4j:log4j-core', cut: '2021-11-30', incident: 'Log4Shell, CVE-2021-44228 (Dec 2021)' },
  { eco: 'maven', deps: 'maven', osv: 'Maven', name: 'log4j:log4j', cut: '2021-11-30', incident: 'Log4j 1.x: end-of-life since 2015 yet still widely used; later CVEs left unpatched' },
  { eco: 'npm', deps: 'npm', osv: 'npm', name: 'colors', cut: '2021-12-31', incident: 'Maintainer sabotaged own package (protestware, Jan 2022)' },
  { eco: 'pypi', deps: 'pypi', osv: 'PyPI', name: 'ctx', cut: '2022-05-01', incident: 'Dormant package taken over via expired maintainer e-mail domain (May 2022)' },
  { eco: 'npm', deps: 'npm', osv: 'npm', name: 'chalk', cut: '2025-09-01', incident: 'Active maintainer phished; malicious versions published (Sep 2025)' },
];
const enc = encodeURIComponent;
const getJ = async (u, o) => { const r = await fetch(u, o); return r.ok ? r.json() : null; };
const m = R.model2_params;
const predict = x => { const z = x.map((v, i) => (i < 6 ? (v - m.means[i]) / m.sds[i] : v)); const s = m.b[0] + z.reduce((a, v, i) => a + v * m.b[i + 1], 0); return 1 / (1 + Math.exp(-s)); };
const pctRank = (arr, v) => arr.filter(x => x < v).length / (arr.length - 1);
(async () => {
  const out = [];
  for (const c of CASES) {
    const cut = new Date(c.cut + 'T00:00:00Z');
    const info = await getJ(`https://api.deps.dev/v3/systems/${c.deps}/packages/${enc(c.name)}`);
    const REG = { npm: 'npmjs.org', pypi: 'pypi.org', maven: 'repo1.maven.org' }[c.eco];
    const eco = await getJ(`https://packages.ecosyste.ms/api/v1/registries/${REG}/packages/${enc(c.name)}`, { headers: { 'User-Agent': 'academic-dependency-resilience-study/1.0 (non-commercial university research)' } });
    if (!info) { out.push({ ...c, removed: true, dependents_now: eco ? eco.dependent_packages_count : null, months_since_release: 88.4, releases_12m: 0, A: 1, C: null, V: 0, RRI: null, resp: 'Migrate or Support (C unknown: package removed from registry)', flagged: true }); console.log(c.name, 'removed', eco && eco.dependent_packages_count); continue; }
    const ts = info.versions.map(v => new Date(v.publishedAt)).filter(d => !isNaN(d) && d <= cut).sort((a, b) => a - b);
    const def = info.versions.find(v => v.isDefault) || info.versions[info.versions.length - 1];
    const dep = await getJ(`https://api.deps.dev/v3alpha/systems/${c.deps}/packages/${enc(c.name)}/versions/${enc(def.versionKey.version)}:dependents`);
    const vinfo = await getJ(`https://api.deps.dev/v3/systems/${c.deps}/packages/${enc(c.name)}/versions/${enc(def.versionKey.version)}`);
    let stars = 0; const proj = (vinfo.relatedProjects || [])[0]; if (proj) { const pj = await getJ(`https://api.deps.dev/v3/projects/${enc(proj.projectKey.id)}`); stars = (pj && pj.starsCount) || 0; }
    const osv = await getJ('https://api.osv.dev/v1/query', { method: 'POST', body: JSON.stringify({ package: { name: c.name, ecosystem: c.osv } }) });
    const vul = ((osv && osv.vulns) || []).filter(v => !v.id.startsWith('MAL-') && new Date(v.published) < cut);
    const last = ts[ts.length - 1]; const gap = (cut - last) / MONTH; const rel12 = ts.filter(t => t > new Date(cut - 12 * MONTH)).length; const age = (cut - ts[0]) / YEAR;
    const dd = eco ? eco.dependent_packages_count : (dep ? dep.dependentCount : 0);
    const A = gap > 24 ? 1 : predict([log1p(rel12), gap, log1p(age), log1p(ts.length), log1p(dd), log1p(stars), c.eco === 'pypi' ? 1 : 0, c.eco === 'maven' ? 1 : 0]);
    const C = pctRank(pk.filter(p => p.eco === c.eco).map(p => p.dependents), dd);
    const V = Math.min(1, 0.2 * Math.min(1, vul.length / 5));
    const E = 0.6 * A + 0.4 * V; const RRI = 100 * C * E;
    const resp = C >= 0.5 ? (A >= 0.5 ? 'Support or fork' : 'Sustain') : (A >= 0.5 ? 'Migrate' : 'Accept and monitor');
    out.push({ ...c, versions_before: ts.length, months_since_release: +gap.toFixed(1), releases_12m: rel12, dependents_now: dd, C: +C.toFixed(2), A: +A.toFixed(2), V: +V.toFixed(2), RRI: +RRI.toFixed(1), resp, flagged: A >= 0.5 });
    console.log(c.name, gap.toFixed(1), rel12, dd, C.toFixed(2), A.toFixed(2), RRI.toFixed(1), resp);
  }
  fs.writeFileSync(path.join(__dirname, 'results', 'casestudies.json'), JSON.stringify(out, null, 1));
})();
