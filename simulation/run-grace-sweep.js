// Grace-window sufficiency sweep (paper RQ3, JL4D framing).
// Under FIELD-CALIBRATED connectivity, how much post-deadline grace does the
// current single-submission design (Baseline A) need to avoid losing a student's
// work -- and where does loss appear? Delta-sync is shown alongside as the
// low-cost "tail insurance" alternative.
'use strict';

const { mulberry32 } = require('./rng');
const { buildTrace } = require('./network-sim');
const { buildAnswerSchedule } = require('./student-sim');
const { SCENARIOS } = require('./scenarios');
const { runDeltaTrial } = require('./delta-client');
const { runFullSyncTrial } = require('./full-sync-client');
const fs = require('fs');
const path = require('path');

const EXAM_MS = 60 * 60 * 1000;
const SYNC_MS = 15 * 1000;
const LEVEL = 4;
const SEEDS = 200;
const GRACE_MIN = [0.5, 1, 2, 3, 5, 10, 15];
const SCEN = ['field_typical', 'field_bad'];

function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function ci95prop(p, n) { return 1.96 * Math.sqrt((p * (1 - p)) / n); }

function cell(scenario, graceMin) {
  const cfg = SCENARIOS[scenario];
  const graceMs = graceMin * 60 * 1000;
  const A = { grade: [], pres: [] }, D = { grade: [], pres: [] };
  for (let seed = 1; seed <= SEEDS; seed++) {
    const trace = buildTrace(cfg, mulberry32(seed * 2 + 1), EXAM_MS + graceMs);
    const ans = buildAnswerSchedule(mulberry32(seed * 2 + 2), LEVEL, EXAM_MS, 1.0);
    const shared = { trace, answerEvents: ans, examDurationMs: EXAM_MS, graceMs, syncIntervalMs: SYNC_MS, networkParams: cfg };
    const a = runFullSyncTrial({ ...shared, periodicBeforeDeadline: false });
    const d = runDeltaTrial(shared);
    A.grade.push(a.gradingFailed ? 0 : 1); A.pres.push(a.preservedFraction);
    D.grade.push(d.gradingFailed ? 0 : 1); D.pres.push(d.preservedFraction);
  }
  return {
    scenario, graceMin,
    A_grade: mean(A.grade), A_gradeCI: ci95prop(mean(A.grade), SEEDS), A_pres: mean(A.pres),
    D_grade: mean(D.grade), D_pres: mean(D.pres),
  };
}

const rows = [];
for (const s of SCEN) for (const g of GRACE_MIN) rows.push(cell(s, g));

const outDir = path.join(__dirname, '..', 'results');
const cols = ['scenario', 'graceMin', 'A_grade', 'A_gradeCI', 'A_pres', 'D_grade', 'D_pres'];
fs.writeFileSync(path.join(outDir, 'grace-sweep-results.csv'),
  [cols.join(',')].concat(rows.map(r => cols.map(c => (typeof r[c] === 'number' ? r[c].toFixed(4) : r[c])).join(','))).join('\n') + '\n');

let md = '# Grace-Window Sufficiency (field-calibrated, n=200/cell)\n\n';
md += 'Baseline A = current single end-of-session submission. Grading = fraction of sessions whose final submit landed within the grace window; Data preserved = fraction of a student\'s answered questions kept server-side. Delta-sync shown for comparison.\n\n';
for (const s of SCEN) {
  md += `## ${s} — ${SCENARIOS[s].label}\n\n`;
  md += '| Grace (min) | A grading % (±CI) | A data preserved % | Delta grading % | Delta preserved % |\n|---|---|---|---|---|\n';
  for (const r of rows.filter(x => x.scenario === s)) {
    md += `| ${r.graceMin} | ${(100*r.A_grade).toFixed(1)} ± ${(100*r.A_gradeCI).toFixed(1)} | ${(100*r.A_pres).toFixed(1)} | ${(100*r.D_grade).toFixed(1)} | ${(100*r.D_pres).toFixed(1)} |\n`;
  }
  md += '\n';
}
fs.writeFileSync(path.join(outDir, 'grace-sweep-summary.md'), md);
process.stdout.write(md);
console.log('[ditulis] measurements/grace-sweep-summary.md + grace-sweep-results.csv');
