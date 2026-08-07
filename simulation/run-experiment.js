// Orchestrator: for each (scenario x seed), builds ONE connectivity trace and
// ONE student answer schedule, then runs all three algorithms against that
// exact same trace+schedule pair (fair A/B/C comparison — only the sync
// strategy differs). Writes raw per-run rows to measurements/results.csv and
// an aggregated comparison table (with 95% CIs) to measurements/summary.md.
'use strict';

const fs = require('fs');
const path = require('path');

const { mulberry32 } = require('./rng');
const { buildTrace } = require('./network-sim');
const { buildAnswerSchedule } = require('./student-sim');
const { SCENARIOS } = require('./scenarios');
const { runDeltaTrial } = require('./delta-client');
const { runFullSyncTrial } = require('./full-sync-client');
const { energyProxyJoules } = require('./encoding');

const EXAM_DURATION_MS = 60 * 60 * 1000;
const GRACE_MS = 5 * 60 * 1000;
const SYNC_INTERVAL_MS = 15 * 1000;
const LEVEL = 4; // arbitrary — question count (40) is the same across all 10 levels
const SEEDS_PER_SCENARIO = 200;
const COMPLETION_RATE = 1.0; // main comparison assumes full completion; see run-completion.js

function withEnergy(r) {
  return { ...r, energyProxyJ: energyProxyJoules(r.attempts, r.uplinkBytes + r.downlinkBytes) };
}

function runOne(scenarioName, seed) {
  const cfg = SCENARIOS[scenarioName];
  const traceRng = mulberry32(seed * 2 + 1);
  const studentRng = mulberry32(seed * 2 + 2);

  const trace = buildTrace(cfg, traceRng, EXAM_DURATION_MS + GRACE_MS);
  const answerEvents = buildAnswerSchedule(studentRng, LEVEL, EXAM_DURATION_MS, COMPLETION_RATE);

  const shared = { trace, answerEvents, examDurationMs: EXAM_DURATION_MS, graceMs: GRACE_MS, syncIntervalMs: SYNC_INTERVAL_MS, networkParams: cfg };

  const delta = runDeltaTrial(shared);
  const baselineA = runFullSyncTrial({ ...shared, periodicBeforeDeadline: false });
  const baselineB = runFullSyncTrial({ ...shared, periodicBeforeDeadline: true });

  return [delta, baselineA, baselineB].map((r) => ({ scenario: scenarioName, seed, ...withEnergy(r) }));
}

function main() {
  const rows = [];
  for (const scenarioName of Object.keys(SCENARIOS)) {
    for (let seed = 1; seed <= SEEDS_PER_SCENARIO; seed++) {
      rows.push(...runOne(scenarioName, seed));
    }
  }

  const outDir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(outDir, { recursive: true });

  writeCsv(path.join(outDir, 'results.csv'), rows);
  writeSummary(path.join(outDir, 'summary.md'), rows);

  console.log(`Wrote ${rows.length} rows across ${Object.keys(SCENARIOS).length} scenarios x ${SEEDS_PER_SCENARIO} seeds x 3 algorithms.`);
}

function writeCsv(filePath, rows) {
  const cols = ['scenario', 'seed', 'algorithm', 'uplinkBytes', 'downlinkBytes', 'attempts', 'successes', 'failures', 'energyProxyJ', 'gradedAt', 'gradingFailed', 'totalAnswered', 'preservedOnServer', 'preservedFraction'];
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(cols.map((c) => r[c]).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

// --- statistics -----------------------------------------------------------
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function sd(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1);
  return Math.sqrt(v);
}

// 95% CI half-width for a mean (normal approx; n=200 is comfortably large).
function ci95(arr) {
  if (arr.length < 2) return 0;
  return 1.96 * sd(arr) / Math.sqrt(arr.length);
}

// 95% CI half-width for a Bernoulli proportion (grading success is 0/1 per trial).
function ci95prop(p, n) {
  return 1.96 * Math.sqrt((p * (1 - p)) / n);
}

function writeSummary(filePath, rows) {
  const scenarios = Object.keys(SCENARIOS);
  const algorithms = ['delta', 'baselineA_endonly_full', 'baselineB_periodic_full'];
  const labels = { delta: 'Delta-sync', baselineA_endonly_full: 'Baseline A (end-only full)', baselineB_periodic_full: 'Baseline B (periodic full)' };

  let md = '# Measurement Summary — Delta-Sync vs Full-Sync Baselines\n\n';
  md += `Runs: ${SEEDS_PER_SCENARIO} seeds x ${scenarios.length} scenarios x 3 algorithms. `;
  md += `Exam window ${EXAM_DURATION_MS / 60000} min + ${GRACE_MS / 60000} min grace, periodic sync interval ${SYNC_INTERVAL_MS / 1000}s, completion rate ${(COMPLETION_RATE * 100).toFixed(0)}%.\n\n`;
  md += 'All ± values are 95% confidence-interval half-widths across seeds (normal approx; grading success uses a Bernoulli-proportion CI).\n\n';

  for (const scenarioName of scenarios) {
    md += `## Scenario: ${scenarioName} — ${SCENARIOS[scenarioName].label}\n\n`;
    md += '| Algorithm | Uplink bytes (mean ± CI) | Attempts (wake-ups) | Energy proxy (J) | Success rate | Grading success % (± CI) | Data preserved % (± CI) |\n';
    md += '|---|---|---|---|---|---|---|\n';
    for (const algo of algorithms) {
      const subset = rows.filter((r) => r.scenario === scenarioName && r.algorithm === algo);
      const n = subset.length;

      const uplink = subset.map((r) => r.uplinkBytes);
      const attempts = subset.map((r) => r.attempts);
      const energy = subset.map((r) => r.energyProxyJ);
      const successRate = mean(subset.map((r) => (r.attempts === 0 ? 1 : r.successes / r.attempts)));
      const gradingP = mean(subset.map((r) => (r.gradingFailed ? 0 : 1)));
      const preserved = subset.map((r) => r.preservedFraction);

      const uplinkStr = `${mean(uplink).toFixed(0)} ± ${ci95(uplink).toFixed(0)}`;
      const attemptsStr = `${mean(attempts).toFixed(1)} ± ${ci95(attempts).toFixed(1)}`;
      const energyStr = `${mean(energy).toFixed(0)} ± ${ci95(energy).toFixed(0)}`;
      const gradingStr = `${(gradingP * 100).toFixed(1)} ± ${(ci95prop(gradingP, n) * 100).toFixed(1)}`;
      const preservedStr = `${(mean(preserved) * 100).toFixed(1)} ± ${(ci95(preserved) * 100).toFixed(1)}`;

      md += `| ${labels[algo]} | ${uplinkStr} | ${attemptsStr} | ${energyStr} | ${(successRate * 100).toFixed(1)}% | ${gradingStr} | ${preservedStr} |\n`;
    }
    md += '\n';
  }

  fs.writeFileSync(filePath, md);
}

main();
