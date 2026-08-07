// Simulated ephemeral server-side state for one exam attempt. This models
// the minimal partial-ack buffer described in the design doc (Section 7) —
// keyed by an opaque per-attempt session, holding only answers-so-far, never
// linked to student identity until the final grade call. It lives only in
// this Node process for the duration of one simulated run; it is not, and
// does not need to be, the real Cloudflare Worker.
'use strict';

class ServerState {
  constructor() {
    this.answers = new Map(); // qid -> { value, seq }
    this.graded = false;
  }

  // Delta client: apply only changes newer than what's already stored for
  // that qid (idempotent last-write-wins by local seq). Replaying the same
  // delta twice, or receiving it out of order after a newer one, is a no-op.
  applyDelta(changes) {
    for (const c of changes) {
      const existing = this.answers.get(c.qid);
      if (!existing || c.seq > existing.seq) {
        this.answers.set(c.qid, { value: c.value, seq: c.seq });
      }
    }
  }

  // Baseline clients: unconditional overwrite with the full snapshot sent.
  applyFullSnapshot(entries) {
    this.answers = new Map(entries.map((e) => [e.qid, { value: e.value, seq: e.seq || 0 }]));
  }

  answeredCount() {
    return this.answers.size;
  }

  markGraded() {
    this.graded = true;
  }
}

module.exports = { ServerState };
