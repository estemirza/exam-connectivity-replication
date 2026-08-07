// Parameter sweep (the paper's new core contribution): the main experiment
// fixes the sync interval at 15s and the grace window at 5min. Those are the
// two knobs that trade transfer/energy overhead against resilience, yet they
// were never varied. This sweeps interval x grace for the delta-sync client on
// the two degrading scenarios and reports the tradeoff surface: what each
// setting buys (data preserved, grading success) and what it costs (uplink
// bytes, wake-ups, energy). The output is design guidance — a tuning surface —
// not a single operating point.
'use strict';

const fs = require('fs');
const path = require('path');

const { mulberry32 } = require('./rng');
const { buildTrace } = require('./network-sim');
const { buildAnswerSchedule } = require('./student-sim');
const { SCENARIOS } = require('./scenarios');
const { runDeltaTrial } = require('./delta-client');
const { energyProxyJoules } = require('./encoding');

const EXAM_DURATION_MS = 60 * 60 * 1000;
const LEVEL = 4;
const SEEDS = 200;
const COMPLETION_RATE = 1.0;

const SYNC_INTERVALS_S = [5, 10, 15, 30, 60];
const GRACE_WINDOWS_MIN = [2, 5, 10];
const SWEEP_SCENARIOS = ['degrading', 'degrading_severe'];

function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function sd(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }
function ci95(a) { return a.length < 2 ? 0 : 1.96 * sd(a) / Math.sqrt(a.length); }
function ci95prop(p, n) { return 1.96 * Math.sqrt((p * (1 - p)) / n); }

function runCell(scenarioName, intervalS, graceMin) {
  const cfg = SCENARIOS[scenarioName];
  const graceMs = graceMin * 60 * 1000;
  const syncIntervalMs = intervalS * 1000;
  const results = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const traceRng = mulberry32(seed * 2 + 1);
    const studentRng = mulberry32(seed * 2 + 2);
    const trace = buildTrace(cfg, traceRng, EXAM_DURATION_MS + graceMs);
    const answerEvents = buildAnswerSchedule(studentRng, LEVEL, EXAM_DURATION_MS, COMPLETION_RATE);
    const r = runDeltaTrial({ trace, answerEvents, examDurationMs: EXAM_DURATION_MS, graceMs, syncIntervalMs, networkParams: cfg });
    r.energyProxyJ = energyProxyJoules(r.attempts, r.uplinkBytes + r.downlinkBytes);
    results.push(r);
  }
  const n = results.length;
  const gp = mean(results.map((r) => (r.gradingFailed ? 0 : 1)));
  return {
    scenario: scenarioName,
    intervalS,
    graceMin,
    gradingPct: gp * 100,
    gradingCI: ci95prop(gp, n) * 100,
    preservedPct: mean(results.map((r) => r.preservedFraction)) * 100,
    preservedCI: ci95(results.map((r) => r.preservedFraction)) * 100,
    uplinkBytes: mean(results.map((r) => r.uplinkBytes)),
    attempts: mean(results.map((r) => r.attempts)),
    energyJ: mean(results.map((r) => r.energyProxyJ)),
  };
}

function main() {
  const cells = [];
  for (const s of SWEEP_SCENARIOS) {
    for (const iv of SYNC_INTERVALS_S) {
      for (const g of GRACE_WINDOWS_MIN) cells.push(runCell(s, iv, g));
    }
  }

  const outDir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(outDir, { recursive: true });

  // Raw CSV
  const cols = ['scenario', 'intervalS', 'graceMin', 'gradingPct', 'gradingCI', 'preservedPct', 'preservedCI', 'uplinkBytes', 'attempts', 'energyJ'];
  const lines = [cols.join(',')];
  for (const c of cells) lines.push(cols.map((k) => (typeof c[k] === 'number' ? c[k].toFixed(2) : c[k])).join(','));
  fs.writeFileSync(path.join(outDir, 'sweep-results.csv'), lines.join('\n') + '\n');

  // Markdown: one grading + one cost view per scenario
  let md = '# Parameter Sweep — Delta-Sync (sync interval x grace window)\n\n';
  md += `${SEEDS} seeds per cell. Grace window trades against grading success (more time to land the final submit); sync interval trades against wake-ups/energy. Data preserved stays ~100% throughout — the periodic checkpoints protect answered work regardless of interval — so the live tradeoff is grading-success vs cost.\n\n`;
  for (const s of SWEEP_SCENARIOS) {
    md += `## ${s} — ${SCENARIOS[s].label}\n\n`;
    md += '### Grading success % (± CI) by interval x grace\n\n';
    md += '| Interval \\ Grace | ' + GRACE_WINDOWS_MIN.map((g) => `${g} min`).join(' | ') + ' |\n';
    md += '|---|' + GRACE_WINDOWS_MIN.map(() => '---').join('|') + '|\n';
    for (const iv of SYNC_INTERVALS_S) {
      const cellsRow = GRACE_WINDOWS_MIN.map((g) => {
        const c = cells.find((x) => x.scenario === s && x.intervalS === iv && x.graceMin === g);
        return `${c.gradingPct.toFixed(1)} ± ${c.gradingCI.toFixed(1)}`;
      });
      md += `| ${iv}s | ${cellsRow.join(' | ')} |\n`;
    }
    md += '\n### Cost at grace = 5 min: uplink bytes / wake-ups / energy (J) by interval\n\n';
    md += '| Interval | Uplink bytes | Wake-ups | Energy (J) | Data preserved % |\n|---|---|---|---|---|\n';
    for (const iv of SYNC_INTERVALS_S) {
      const c = cells.find((x) => x.scenario === s && x.intervalS === iv && x.graceMin === 5);
      md += `| ${iv}s | ${c.uplinkBytes.toFixed(0)} | ${c.attempts.toFixed(1)} | ${c.energyJ.toFixed(0)} | ${c.preservedPct.toFixed(1)} |\n`;
    }
    md += '\n';
  }
  fs.writeFileSync(path.join(outDir, 'sweep-summary.md'), md);
  console.log(`Sweep: ${cells.length} cells (${SWEEP_SCENARIOS.length} scenarios x ${SYNC_INTERVALS_S.length} intervals x ${GRACE_WINDOWS_MIN.length} grace x ${SEEDS} seeds).`);
}

main();
