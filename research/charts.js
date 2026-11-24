// Minimal SVG chart helpers rendered to PNG with resvg (no browser needed).
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const FONT = 'Arial';
const C = { ink: '#1f2933', grid: '#d9dee5', axis: '#6b7280', npm: '#c2410c', pypi: '#1d4ed8', maven: '#15803d', a: '#1d4ed8', b: '#c2410c', c: '#15803d', d: '#7c3aed', mute: '#9ca3af' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = v => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : (Number.isInteger(v) ? String(v) : v.toFixed(v < 1 ? 2 : 1)));

function render(svg, file, width = 1600) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file.replace(/\.png$/, '.svg'), svg);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true, defaultFontFamily: FONT } }).render().asPng();
  fs.writeFileSync(file, png);
  return file;
}
function frame(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}"><rect width="${w}" height="${h}" fill="#ffffff"/>${title ? `<text x="${w / 2}" y="28" text-anchor="middle" font-size="17" font-weight="bold" fill="${C.ink}">${esc(title)}</text>` : ''}${body}</svg>`;
}
function niceTicks(min, max, n = 5) { const span = max - min || 1; const step0 = span / n; const mag = Math.pow(10, Math.floor(Math.log10(step0))); const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag; const t = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) t.push(+v.toFixed(10)); return t; }

// Grouped bar chart. groups: [{label, values:[..]}], series: [{name,color}]
function bars({ title, groups, series, yLabel, w = 800, h = 440, yMax, pct = false, valueLabels = true }) {
  const m = { l: 70, r: 20, t: 50, b: 80 }; const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const max = yMax || Math.max(...groups.flatMap(g => g.values)) * 1.15 || 1;
  const ticks = niceTicks(0, max); const top = ticks[ticks.length - 1] < max ? max : ticks[ticks.length - 1];
  const y = v => m.t + ph - (v / top) * ph; let s = '';
  for (const t of ticks) s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${C.grid}"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="${C.axis}">${pct ? t + '%' : fmt(t)}</text>`;
  const gw = pw / groups.length, bw = Math.min(46, (gw * 0.75) / series.length);
  groups.forEach((g, i) => {
    const x0 = m.l + i * gw + (gw - bw * series.length) / 2;
    g.values.forEach((v, j) => { const x = x0 + j * bw; s += `<rect x="${x}" y="${y(v)}" width="${bw - 3}" height="${m.t + ph - y(v)}" fill="${series[j].color}"/>`; if (valueLabels) s += `<text x="${x + (bw - 3) / 2}" y="${y(v) - 5}" text-anchor="middle" font-size="11" fill="${C.ink}">${pct ? v.toFixed(1) + '%' : fmt(v)}</text>`; });
    const lines = String(g.label).split('\n'); lines.forEach((ln, k) => s += `<text x="${m.l + i * gw + gw / 2}" y="${m.t + ph + 18 + k * 14}" text-anchor="middle" font-size="12" fill="${C.ink}">${esc(ln)}</text>`);
  });
  s += `<line x1="${m.l}" x2="${w - m.r}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="${C.axis}"/>`;
  s += `<text transform="translate(18 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="${C.ink}">${esc(yLabel || '')}</text>`;
  if (series.length > 1) series.forEach((se, j) => { const lx = m.l + j * 170; s += `<rect x="${lx}" y="${h - 22}" width="12" height="12" fill="${se.color}"/><text x="${lx + 18}" y="${h - 12}" font-size="12" fill="${C.ink}">${esc(se.name)}</text>`; });
  return frame(w, h, title, s);
}

// Scatter with optional log axes. pts: [{x,y,color}]
function scatter({ title, pts, xLabel, yLabel, logX, logY, w = 800, h = 480, legend = [], fit }) {
  const m = { l: 75, r: 20, t: 50, b: 70 }; const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const tx = v => (logX ? Math.log10(v + 1) : v), ty = v => (logY ? Math.log10(v + 1) : v);
  const xs = pts.map(p => tx(p.x)), ys = pts.map(p => ty(p.y));
  const x0 = Math.min(0, ...xs), x1 = Math.max(...xs) * 1.03 || 1, y0 = Math.min(0, ...ys), y1 = Math.max(...ys) * 1.08 || 1;
  const X = v => m.l + ((v - x0) / (x1 - x0)) * pw, Y = v => m.t + ph - ((v - y0) / (y1 - y0)) * ph; let s = '';
  const tick = (lo, hi, log) => log ? Array.from({ length: Math.floor(hi) + 1 }, (_, i) => i).filter(i => i >= lo) : niceTicks(lo, hi);
  for (const t of tick(y0, y1, logY)) s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="${C.grid}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="12" fill="${C.axis}">${logY ? fmt(Math.pow(10, t)) : fmt(t)}</text>`;
  for (const t of tick(x0, x1, logX)) s += `<line x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${m.t + ph}" stroke="${C.grid}"/><text x="${X(t)}" y="${m.t + ph + 18}" text-anchor="middle" font-size="12" fill="${C.axis}">${logX ? fmt(Math.pow(10, t)) : fmt(t)}</text>`;
  pts.forEach(p => s += `<circle cx="${X(tx(p.x))}" cy="${Y(ty(p.y))}" r="3.6" fill="${p.color || C.a}" fill-opacity="0.55"/>`);
  if (fit) s += `<line x1="${X(x0)}" y1="${Y(fit.a + fit.b * x0)}" x2="${X(x1)}" y2="${Y(fit.a + fit.b * x1)}" stroke="${C.ink}" stroke-width="2" stroke-dasharray="6 4"/>`;
  s += `<text x="${m.l + pw / 2}" y="${h - 25}" text-anchor="middle" font-size="13" fill="${C.ink}">${esc(xLabel)}</text><text transform="translate(18 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="${C.ink}">${esc(yLabel)}</text>`;
  legend.forEach((l, j) => { const lx = m.l + 10 + j * 120; s += `<circle cx="${lx}" cy="${m.t + 10}" r="5" fill="${l.color}"/><text x="${lx + 10}" y="${m.t + 14}" font-size="12" fill="${C.ink}">${esc(l.name)}</text>`; });
  return frame(w, h, title, s);
}

