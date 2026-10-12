import { test } from "node:test";
import assert from "node:assert/strict";
import { submitDailyRun } from "./submission.mjs";

const TODAY = "2026-08-20";
const CANONICAL_SEED = 0xdeadbeef;

function fakeStore(overrides = {}) {
  const locks = new Set();
  const runs = [];
  const scores = [];
  return {
    runs,
    scores,
    hasScoredLock: async (date, actor) => locks.has(`${date}/${actor}`),
    writeScoredLock: async (date, actor) => {
      const key = `${date}/${actor}`;
      if (locks.has(key)) throw new Error("scored-lock-already-held");
      locks.add(key);
    },
    appendRun: async (rec) => runs.push(rec),
    appendScore: async (rec) => scores.push(rec),
    ...overrides,
  };
}

function acceptedReplay(overrides = {}) {
  return async () => ({ rejected: null, endedAt: { tick: 100, reason: "cleared" }, score: 500, ...overrides });
}

function baseOpts(overrides = {}) {
  return {
    store: fakeStore(),
    today: TODAY,
    body: { actor: "alice", date: TODAY, intentLog: [{ seq: 0, intent: { kind: "move" } }] },
    dailySeed: () => CANONICAL_SEED,
    replayFn: acceptedReplay(),
    ...overrides,
  };
}

// The exact bug this test file exists to regression-lock: submission.mjs's runRecord once
// silently omitted `seed`, matching neither ruinfold's nor durante's original wire/storage shape.
test("submitDailyRun: runRecord.seed is the hex-encoded canonical seed, in both games' original '0x'-prefixed 8-hex-digit form", async () => {
  const store = fakeStore();
  const result = await submitDailyRun(baseOpts({ store }));
  assert.equal(result.rejected, null);
  assert.equal(result.runRecord.seed, "0xdeadbeef");
  assert.equal(store.runs[0].seed, "0xdeadbeef");
});

test("submitDailyRun: a small canonical seed still zero-pads to 8 hex digits", async () => {
  const result = await submitDailyRun(baseOpts({ dailySeed: () => 0x2a }));
  assert.equal(result.runRecord.seed, "0x0000002a");
});

test("submitDailyRun: accepts either 'actor' or 'player' as the actor field", async () => {
  const r1 = await submitDailyRun(baseOpts({ body: { actor: "alice", date: TODAY, intentLog: [] } }));
  const r2 = await submitDailyRun(baseOpts({ body: { player: "alice", date: TODAY, intentLog: [] } }));
  assert.equal(r1.actor, "alice");
  assert.equal(r2.actor, "alice");
});

test("submitDailyRun: rejects a malformed/missing body", async () => {
  assert.deepEqual(await submitDailyRun(baseOpts({ body: undefined })), { rejected: "malformed-body" });
  assert.deepEqual(await submitDailyRun(baseOpts({ body: "not-an-object" })), { rejected: "malformed-body" });
});

test("submitDailyRun: rejects a bad or missing actor", async () => {
  assert.deepEqual(await submitDailyRun(baseOpts({ body: { date: TODAY, intentLog: [] } })), { rejected: "bad-actor" });
  assert.deepEqual(
    await submitDailyRun(baseOpts({ body: { actor: "../etc", date: TODAY, intentLog: [] } })),
    { rejected: "bad-actor" },
  );
});

test("submitDailyRun: rejects an invalid or future date", async () => {
  assert.deepEqual(
    await submitDailyRun(baseOpts({ body: { actor: "a", date: "not-a-date", intentLog: [] } })),
    { rejected: "bad-date" },
  );
  assert.deepEqual(
    await submitDailyRun(baseOpts({ body: { actor: "a", date: "2099-01-01", intentLog: [] } })),
    { rejected: "future-date" },
  );
});

test("submitDailyRun: rejects a submission with no intentLog/moves array", async () => {
  assert.deepEqual(await submitDailyRun(baseOpts({ body: { actor: "a", date: TODAY } })), { rejected: "missing-moves" });
});

test("submitDailyRun: rejects a log longer than maxLogMoves", async () => {
  const body = { actor: "a", date: TODAY, intentLog: new Array(5).fill({ seq: 0 }) };
  const result = await submitDailyRun(baseOpts({ body, maxLogMoves: 4 }));
  assert.deepEqual(result, { rejected: "too-many-moves" });
});

test("submitDailyRun: rejects a client-claimed seed that disagrees with the server-derived canonical seed", async () => {
  const body = { actor: "a", date: TODAY, seed: 0x12345678, intentLog: [] };
  assert.deepEqual(await submitDailyRun(baseOpts({ body })), { rejected: "seed-mismatch" });
});

test("submitDailyRun: a client-claimed seed matching the canonical seed is accepted (both number and hex-string forms)", async () => {
  const r1 = await submitDailyRun(baseOpts({ body: { actor: "a", date: TODAY, seed: CANONICAL_SEED, intentLog: [] } }));
  const r2 = await submitDailyRun(
    baseOpts({ body: { actor: "a", date: TODAY, seed: "0xdeadbeef", intentLog: [] } }),
  );
  assert.equal(r1.rejected, null);
  assert.equal(r2.rejected, null);
});

test("submitDailyRun: today forces scored mode; explicit mode:'practice' on the live date rejects", async () => {
  const r = await submitDailyRun(baseOpts({ body: { actor: "a", date: TODAY, intentLog: [] } }));
  assert.equal(r.mode, "scored");
  assert.deepEqual(
    await submitDailyRun(baseOpts({ body: { actor: "a", date: TODAY, mode: "practice", intentLog: [] } })),
    { rejected: "practice-not-allowed-on-live-date" },
  );
});

