// Builds the merged list of "wake times" a client acts on during a trial:
// periodic sync ticks, reconnect moments (DOWN->UP transitions), the exam
// deadline, and grace-period retries after the deadline. Shared by both the
// delta-sync client and the full-sync baselines so their trigger cadence is
// directly comparable.
'use strict';

function reconnectTimes(trace, examDurationMs, graceEndMs) {
  const times = [];
  for (let i = 1; i < trace.length; i++) {
    if (trace[i - 1].state === 'DOWN' && trace[i].state === 'UP' && trace[i].start <= graceEndMs) {
      times.push(trace[i].start);
    }
  }
  return times;
}

function buildWakeTimes(trace, examDurationMs, graceMs, syncIntervalMs) {
  const graceEndMs = examDurationMs + graceMs;
  const times = new Set();
  for (let t = syncIntervalMs; t < examDurationMs; t += syncIntervalMs) times.add(t);
  for (const t of reconnectTimes(trace, examDurationMs, graceEndMs)) times.add(t);
  times.add(examDurationMs); // deadline: mandatory final grading attempt
  for (let t = examDurationMs + syncIntervalMs; t <= graceEndMs; t += syncIntervalMs) times.add(t);
  return Array.from(times).sort((a, b) => a - b);
}

module.exports = { buildWakeTimes };
