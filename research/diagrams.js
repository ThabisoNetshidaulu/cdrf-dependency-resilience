// Conceptual diagrams for Chapters 1-3 (SVG -> PNG).
const path = require('path'); const ch = require('./charts');
const FIG = path.join(__dirname, 'results', 'fig'); const esc = ch.esc;
const box = (x, y, w, h, fill, stroke, lines, opts = {}) => { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`; const lh = opts.lh || 18; const y0 = y + h / 2 - ((lines.length - 1) * lh) / 2 + 5; lines.forEach((l, i) => s += `<text x="${x + w / 2}" y="${y0 + i * lh}" text-anchor="middle" font-size="${i === 0 && opts.bold !== false ? 15 : 13}" ${i === 0 && opts.bold !== false ? 'font-weight="bold"' : ''} fill="#1f2933">${esc(l)}</text>`); return s; };
const arrow = (x1, y1, x2, y2, label) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#374151" stroke-width="2" marker-end="url(#ah)"/>${label ? `<text x="${(x1 + x2) / 2 + 6}" y="${(y1 + y2) / 2 - 6}" font-size="12" fill="#374151">${esc(label)}</text>` : ''}`;
const defs = `<defs><marker id="ah" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#374151"/></marker></defs>`;

// Figure: CDRF conceptual framework
{
  const w = 1000, h = 620; let s = defs;
  s += `<text x="40" y="70" font-size="14" font-weight="bold" fill="#15305d">1. EVIDENCE (public data)</text><text x="370" y="70" font-size="14" font-weight="bold" fill="#15305d">2. RISK DIMENSIONS</text><text x="700" y="70" font-size="14" font-weight="bold" fill="#15305d">3. DECISION</text>`;
  s += box(30, 90, 280, 100, '#eef2ff', '#1d4ed8', ['Dependency network', 'ecosystem dependents (in-degree)', 'resolved tree: direct, transitive, depth']);
  s += box(30, 215, 280, 100, '#fff7ed', '#c2410c', ['Maintenance activity', 'release history and recency', 'versions, age, archived or deprecated']);
  s += box(30, 340, 280, 100, '#fef2f2', '#b91c1c', ['Vulnerability records', 'OSV advisories: current version,', 'tree nodes and history']);
  s += box(370, 90, 260, 100, '#e0e7ff', '#1d4ed8', ['C: Criticality', 'impact if it fails', '(network position percentile)']);
  s += box(370, 215, 260, 100, '#ffedd5', '#c2410c', ['A: Abandonment likelihood', 'P(dormant within 24 months)', '(logistic model)']);
  s += box(370, 340, 260, 100, '#fee2e2', '#b91c1c', ['V: Vulnerability exposure', 'known and inherited', 'advisories']);
  s += arrow(310, 140, 368, 140) + arrow(310, 265, 368, 265) + arrow(310, 390, 368, 390) + `<line x1="310" y1="170" x2="368" y2="250" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#ah)"/>`;
  s += box(690, 120, 280, 110, '#f5f3ff', '#7c3aed', ['Resilience Risk Index', 'RRI = 100 × C × (0.6A + 0.4V)', 'impact × likelihood ranking']);
  s += arrow(630, 140, 688, 160) + arrow(630, 265, 688, 195) + arrow(630, 390, 688, 215);
  // quadrant
  const qx = 690, qy = 270, qw = 280, qh = 190; s += `<rect x="${qx}" y="${qy}" width="${qw}" height="${qh}" fill="#fff" stroke="#374151" stroke-width="2"/><line x1="${qx + qw / 2}" y1="${qy}" x2="${qx + qw / 2}" y2="${qy + qh}" stroke="#374151" stroke-dasharray="5 4"/><line x1="${qx}" y1="${qy + qh / 2}" x2="${qx + qw}" y2="${qy + qh / 2}" stroke="#374151" stroke-dasharray="5 4"/>`;
  [[qx + 70, qy + 50, 'Migrate', '#c2410c'], [qx + 210, qy + 50, 'Support or fork', '#7c3aed'], [qx + 70, qy + 145, 'Accept and', '#4b5563'], [qx + 210, qy + 145, 'Sustain', '#1d4ed8']].forEach(([x, y, t, c]) => s += `<text x="${x}" y="${y}" text-anchor="middle" font-size="14" font-weight="bold" fill="${c}">${t}</text>`);
  s += `<text x="${qx + 70}" y="${qy + 163}" text-anchor="middle" font-size="14" font-weight="bold" fill="#4b5563">monitor</text><text x="${qx + qw / 2}" y="${qy + qh + 20}" text-anchor="middle" font-size="12" fill="#374151">Criticality C →</text><text transform="translate(${qx - 12} ${qy + qh / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#374151">Abandonment A →</text>`;
  s += arrow(830, 232, 830, 268);
  s += box(370, 490, 600, 70, '#fef2f2', '#b91c1c', ['Overlay: "Remediate now" if the current version or a direct dependency has a known advisory'], { bold: false });
  s += arrow(500, 442, 500, 488);
  s += box(30, 490, 280, 70, '#f0fdf4', '#15803d', ['Theory lenses', 'supply chain resilience; network', 'science; risk = impact × likelihood'], { lh: 16 });
  ch.render(ch.frame(w, h, 'Comprehensive Dependency Resilience Framework (CDRF)', s), path.join(FIG, 'd_cdrf.png'));
}
// Figure: research design (design science process)
{
  const w = 1000, h = 330; let s = defs; const steps = [['1. Problem', 'identification', 'literature, incidents'], ['2. Objectives', 'of a solution', '3 objectives, 3 RQs'], ['3. Design and', 'development', 'CDRF + web tool'], ['4. Demonstration', '', '786 real packages'], ['5. Evaluation', '', 'stats, incidents,', 'simulated panel'], ['6. Communication', '', 'dissertation']];
  steps.forEach((st, i) => { const x = 20 + i * 163; s += box(x, 80, 145, 120, i === 2 || i === 4 ? '#eef2ff' : '#f8fafc', '#15305d', st.filter(Boolean), { lh: 17 }); if (i < 5) s += arrow(x + 145, 140, x + 161, 140); });
  s += `<path d="M ${20 + 4 * 163 + 72} 205 C ${20 + 4 * 163 + 72} 280, ${20 + 2 * 163 + 72} 280, ${20 + 2 * 163 + 72} 205" fill="none" stroke="#c2410c" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#ah)"/><text x="${20 + 3 * 163 + 72}" y="295" text-anchor="middle" font-size="12" fill="#c2410c">iterate: refine thresholds, data cleaning, weights</text>`;
  s += `<text x="${w / 2}" y="60" text-anchor="middle" font-size="13" fill="#374151">Quantitative strand: secondary data (ecosyste.ms, deps.dev, OSV.dev) → network, regression and survival-style analyses</text>`;
  ch.render(ch.frame(w, h, 'Research design: design science research process (after Peffers et al., 2007)', s), path.join(FIG, 'd_design.png'));
}
// Figure: data pipeline
{
  const w = 1000, h = 300; let s = defs;
  s += box(20, 90, 190, 110, '#f8fafc', '#15305d', ['Sampling frame', 'ecosyste.ms: top 10,000', 'packages per ecosystem', 'by dependents'], { lh: 17 });
  s += box(250, 90, 190, 110, '#f8fafc', '#15305d', ['Stratified sample', 'ranks 1-100, 101-1,000,', '1,001-10,000; seeded', 'random (n = 800)'], { lh: 17 });
  s += box(480, 90, 190, 110, '#eef2ff', '#1d4ed8', ['Enrichment', 'deps.dev: versions,', 'resolved graphs, dependents,', 'Scorecard'], { lh: 17 });
  s += box(710, 90, 130, 110, '#fef2f2', '#b91c1c', ['OSV.dev', 'advisories for', 'packages and', 'tree nodes'], { lh: 17 });
  s += box(870, 90, 115, 110, '#f0fdf4', '#15803d', ['Cleaning', 'spam removed', 'n = 786'], { lh: 17 });
  s += arrow(210, 145, 248, 145) + arrow(440, 145, 478, 145) + arrow(670, 145, 708, 145) + arrow(840, 145, 868, 145);
  s += `<text x="${w / 2}" y="250" text-anchor="middle" font-size="13" fill="#374151">All API responses cached as JSON for reproducibility</text>`;
  ch.render(ch.frame(w, h, 'Data collection pipeline', s), path.join(FIG, 'd_pipeline.png'));
}
console.log('diagrams done');
