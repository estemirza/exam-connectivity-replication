// Named network scenario presets (design doc Section 4). Each is a
// connectivity-trace config plus latency/jitter, fed to network-sim.buildTrace.
'use strict';

const SCENARIOS = {
  stable: {
    label: 'Stable broadband (control)',
    meanUpMs: 4 * 60 * 60 * 1000, // effectively always up for a 1h exam
    meanDownMs: 1000,
    bandwidthBytesPerSec: 2_000_000,
    baseLatencyMs: 80,
    jitterMs: 20,
  },
  throttled_only: {
    label: 'Throttled but steady (bandwidth effect isolated)',
    meanUpMs: 4 * 60 * 60 * 1000,
    meanDownMs: 1000,
    bandwidthBytesPerSec: 20_000, // ~160 kbps
    baseLatencyMs: 150,
    jitterMs: 50,
  },
  intermittent_frequent: {
    label: 'Frequent short drops (flaky wifi/hotspot)',
    meanUpMs: 90 * 1000,
    meanDownMs: 15 * 1000,
    bandwidthBytesPerSec: 100_000,
    baseLatencyMs: 150,
    jitterMs: 80,
  },
  intermittent_long: {
    label: 'Long drops (rural cellular backhaul)',
    meanUpMs: 5 * 60 * 1000,
    meanDownMs: 3 * 60 * 1000,
    bandwidthBytesPerSec: 50_000,
    baseLatencyMs: 200,
    jitterMs: 100,
  },
  degrading: {
    label: 'Degrading over the exam (classroom contention)',
    meanUpMs: 90 * 1000,
    meanDownMs: 15 * 1000,
    meanUpMsEnd: 45 * 1000,
    meanDownMsEnd: 240 * 1000,
    bandwidthBytesPerSec: 100_000,
    bandwidthBytesPerSecEnd: 15_000,
    baseLatencyMs: 150,
    jitterMs: 80,
  },
  degrading_severe: {
    // Harsher degradation: connectivity collapses harder toward the deadline,
    // so end-of-session submissions fail in a larger fraction of trials. This
    // populates the failure regime that `degrading` only reaches in ~2/30
    // seeds, letting the resilience contrast be estimated with tighter CIs
    // rather than resting on a couple of trials.
    label: 'Severely degrading over the exam (heavy contention collapse)',
    meanUpMs: 75 * 1000,
    meanDownMs: 20 * 1000,
    meanUpMsEnd: 20 * 1000,
    meanDownMsEnd: 360 * 1000,
    bandwidthBytesPerSec: 80_000,
    bandwidthBytesPerSecEnd: 8_000,
    baseLatencyMs: 200,
    jitterMs: 120,
  },

  // ---- FIELD-CALIBRATED SCENARIOS ----------------------------------------
  // Derived from a real exam deployment: 157 exam-day sessions across 61
  // uplinks, logged via the platform's own telemetry (up/down probes + RTT).
  // See measurements/telemetry-calibration.json. Bandwidth was NOT measured in
  // the field (only up/down state and RTT), so bandwidth here is a plausible
  // fixed value, not calibrated -- stated as a limitation.
  field_typical: {
    // The common case on exam day (6 Aug 2026). Connectivity mostly holds:
    // median UP run ~720 s, median DOWN run ~15 s -> ~1.9% downtime.
    label: 'Field-typical (measured exam day; the common good-connectivity case)',
    meanUpMs: 720 * 1000,
    meanDownMs: 15 * 1000,
    bandwidthBytesPerSec: 300_000,   // not measured in the field
    baseLatencyMs: 124,              // = measured median RTT (exam day)
    jitterMs: 120,                   // measured RTT p90 ~346 ms
  },
  field_bad: {
    // The measured tail: ~4% of real sessions on badly-degraded uplinks
    // (per-session downtime >=10%, up to 87.5%). For that cohort, median UP run
    // ~90 s, median DOWN run ~60 s (p90 ~300 s) -> ~34% downtime. This is where
    // the current single-submission design is actually exposed in the field.
    label: 'Field-bad-uplink (measured tail; ~4% of sessions, up to 87% downtime)',
    meanUpMs: 90 * 1000,
    meanDownMs: 45 * 1000,
    bandwidthBytesPerSec: 60_000,    // not measured in the field
    baseLatencyMs: 175,              // measured cellular-cohort median RTT
    jitterMs: 200,
  },
};

module.exports = { SCENARIOS };
