// Completion-rate study (paper Limitations §incomplete-student, promoted to a
// measured result): the main experiment assumes every student answers all 40
// questions. Real students under time pressure may leave questions blank. This
// script sweeps completion rate over the hardest scenarios and reports, per
// algorithm, both the fraction of *answered* work preserved and the absolute
// number of questions preserved, plus grading success.
//
// It tests the paper's stated hypothesis that incomplete sessions widen the
// gap between Baseline A (all-or-nothing) and the periodic strategies —
// reporting whatever the data actually shows rather than assuming it.
'use strict';

const fs = require('fs');
const path = require('path');

const { mulberry32 } = require('./rng');
const { buildTrace } = require('./network-sim');
const { buildAnswerSchedule } = require('./student-sim');
const { SCENARIOS } = require('./scenarios');
const { runDeltaTrial } = require('./delta-client');
const { runFullSyncTrial } = require('./full-sync-client');

const EXAM_DURATION_MS = 60 * 60 * 1000;
const GRACE_MS = 5 * 60 * 1000;
const SYNC_INTERVAL_MS = 15 * 1000;
const LEVEL = 4;
const SEEDS = 200;
const COMPLETION_RATES = [0.6, 0.8, 1.0];
const STUDY_SCENARIOS = ['intermittent_long', 'degrading', 'degrading_severe'];

function runOne(scenarioName, seed, completionRate) {
  const cfg = SCENARIOS[scenarioName];
  const traceRng = mulberry32(seed * 2 + 1);
  const studentRng = mulberry32(seed * 2 + 2);
  const trace = buildTrace(cfg, traceRng, EXAM_DURATION_MS + GRACE_MS);
  const answerEvents = buildAnswerSchedule(studentRng, LEVEL, EXAM_DURATION_MS, completionRate);
  const shared = { trace, answerEvents, examDurationMs: EXAM_DURATION_MS, graceMs: GRACE_MS, syncIntervalMs: SYNC_INTERVAL_MS, networkParams: cfg };
  const delta = runDeltaTrial(shared);
  const baselineA = runFullSyncTrial({ ...shared, periodicBeforeDeadline: false });
  const baselineB = runFullSyncTrial({ ...shared, periodicBeforeDeadline: true });
  return [delta, baselineA, baselineB].map((r) => ({ scenario: scenarioName, completionRate, seed, ...r }));
}

function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function sd(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }
function ci95(a) { return a.length < 2 ? 0 : 1.96 * sd(a) / Math.sqrt(a.length); }
function ci95prop(p, n) { return 1.96 * Math.sqrt((p * (1 - p)) / n); }

function main() {
  const rows = [];
  for (const s of STUDY_SCENARIOS) {
    for (const cr of COMPLETION_RATES) {
      for (let seed = 1; seed <= SEEDS; seed++) rows.push(...runOne(s, seed, cr));
    }
  }

  const outDir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(outDir, { recursive: true });

  // Raw CSV
  const cols = ['scenario', 'completionRate', 'seed', 'algorithm', 'uplinkBytes', 'attempts', 'gradingFailed', 'totalAnswered', 'preservedOnServer', 'preservedFraction'];
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => r[c]).join(','));
  fs.writeFileSync(path.join(outDir, 'completion-results.csv'), lines.join('\n') + '\n');

  // Summary table
  const algorithms = ['delta', 'baselineA_endonly_full', 'baselineB_periodic_full'];
  const labels = { delta: 'Delta-sync', baselineA_endonly_full: 'Baseline A', baselineB_periodic_full: 'Baseline B' };
  let md = '# Completion-Rate Study\n\n';
  md += `${SEEDS} seeds per cell. Tests whether incomplete sessions change the Baseline A vs periodic gap. `;
  md += 'Data preserved = fraction of *answered* questions durably recorded server-side; Qs preserved = absolute count. ± = 95% CI.\n\n';
  for (const s of STUDY_SCENARIOS) {
    md += `## ${s} — ${SCENARIOS[s].label}\n\n`;
    md += '| Completion | Algorithm | Grading success % (± CI) | Data preserved % (± CI) | Qs preserved (of ~answered) |\n';
    md += '|---|---|---|---|---|\n';
    for (const cr of COMPLETION_RATES) {
      for (const algo of algorithms) {
        const sub = rows.filter((r) => r.scenario === s && r.completionRate === cr && r.algorithm === algo);
        const n = sub.length;
        const gp = mean(sub.map((r) => (r.gradingFailed ? 0 : 1)));
        const pf = sub.map((r) => r.preservedFraction);
        const qp = sub.map((r) => r.preservedOnServer);
        const answered = mean(sub.map((r) => r.totalAnswered));
        md += `| ${(cr * 100).toFixed(0)}% | ${labels[algo]} | ${(gp * 100).toFixed(1)} ± ${(ci95prop(gp, n) * 100).toFixed(1)} | ${(mean(pf) * 100).toFixed(1)} ± ${(ci95(pf) * 100).toFixed(1)} | ${mean(qp).toFixed(1)} / ${answered.toFixed(0)} |\n`;
      }
    }
    md += '\n';
  }
  fs.writeFileSync(path.join(outDir, 'completion-summary.md'), md);
  console.log(`Completion study: ${rows.length} rows (${STUDY_SCENARIOS.length} scenarios x ${COMPLETION_RATES.length} rates x ${SEEDS} seeds x 3 algos).`);
}

main();