// Step curves (Kaplan-Meier). curves: [{name,color,pts:[[t,S]]}]
function steps({ title, curves, xLabel, yLabel, w = 800, h = 460, xMax }) {
  const m = { l: 70, r: 20, t: 50, b: 80 }; const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const xm = xMax || Math.max(...curves.flatMap(c => c.pts.map(p => p[0]))); const X = v => m.l + (v / xm) * pw, Y = v => m.t + ph - v * ph; let s = '';
  for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="${C.grid}"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="12" fill="${C.axis}">${(t * 100).toFixed(0)}%</text>`;
  for (const t of niceTicks(0, xm)) s += `<text x="${X(t)}" y="${m.t + ph + 18}" text-anchor="middle" font-size="12" fill="${C.axis}">${fmt(t)}</text>`;
  curves.forEach(c => { let d = `M${X(0)},${Y(1)}`; let prev = 1; c.pts.forEach(([t, S]) => { d += ` L${X(t)},${Y(prev)} L${X(t)},${Y(S)}`; prev = S; }); d += ` L${X(xm)},${Y(prev)}`; s += `<path d="${d}" fill="none" stroke="${c.color}" stroke-width="2.5"/>`; });
  s += `<text x="${m.l + pw / 2}" y="${h - 40}" text-anchor="middle" font-size="13" fill="${C.ink}">${esc(xLabel)}</text><text transform="translate(18 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="${C.ink}">${esc(yLabel)}</text>`;
  curves.forEach((c, j) => { const lx = m.l + j * 200; s += `<rect x="${lx}" y="${h - 22}" width="14" height="4" fill="${c.color}"/><text x="${lx + 20}" y="${h - 16}" font-size="12" fill="${C.ink}">${esc(c.name)}</text>`; });
  return frame(w, h, title, s);
}

// Horizontal bars (e.g. odds ratios / coefficients with CI). rows: [{label, est, lo, hi}]
function forest({ title, rows, xLabel, ref = 1, log = true, w = 820, h }) {
  h = h || 90 + rows.length * 34; const m = { l: 260, r: 40, t: 50, b: 50 }; const pw = w - m.l - m.r;
  const tv = v => (log ? Math.log10(v) : v); const all = rows.flatMap(r => [r.lo, r.hi]).concat(ref).map(tv);
  const lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || 0.1; const a = lo - pad, b = hi + pad;
  const X = v => m.l + ((tv(v) - a) / (b - a)) * pw; let s = '';
  s += `<line x1="${X(ref)}" x2="${X(ref)}" y1="${m.t - 5}" y2="${m.t + rows.length * 34}" stroke="${C.axis}" stroke-dasharray="4 4"/>`;
  const tks = log ? [0.25, 0.5, 1, 2, 4, 8, 16, 32].filter(v => tv(v) >= a && tv(v) <= b) : niceTicks(a, b);
  tks.forEach(t => s += `<text x="${X(t)}" y="${m.t + rows.length * 34 + 18}" text-anchor="middle" font-size="12" fill="${C.axis}">${t}</text>`);
  rows.forEach((r, i) => { const yy = m.t + 17 + i * 34; const sig = r.lo > ref || r.hi < ref; s += `<text x="${m.l - 12}" y="${yy + 4}" text-anchor="end" font-size="13" fill="${C.ink}">${esc(r.label)}</text><line x1="${X(r.lo)}" x2="${X(r.hi)}" y1="${yy}" y2="${yy}" stroke="${C.ink}" stroke-width="2"/><rect x="${X(r.est) - 6}" y="${yy - 6}" width="12" height="12" fill="${sig ? C.b : C.mute}"/>`; });
  s += `<text x="${m.l + pw / 2}" y="${h - 10}" text-anchor="middle" font-size="13" fill="${C.ink}">${esc(xLabel)}</text>`;
  return frame(w, h, title, s);
}

module.exports = { render, bars, scatter, steps, forest, frame, esc, C, fmt };
