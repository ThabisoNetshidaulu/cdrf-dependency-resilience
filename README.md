# CDRF: Comprehensive Dependency Resilience Framework

Code for the study *Software Supply Chain Resilience: Dependency Network Analysis and Abandonment Risk in Open-Source Ecosystems*.

The CDRF scores open-source dependencies on three dimensions and recommends a response for each one:

| Score | Meaning |
|---|---|
| **C**: Criticality (0 to 1) | Percentile rank of how many packages in the ecosystem depend on the package (impact of a failure) |
| **A**: Abandonment likelihood (0 to 1) | Probability that the package stops releasing within 24 months (logistic model; 1 if already dormant) |
| **V**: Vulnerability exposure (0 to 1) | Known advisories on the current version, vulnerable packages in its dependency tree, and advisory history |
| **RRI**: Resilience Risk Index | 100 × C × (0.6A + 0.4V) |

Responses: **Accept and monitor** (low C, low A), **Sustain** (high C, low A), **Migrate** (low C, high A) and **Support or fork** (high C, high A), plus a **Remediate now** flag for known advisories. The version 1.1 rules send deprecated or archived packages to *Migrate*, and treat dormant packages with no vulnerability history as *Sustain*.

## Repository contents

```
cdrf-tool/   Browser-based prototype tool (no build step)
  index.html   the app: single package, portfolio, study dataset, incident validation, method
  data.js      study results the app needs (scores for 786 packages, model coefficients)
  serve.js     tiny local web server
research/    Data collection and analysis scripts (Node.js)
  collect.js     samples packages and downloads data from ecosyste.ms, deps.dev and OSV.dev
  analyze.js     cleaning, network analysis, regressions, CDRF scoring, sensitivity analysis, figures
  stats.js       statistics helpers (Spearman, Mann-Whitney, chi-square, logistic regression, AUC)
  charts.js      SVG/PNG chart helpers
  diagrams.js    conceptual diagrams
  casestudies.js retrospective scoring of historical incident packages
```

## Running the tool

Requires [Node.js](https://nodejs.org/) 18 or later.

```bash
node cdrf-tool/serve.js
```

Then open http://localhost:5173. The tool fetches live data from the public deps.dev and OSV.dev APIs, so it needs an internet connection.

## Reproducing the analysis

```bash
cd research
npm install
npm run collect     # downloads and caches the sample (about 1 GB in data/raw/; takes a while)
npm run analyze     # writes results/results.json, results/cdrf_scores.json and the figures
npm run cases       # incident back-testing -> results/casestudies.json
npm run diagrams    # conceptual diagrams
```

The sample is seeded (seed 20260720), so `collect.js` reproduces the same packages. The live services change over time, however, so a new run reflects the data on the day it runs. The study data was collected on 21 November 2026.

## Data sources

- [ecosyste.ms Packages API](https://packages.ecosyste.ms/): sampling frame and dependent counts
- [deps.dev (Open Source Insights)](https://deps.dev/): release histories, resolved dependency graphs, OpenSSF Scorecard
- [OSV.dev](https://osv.dev/): vulnerability advisories

## Known limitations

The tool cannot detect account takeovers of actively maintained packages. Criticality reflects importance to the whole ecosystem, not to a specific organisation. PyPI and Maven Central have no deprecation flag, so packages such as `nose` or `log4j:log4j` may not be sent to *Migrate* even when a successor exists.
