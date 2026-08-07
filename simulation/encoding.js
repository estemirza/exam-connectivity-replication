// Byte-size model for the simulated wire protocol.
//
// We only model request/response BODY bytes (not TCP/TLS/HTTP header overhead),
// and we use the same constants across every algorithm under test, so relative
// comparisons stay fair. The constants are CALIBRATED so that a full 40-answer
// submission (full snapshot + final metadata) matches the median real submit
// body measured in the field, ~782 B (measurements/telemetry-calibration.json):
//   ENVELOPE + 40*PER_FULL_ANSWER + FINAL_METADATA = 46 + 680 + 68 = 794 B.
// Because all constants were scaled by the same factor, every delta-vs-full
// ratio is unchanged from the pre-calibration model; only absolute byte figures
// move, and they now reflect the real payload.
'use strict';

const ENVELOPE_BYTES = 46;        // sessionToken + level + seed + JSON punctuation
const PER_DELTA_BYTES = 21;       // {qid, value, seq} entry inside a delta payload
const PER_FULL_ANSWER_BYTES = 17; // {qid, value} entry inside a full-snapshot payload
const FINAL_METADATA_BYTES = 68;  // nama + kelas + "grade me now" flag, sent once
const ACK_BYTES = 15;             // small ack body (delta ack or full-sync ack)
const CERT_BYTES = 167;           // signed certificate payload on a passing grade call

// --- Energy model (illustrative, activation-dominated) ---------------------
// A pure bytes-transferred metric misses that each sync attempt is a radio /
// network activation with its own energy cost, largely independent of payload
// size (ramp-up + tail energy on cellular/wifi). These constants are ORDER-OF-
// MAGNITUDE illustrative, not measured on hardware; they exist so the paper can
// report a relative energy-proxy axis alongside bytes, not an absolute Joule
// prediction. Because activation cost >> per-byte cost, this proxy is dominated
// by attempt COUNT — which is exactly the axis a bytes-only metric hides.
const ENERGY_PER_ACTIVATION_J = 5.0;    // radio ramp + tail per transmission attempt
const ENERGY_PER_BYTE_J = 1e-5;         // marginal transfer energy per body byte

function energyProxyJoules(attempts, totalBytes) {
  return attempts * ENERGY_PER_ACTIVATION_J + totalBytes * ENERGY_PER_BYTE_J;
}

function deltaPayloadBytes(numChanges) {
  return ENVELOPE_BYTES + numChanges * PER_DELTA_BYTES;
}

function fullSnapshotBytes(numAnswered) {
  return ENVELOPE_BYTES + numAnswered * PER_FULL_ANSWER_BYTES;
}

module.exports = {
  ENVELOPE_BYTES,
  PER_DELTA_BYTES,
  PER_FULL_ANSWER_BYTES,
  FINAL_METADATA_BYTES,
  ACK_BYTES,
  CERT_BYTES,
  ENERGY_PER_ACTIVATION_J,
  ENERGY_PER_BYTE_J,
  deltaPayloadBytes,
  fullSnapshotBytes,
  energyProxyJoules,
};
