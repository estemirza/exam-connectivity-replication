// Simulated intermittent connectivity: a genuine UP/DOWN state machine, not
// just a throttled pipe. Durations are drawn from a log-normal distribution
// around a configured mean so runs don't look like a metronome. Optionally
// the mean up/down durations and bandwidth drift over the exam window
// (`degrading` scenario) to model growing contention in a classroom.
//
// The trace is precomputed once per (scenario, seed) and reused for every
// algorithm under test in that trial, so a delta-sync run and a baseline run
// see the exact same connectivity history — the only variable is the sync
// strategy.
'use strict';

const { sampleLogNormalMean } = require('./rng');

function lerp(a, b, frac) { return a + (b - a) * frac; }

/**
 * Build a connectivity trace covering [0, durationMs].
 * @param {object} cfg
 *   meanUpMs, meanDownMs           - starting means (constant if no *End variant given)
 *   meanUpMsEnd, meanDownMsEnd     - optional end-of-window means, for drift ("degrading")
 *   bandwidthBytesPerSec           - starting bandwidth
 *   bandwidthBytesPerSecEnd        - optional end-of-window bandwidth, for drift
 *   startState                    - 'UP' | 'DOWN', default 'UP'
 * @param {function} rng - seeded RNG (0..1)
 * @param {number} durationMs - total window to cover (exam + grace)
 */
function buildTrace(cfg, rng, durationMs) {
  const segments = [];
  let t = 0;
  let state = cfg.startState || 'UP';
  while (t < durationMs) {
    const frac = Math.min(t / durationMs, 1);
    const meanUp = lerp(cfg.meanUpMs, cfg.meanUpMsEnd != null ? cfg.meanUpMsEnd : cfg.meanUpMs, frac);
    const meanDown = lerp(cfg.meanDownMs, cfg.meanDownMsEnd != null ? cfg.meanDownMsEnd : cfg.meanDownMs, frac);
    const mean = state === 'UP' ? meanUp : meanDown;
    const dur = Math.max(200, sampleLogNormalMean(rng, mean)); // floor so segments aren't degenerate
    const bandwidth = lerp(
      cfg.bandwidthBytesPerSec,
      cfg.bandwidthBytesPerSecEnd != null ? cfg.bandwidthBytesPerSecEnd : cfg.bandwidthBytesPerSec,
      frac
    );
    const start = t;
    const end = Math.min(t + dur, durationMs);
    segments.push({ state, start, end, bandwidthBytesPerSec: bandwidth });
    t = end;
    state = state === 'UP' ? 'DOWN' : 'UP';
  }
  return segments;
}

function segmentAt(trace, tMs) {
  // Linear scan is fine: traces are a few hundred segments at most per run.
  for (const seg of trace) {
    if (tMs >= seg.start && tMs < seg.end) return seg;
  }
  return trace[trace.length - 1];
}

/**
 * Attempt to send `bytes` starting at time `tMs` against a precomputed trace.
 * Returns { success, bytesSent, completesAt, wasMidFlightDrop }.
 *
 * - Clean pre-flight rejection: link already DOWN at send time -> fails
 *   immediately, 0 bytes counted (nothing left the device).
 * - Mid-flight drop: link is UP at send time but goes DOWN before the
 *   transfer would complete -> fails at the transition point, with bytes
 *   proportional to elapsed/needed time counted as consumed (real data cost
 *   even though the sync didn't succeed).
 * - Success: link stays UP for the whole transfer.
 *
 * Simplification: the transfer duration (and thus required bandwidth) is
 * computed once from the bandwidth available at the moment the request
 * starts, matching how a real device begins streaming at whatever rate is
 * on offer; we don't re-derive a new required-duration mid-transfer if a
 * later segment (still UP) happens to offer different bandwidth, we only
 * check whether connectivity holds up for the originally computed duration.
 */
function attemptSend(trace, tMs, bytes, params) {
  const startSeg = segmentAt(trace, tMs);
  if (startSeg.state === 'DOWN') {
    return { success: false, bytesSent: 0, completesAt: tMs, wasMidFlightDrop: false };
  }

  const transferMs = (params.baseLatencyMs || 0) + (params.jitterMs || 0)
    + (bytes / Math.max(1, startSeg.bandwidthBytesPerSec)) * 1000;

  let idx = trace.indexOf(startSeg);
  let remainingMs = transferMs;
  let cursor = tMs;

  while (idx < trace.length) {
    const seg = trace[idx];
    if (seg.state === 'DOWN') {
      const fractionDone = 1 - remainingMs / transferMs;
      return { success: false, bytesSent: Math.round(bytes * fractionDone), completesAt: cursor, wasMidFlightDrop: true };
    }
    const availableMs = seg.end - cursor;
    if (availableMs >= remainingMs) {
      return { success: true, bytesSent: bytes, completesAt: cursor + remainingMs, wasMidFlightDrop: false };
    }
    remainingMs -= availableMs;
    cursor = seg.end;
    idx += 1;
  }
  // Ran off the end of the trace while still transferring — treat as success
  // at the edge of the simulated window (callers size the trace generously).
  return { success: true, bytesSent: bytes, completesAt: cursor, wasMidFlightDrop: false };
}

module.exports = { buildTrace, attemptSend };
