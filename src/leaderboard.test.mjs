import { test } from "node:test";
import assert from "node:assert/strict";
import { rankLeaderboard } from "./leaderboard.mjs";

function entry(overrides = {}) {
  return {
    runId: "r1",
    actor: "alice",
    score: 100,
    endedAtTick: 500,
    submittedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

test("rankLeaderboard: higher score ranks first", () => {
  const ranked = rankLeaderboard([entry({ runId: "a", score: 50 }), entry({ runId: "b", score: 200 })]);
  assert.deepEqual(ranked.map((e) => e.runId), ["b", "a"]);
  assert.deepEqual(ranked.map((e) => e.rank), [1, 2]);
});

test("rankLeaderboard: tiebreak 2 -- equal score, lower endedAtTick (faster) ranks first", () => {
  const ranked = rankLeaderboard([
    entry({ runId: "slow", score: 100, endedAtTick: 900 }),
    entry({ runId: "fast", score: 100, endedAtTick: 300 }),
  ]);
  assert.deepEqual(ranked.map((e) => e.runId), ["fast", "slow"]);
});

test("rankLeaderboard: tiebreak 3 -- equal score and tick, earlier submittedAt ranks first", () => {
  const ranked = rankLeaderboard([
    entry({ runId: "later", score: 100, endedAtTick: 300, submittedAt: "2026-08-20T12:00:00.000Z" }),
    entry({ runId: "earlier", score: 100, endedAtTick: 300, submittedAt: "2026-08-20T01:00:00.000Z" }),
  ]);
  assert.deepEqual(ranked.map((e) => e.runId), ["earlier", "later"]);
});

test("rankLeaderboard: final tiebreak -- runId -- is never ambiguous even with every other field tied", () => {
  const ranked = rankLeaderboard([
    entry({ runId: "zzz", score: 100, endedAtTick: 300, submittedAt: "2026-08-20T00:00:00.000Z" }),
    entry({ runId: "aaa", score: 100, endedAtTick: 300, submittedAt: "2026-08-20T00:00:00.000Z" }),
  ]);
  assert.deepEqual(ranked.map((e) => e.runId), ["aaa", "zzz"]);
});

test("rankLeaderboard: an empty leaderboard ranks to an empty array", () => {
  assert.deepEqual(rankLeaderboard([]), []);
});

test("rankLeaderboard: entrantKind (or any extra field) rides along untouched -- the ranking function never inspects it", () => {
  const ranked = rankLeaderboard([{ ...entry({ runId: "a" }), entrantKind: "agent" }]);
  assert.equal((ranked[0]).entrantKind, "agent");
});
