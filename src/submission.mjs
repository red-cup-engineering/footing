// submission -- the game-agnostic half of a daily tournament's POST /runs pipeline. Extracted
// from apps/ruinfold/src/server.mts's handleSubmitRun and apps/durante/src/server.mjs's own
// (already near-identical) handleSubmitRun, keeping every validation step and its exact
// rejection-reason string, in the exact order both existing implementations already used:
// body size -> JSON parse -> body shape -> actor -> [entrantKind, if required] -> date ->
// moves-array presence -> too-many-moves -> seed mismatch -> mode-by-date -> scored-lock
// precheck -> replayFn -> store unconditionally -> scored-lock + score iff scored.
//
// What does NOT move here, deliberately: HTTP response-body SHAPING. ruinfold's and durante's
// existing wire responses differ by exactly one field (entrantKind), and each game's own
// server.mts/mjs already builds its response object from a small, explicit field list -- keeping
// that one step local means this module can never accidentally add/reorder/rename a field in
// either game's real HTTP response, which is what the byte-diff acceptance gate this package's
// extraction was built against actually checks. Call submitDailyRun(), then build your own
// response object from its returned fields exactly the way your server already does.
//
// A "forged" client-supplied score is never read anywhere in this module (or in either app's
// history) -- the returned score always comes from replayFn's own recomputation. That is the
// whole of the "server only trusts its own replay" cheat-resistance property; there is no
// separate reject-a-forged-score check to port because there was never a code path that read one.

import { isSafeId, isEntrantKind } from "./guard.mjs";
import { isValidDateStr } from "./dates.mjs";

// Canonical wire form for a daily seed, shared by ruinfold and durante already
// (identical implementations in both servers before extraction).
function hexSeed(n) {
  return "0x" + (n >>> 0).toString(16).padStart(8, "0");
}

