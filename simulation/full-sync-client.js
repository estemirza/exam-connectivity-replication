// Two baseline clients, sharing one implementation:
//
// - Baseline A ("current platform behaviour"): a single full-answer submission
//   attempted only at the exam deadline, retried wholesale (the entire
//   answer set, every time) until it succeeds or the grace window expires.
//   All-or-nothing: if it never lands, nothing is durably recorded.
//
// - Baseline B ("naive periodic full-sync"): same periodic trigger cadence
//   as the delta client, but each attempt sends the *entire* current answer
//   set rather than just what changed. Gets partial resilience from
//   whichever periodic attempt last succeeded, at the cost of resending
//   unchanged answers every time.
'use strict';

const { attemptSend } = require('./network-sim');
const { buildWakeTimes } = require('./timeline');
const { ServerState } = require('./sim-server');
const { fullSnapshotBytes, FINAL_METADATA_BYTES, ACK_BYTES, CERT_BYTES } = require('./encoding');

function runFullSyncTrial({ trace, answerEvents, examDurationMs, graceMs, syncIntervalMs, networkParams, periodicBeforeDeadline }) {
  const server = new ServerState();
  const answers = new Map(); // qid -> value, frozen once the deadline passes

  const metrics = {
    uplinkBytes: 0,
    downlinkBytes: 0,
    attempts: 0,
    successes: 0,
    failures: 0,
    gradedAt: null,
    gradingFailed: false,
  };

  let allWakeTimes = buildWakeTimes(trace, examDurationMs, graceMs, syncIntervalMs);
  if (!periodicBeforeDeadline) {
    allWakeTimes = allWakeTimes.filter((t) => t >= examDurationMs);
  }

  let eventIdx = 0;
  let graded = false;
  let lastSyncedSnapshotSize = 0; // partial-resilience fallback for baseline B

  function applyDueAnswerEvents(uptoMs) {
    while (eventIdx < answerEvents.length && answerEvents[eventIdx].t <= uptoMs) {
      const ev = answerEvents[eventIdx];
      answers.set(ev.qid, ev.value);
      eventIdx += 1;
    }
  }

  function attemptFullSync(tMs, isFinal) {
    const entries = Array.from(answers, ([qid, value]) => ({ qid, value }));
    const bytes = fullSnapshotBytes(entries.length) + (isFinal ? FINAL_METADATA_BYTES : 0);

    metrics.attempts += 1;
    const result = attemptSend(trace, tMs, bytes, networkParams);
    metrics.uplinkBytes += result.bytesSent;

    if (result.success) {
      metrics.successes += 1;
      metrics.downlinkBytes += ACK_BYTES + (isFinal ? CERT_BYTES : 0);
      server.applyFullSnapshot(entries);
      lastSyncedSnapshotSize = entries.length;
      if (isFinal) {
        server.markGraded();
        graded = true;
        metrics.gradedAt = result.completesAt;
      }
    } else {
      metrics.failures += 1;
    }
  }

  for (const tMs of allWakeTimes) {
    if (graded) break;
    if (tMs < examDurationMs) {
      // Periodic pre-deadline sync (baseline B only — baseline A's wake
      // times are already filtered to exclude these).
      applyDueAnswerEvents(tMs);
      attemptFullSync(tMs, false);
    } else {
      // Deadline or grace retry: freeze the answer set at the deadline (the
      // exam is over, the student can no longer change answers) and keep
      // re-sending the full frozen snapshot until it lands or grace expires.
      // applyDueAnswerEvents is idempotent past examDurationMs, so calling it
      // on every grace tick is safe — it only ever advances up to the freeze.
      applyDueAnswerEvents(examDurationMs);
      attemptFullSync(tMs, true);
    }
  }

  if (!graded) metrics.gradingFailed = true;

  const totalAnswered = answers.size;
  const preservedOnServer = graded ? totalAnswered : (periodicBeforeDeadline ? lastSyncedSnapshotSize : 0);

  return {
    algorithm: periodicBeforeDeadline ? 'baselineB_periodic_full' : 'baselineA_endonly_full',
    ...metrics,
    totalAnswered,
    preservedOnServer,
    preservedFraction: totalAnswered === 0 ? 1 : preservedOnServer / totalAnswered,
  };
}

module.exports = { runFullSyncTrial };
