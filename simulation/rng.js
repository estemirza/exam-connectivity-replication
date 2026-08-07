// Seeded PRNG (mulberry32) — same algorithm the platform's own generators use, reused
// here for continuity and because it's small, fast, and deterministic.
'use strict';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal via Box-Muller, driven by the same seeded rng.
function sampleNormal(rng) {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Log-normal duration sampler parameterized by desired mean (not mu directly),
// so scenario configs can just say "mean up-time 90s" and get a distribution
// of durations around that mean instead of a fixed metronome cycle.
function sampleLogNormalMean(rng, meanMs, sigma = 0.6) {
  const mu = Math.log(meanMs) - (sigma * sigma) / 2;
  return Math.exp(mu + sigma * sampleNormal(rng));
}

module.exports = { mulberry32, sampleNormal, sampleLogNormalMean };