// submitDailyRun(opts) -> Promise<SubmitResult>
//
// opts:
//   store        DailyStore (or AsyncStore-shaped) -- see store-factory.mjs
//   today        string, this request's one real-clock UTC date read (todayUTC())
//   body         the already JSON.parsed request body (an object) -- or `undefined`/non-object,
//                which rejects "malformed-body" as if parsing had failed
//   dailySeed    (date: string) => number -- the game's own canonical seed derivation
//   replayFn     (date: string, submission: {actor, entrantKind, intentLog}) => ReplayResult,
//                the game's own pure replay-and-score function (ruinfold's replay(),
//                durante's replayRun()) -- opaque to this module; its own rejection strings and
//                endedAt.reason vocabulary pass through untouched
//   maxLogMoves  number, default 20000 (guard.mjs's MAX_LOG_MOVES) -- checked against
//                (body.intentLog ?? body.moves).length before replayFn is ever called
//   requireEntrantKind
//                boolean, default false. false (ruinfold's posture): entrantKind is accepted if
//                present, defaulted to "human" if absent, NEVER rejects on it -- ruinfold's
//                existing behavior (the field didn't exist) is unchanged since it never sends one.
//                true (durante's exact existing posture): entrantKind is REQUIRED and validated;
//                missing or unrecognized rejects "bad-entrant-kind", exactly durante's current
//                behavior, byte-for-byte.
//
// SubmitResult is either { rejected: <string> } or:
//   { rejected: null, runId, date, actor, entrantKind, mode, endedAt, score,
//     leaderboardEligible, runRecord, scoreRecord }
// `runRecord`/`scoreRecord` are exactly what was (or would be, if not scored) passed to
// store.appendRun/appendScore -- a caller building its own historical wire shape reads whichever
// of the top-level fields it already returned; entrantKind is always present on the result (as
// "human" when not required/supplied) so a caller that wants to start returning it can, and one
// that doesn't just never reads it.
export async function submitDailyRun(opts) {
  const { store, today, body, dailySeed, replayFn, maxLogMoves = 20_000, requireEntrantKind = false } = opts;

  if (!body || typeof body !== "object") return { rejected: "malformed-body" };
  const b = body;

  // "player" and "actor" are the same thing -- both existing apps accept either.
  const actor = typeof b.actor === "string" ? b.actor : typeof b.player === "string" ? b.player : null;
  if (!actor || !isSafeId(actor)) return { rejected: "bad-actor" };

  let entrantKind = "human";
  if (requireEntrantKind) {
    if (!isEntrantKind(b.entrantKind)) return { rejected: "bad-entrant-kind" };
    entrantKind = b.entrantKind;
  } else if (isEntrantKind(b.entrantKind)) {
    entrantKind = b.entrantKind; // accepted if offered, never required, never rejected
  }

  const date = typeof b.date === "string" ? b.date : today;
  if (!isValidDateStr(date)) return { rejected: "bad-date" };
  if (date > today) return { rejected: "future-date" };

  const intentLog = Array.isArray(b.intentLog) ? b.intentLog : Array.isArray(b.moves) ? b.moves : null;
  if (!intentLog) return { rejected: "missing-moves" };
  if (intentLog.length > maxLogMoves) return { rejected: "too-many-moves" };

  const canonicalSeed = dailySeed(date); // ALWAYS server-derived -- never trust a client-supplied seed
  if (typeof b.seed === "string" || typeof b.seed === "number") {
    const claimed = typeof b.seed === "number" ? b.seed >>> 0 : Number(b.seed) >>> 0;
    if (claimed !== canonicalSeed) return { rejected: "seed-mismatch" };
  }

  // Today's daily is automatically scored, full stop; practice is only ever against an earlier
  // date, never the live one -- both directions rejected explicitly.
  let mode;
  if (date === today) {
    if (b.mode === "practice") return { rejected: "practice-not-allowed-on-live-date" };
    mode = "scored";
  } else {
    if (b.mode === "scored") return { rejected: "scored-only-valid-on-live-date" };
    mode = "practice";
  }

  if (mode === "scored" && (await store.hasScoredLock(date, actor))) {
    return { rejected: "already-scored-today" };
  }

  const result = await replayFn(date, { actor, entrantKind, intentLog });
  if (result.rejected) return { rejected: result.rejected };

  const runId = `${date}__${actor}__${cryptoRandomId()}`; // storage key only -- never fed back into replayFn
  const submittedAt = new Date().toISOString(); // server bookkeeping timestamp -- the leaderboard's own tiebreak read

  const runRecord = {
    runId,
    date,
    actor,
    entrantKind,
    mode,
    seed: hexSeed(canonicalSeed),
    moves: intentLog,
    endedAt: result.endedAt,
    score: result.score,
    submittedAt,
  };
  await store.appendRun(runRecord);

  let scoreRecord = null;
  if (mode === "scored") {
    // Consumes the one scored attempt even on a non-cleared ending -- a free do-over would turn
    // every hazard/tick-cap into a non-event. writeScoredLock is atomic create-only: it REJECTS
    // if a concurrent instance won the (date, actor) lock between the pre-check above and here.
    try {
      await store.writeScoredLock(date, actor, runId);
    } catch {
      return { rejected: "already-scored-today" };
    }
    if (result.score !== null) {
      scoreRecord = {
        runId,
        date,
        actor,
        entrantKind,
        score: result.score,
        endedAtTick: result.endedAt.tick,
        reason: result.endedAt.reason,
        submittedAt,
      };
      await store.appendScore(scoreRecord);
    }
  }

  return {
    rejected: null,
    runId,
    date,
    actor,
    entrantKind,
    mode,
    endedAt: result.endedAt,
    score: result.score,
    leaderboardEligible: mode === "scored" && result.score !== null,
    runRecord,
    scoreRecord,
  };
}

// cryptoRandomId -- node:crypto's randomUUID, imported lazily/locally so this module has exactly
// one Node-stdlib dependency and it's obvious at the call site what it's for (a storage key,
// never fed back into replayFn -- see this module's header and both apps' own server files' own
// identical comment on their randomUUID() call).
import { randomUUID } from "node:crypto";
function cryptoRandomId() {
  return randomUUID();
}
