// Delta-sync client: tracks only changed answers since the last acknowledged
// sync, coalesces multiple edits to the same question into one outgoing
// value, and treats retries as idempotent via a per-question local seq
// (see design doc Section 3). Periodic ticks + reconnect events are the
// sync triggers; the final grading call piggybacks whatever is still dirty.
'use strict';

const { attemptSend } = require('./network-sim');
const { buildWakeTimes } = require('./timeline');
const { ServerState } = require('./sim-server');
const { deltaPayloadBytes, FINAL_METADATA_BYTES, ACK_BYTES, CERT_BYTES } = require('./encoding');

function runDeltaTrial({ trace, answerEvents, examDurationMs, graceMs, syncIntervalMs, networkParams }) {
  const server = new ServerState();

  const answers = new Map();       // qid -> current value
  const localSeq = new Map();      // qid -> latest local seq
  const ackedSeq = new Map();      // qid -> highest seq server has acked (client's view)
  let seqCounter = 0;

  const metrics = {
    uplinkBytes: 0,
    downlinkBytes: 0,
    attempts: 0,
    successes: 0,
    failures: 0,
    gradedAt: null,
    gradingFailed: false,
  };

  const wakeTimes = buildWakeTimes(trace, examDurationMs, graceMs, syncIntervalMs);
  let eventIdx = 0;
  let graded = false;

  function applyDueAnswerEvents(uptoMs) {
    while (eventIdx < answerEvents.length && answerEvents[eventIdx].t <= uptoMs) {
      const ev = answerEvents[eventIdx];
      seqCounter += 1;
      answers.set(ev.qid, ev.value);
      localSeq.set(ev.qid, seqCounter);
      eventIdx += 1;
    }
  }

  function dirtyQids() {
    const out = [];
    for (const [qid, seq] of localSeq) {
      if ((ackedSeq.get(qid) || 0) < seq) out.push(qid);
    }
    return out;
  }

  function attemptSync(tMs, isFinal) {
    const dirty = dirtyQids();
    if (dirty.length === 0 && !isFinal) return; // nothing to send, zero bytes

    const changes = dirty.map((qid) => ({ qid, value: answers.get(qid), seq: localSeq.get(qid) }));
    const snapshotSeq = new Map(changes.map((c) => [c.qid, c.seq]));
    const bytes = deltaPayloadBytes(changes.length) + (isFinal ? FINAL_METADATA_BYTES : 0);

    metrics.attempts += 1;
    const result = attemptSend(trace, tMs, bytes, networkParams);
    metrics.uplinkBytes += result.bytesSent;

    if (result.success) {
      metrics.successes += 1;
      metrics.downlinkBytes += ACK_BYTES + (isFinal ? CERT_BYTES : 0);
      server.applyDelta(changes);
      for (const c of changes) {
        // Only mark acked if the value hasn't been changed again since this
        // payload was built — otherwise it's still dirty for the next round.
        if (localSeq.get(c.qid) === snapshotSeq.get(c.qid)) ackedSeq.set(c.qid, c.seq);
      }
      if (isFinal) {
        server.markGraded();
        graded = true;
        metrics.gradedAt = result.completesAt;
      }
    } else {
      metrics.failures += 1;
    }
  }

  for (const tMs of wakeTimes) {
    if (graded) break;
    applyDueAnswerEvents(tMs);
    const isFinal = tMs >= examDurationMs;
    attemptSync(tMs, isFinal);
  }

  if (!graded) metrics.gradingFailed = true;

  const totalAnswered = answers.size;
  const preservedOnServer = server.answeredCount();

  return {
    algorithm: 'delta',
    ...metrics,
    totalAnswered,
    preservedOnServer,
    preservedFraction: totalAnswered === 0 ? 1 : preservedOnServer / totalAnswered,
  };
}

module.exports = { runDeltaTrial };