test("submitDailyRun: an earlier date forces practice mode; explicit mode:'scored' on a non-live date rejects", async () => {
  const r = await submitDailyRun(baseOpts({ body: { actor: "a", date: "2026-08-19", intentLog: [] } }));
  assert.equal(r.mode, "practice");
  assert.deepEqual(
    await submitDailyRun(baseOpts({ body: { actor: "a", date: "2026-08-19", mode: "scored", intentLog: [] } })),
    { rejected: "scored-only-valid-on-live-date" },
  );
});

test("submitDailyRun: already-scored-today (pre-check) -- a second scored submission for the same (date, actor) is rejected before replayFn ever runs", async () => {
  const store = fakeStore();
  let replayCalls = 0;
  const replayFn = async () => {
    replayCalls++;
    return { rejected: null, endedAt: { tick: 1, reason: "cleared" }, score: 10 };
  };
  await submitDailyRun(baseOpts({ store, replayFn }));
  const second = await submitDailyRun(baseOpts({ store, replayFn }));
  assert.deepEqual(second, { rejected: "already-scored-today" });
  assert.equal(replayCalls, 1); // replayFn never ran for the rejected second submission
});

test("submitDailyRun: already-scored-today (race) -- writeScoredLock throwing after the pre-check still surfaces as the same rejection", async () => {
  const store = fakeStore({
    hasScoredLock: async () => false, // pre-check passes...
    writeScoredLock: async () => {
      throw new Error("scored-lock-already-held: another instance won the race"); // ...but lost the real race
    },
  });
  const result = await submitDailyRun(baseOpts({ store }));
  assert.deepEqual(result, { rejected: "already-scored-today" });
});

test("submitDailyRun: when replayFn rejects a submission structurally, nothing is stored", async () => {
  const store = fakeStore();
  const replayFn = async () => ({ rejected: "malformed-intent" });
  const result = await submitDailyRun(baseOpts({ store, replayFn }));
  assert.deepEqual(result, { rejected: "malformed-intent" });
  assert.equal(store.runs.length, 0);
});

test("submitDailyRun: a null score (voided) is stored as a run but never as a score record, and is not leaderboard-eligible", async () => {
  const store = fakeStore();
  const replayFn = acceptedReplay({ score: null, endedAt: { tick: 50, reason: "voided" } });
  const result = await submitDailyRun(baseOpts({ store, replayFn }));
  assert.equal(result.rejected, null);
  assert.equal(result.score, null);
  assert.equal(result.leaderboardEligible, false);
  assert.equal(store.runs.length, 1);
  assert.equal(store.scores.length, 0);
  assert.equal(result.scoreRecord, null);
});

test("submitDailyRun: a practice-mode run is stored but never consumes the scored-lock or writes a score", async () => {
  const store = fakeStore();
  const result = await submitDailyRun(baseOpts({ store, body: { actor: "a", date: "2026-08-19", intentLog: [] } }));
  assert.equal(result.mode, "practice");
  assert.equal(store.runs.length, 1);
  assert.equal(store.scores.length, 0);
  assert.equal(await store.hasScoredLock("2026-08-19", "a"), false);
});

test("requireEntrantKind:false (ruinfold's posture) -- entrantKind defaults to 'human', never required, never rejected", async () => {
  const r1 = await submitDailyRun(baseOpts({ requireEntrantKind: false }));
  assert.equal(r1.entrantKind, "human");
  const r2 = await submitDailyRun(
    baseOpts({ requireEntrantKind: false, body: { actor: "a", date: TODAY, entrantKind: "agent", intentLog: [] } }),
  );
  assert.equal(r2.entrantKind, "agent"); // accepted if offered
  const r3 = await submitDailyRun(
    baseOpts({ requireEntrantKind: false, body: { actor: "a", date: TODAY, entrantKind: "bogus", intentLog: [] } }),
  );
  assert.equal(r3.rejected, null); // never rejects, even on a bogus value
  assert.equal(r3.entrantKind, "human"); // an unrecognized value is simply ignored, falls back to the default
});

test("requireEntrantKind:true (durante's exact existing posture) -- missing or unrecognized entrantKind rejects 'bad-entrant-kind'", async () => {
  assert.deepEqual(
    await submitDailyRun(baseOpts({ requireEntrantKind: true, body: { actor: "a", date: TODAY, intentLog: [] } })),
    { rejected: "bad-entrant-kind" },
  );
  assert.deepEqual(
    await submitDailyRun(
      baseOpts({ requireEntrantKind: true, body: { actor: "a", date: TODAY, entrantKind: "robot", intentLog: [] } }),
    ),
    { rejected: "bad-entrant-kind" },
  );
  const ok = await submitDailyRun(
    baseOpts({ requireEntrantKind: true, body: { actor: "a", date: TODAY, entrantKind: "agent", intentLog: [] } }),
  );
  assert.equal(ok.rejected, null);
  assert.equal(ok.entrantKind, "agent");
});

test("submitDailyRun: a forged client-supplied 'score' field in the body is never read -- the returned score always comes from replayFn", async () => {
  const replayFn = acceptedReplay({ score: 7 });
  const result = await submitDailyRun(
    baseOpts({ replayFn, body: { actor: "a", date: TODAY, score: 999999, intentLog: [] } }),
  );
  assert.equal(result.score, 7); // replayFn's own recomputation, not the client's claimed 999999
});
