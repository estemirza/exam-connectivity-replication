// Synthetic "student" answer-entry schedule: WHEN each of the 40 questions
// gets answered, plus occasional revisions (changing an earlier answer)
// before the exam ends. The same schedule is reused for every algorithm in a
// given trial, so sync strategy is the only thing that varies.
'use strict';

const NUM_DIRECT = 25;
const NUM_STORY = 15;
const NUM_QUESTIONS = NUM_DIRECT + NUM_STORY; // 40, matches the platform's real per-level count
const REVISION_PROBABILITY = 0.25;

function questionIds(level) {
  const ids = [];
  for (let i = 1; i <= NUM_DIRECT; i++) ids.push(`L${level}-D-${i}`);
  for (let i = 1; i <= NUM_STORY; i++) ids.push(`L${level}-S-${i}`);
  return ids;
}

/**
 * Build a chronological list of answer events: { t, qid, value }.
 * First-answer times are spread across the middle of the exam window
 * (leaving a little time at the very start for reading instructions and at
 * the very end implicitly reserved for review), in randomized question
 * order (students don't necessarily answer in id order). ~25% of questions
 * get a later revision event simulating a change of mind.
 */
function buildAnswerSchedule(rng, level, examDurationMs, completionRate = 1.0) {
  const ids = questionIds(level);
  // Shuffle order in which questions get tackled.
  const order = ids.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // Incomplete-session model: a student under time pressure may not reach every
  // question. Answer only `answered` of the 40 (rounded), still spread across
  // the whole window — the remaining questions are simply never answered. At
  // completionRate = 1.0 this reduces exactly to the original all-40 schedule.
  const answered = Math.max(1, Math.min(order.length, Math.round(completionRate * order.length)));
  const tackled = order.slice(0, answered);

  const startBuffer = 0.02 * examDurationMs;
  const endBuffer = 0.05 * examDurationMs;
  const usable = examDurationMs - startBuffer - endBuffer;

  const events = [];
  tackled.forEach((qid, i) => {
    // Spread roughly evenly with jitter across the full window, over however
    // many questions the student actually reaches.
    const base = startBuffer + (usable * (i + rng() * 0.6)) / tackled.length;
    const t = Math.min(Math.max(base, startBuffer), examDurationMs - endBuffer);
    const value = simulatedAnswerValue(rng, qid);
    events.push({ t, qid, value });

    if (rng() < REVISION_PROBABILITY) {
      const revisedAt = Math.min(t + rng() * (examDurationMs - endBuffer - t), examDurationMs - endBuffer);
      if (revisedAt > t) {
        events.push({ t: revisedAt, qid, value: simulatedAnswerValue(rng, qid + '-rev') });
      }
    }
  });

  events.sort((a, b) => a.t - b.t);
  return events;
}

function simulatedAnswerValue(rng, qid) {
  // We don't need real math answers for the sync simulation — just distinct,
  // plausible-sized values matching the platform's actual answer shapes (an MCQ
  // letter or a short numeric/text string).
  if (rng() < 0.5) return ['A', 'B', 'C', 'D'][Math.floor(rng() * 4)];
  return String(Math.floor(rng() * 1000) - 500);
}

module.exports = { buildAnswerSchedule, questionIds, NUM_QUESTIONS };
