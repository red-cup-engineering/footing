// guard -- rate/abuse basics at a daily-tournament server's transport boundary. Extracted verbatim
// from apps/ruinfold/src/server/guard.mts (apps/durante/src/server/guard.mjs was already a
// byte-identical port of this exact surface). Two independent oversize dimensions, both meant to
// be checked BEFORE a submitted run's own replayFn ever sees it:
//   - MAX_BODY_BYTES: the raw HTTP body, checked while streaming so a consumer stops reading (and
//     never JSON.parses) a payload that's already absurd.
//   - MAX_LOG_MOVES: the parsed move/intent count -- a log could be well under MAX_BODY_BYTES in
//     raw size (tiny move objects) yet still carry an absurd number of intents; this is the guard
//     against that shape, independent of the byte cap.
// Both are exported as overridable defaults, not hardcoded into submission.mjs's pipeline --
// see submitDailyRun's own options.
//
// isSafeId is also the path-injection guard: an `actor` string gets embedded directly into
// on-disk (or GCS object-name) paths (scored-attempts/<date>/<actor>.json, runs/<date>.jsonl
// reads) by store.mjs, so anything that isn't this exact charset must be
// rejected before it ever reaches those modules.

export const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4MB
export const MAX_LOG_MOVES = 20_000; // well above any legitimate per-tick intent count

const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function isSafeId(v) {
  return typeof v === "string" && SAFE_ID_RE.test(v);
}

// isEntrantKind -- the optional, first-class "human"|"agent" self-label (footing's naming-table
// ruling: peer-labeling AI entrants is house strategy, on by default for any game that wants it;
// a game that doesn't ask for entrantKind on submission simply never calls this).
const ENTRANT_KINDS = new Set(["human", "agent"]);

export function isEntrantKind(v) {
  return typeof v === "string" && ENTRANT_KINDS.has(v);
}

// readBodyCapped -- streams a request body with a hard byte cap, stopping accumulation the
// instant the cap is crossed rather than buffering an arbitrarily large payload first and
// rejecting after the fact. `req` is any Node Readable-shaped object ('data'/'end'/'error'
// events); this module has no node:http import of its own, so it stays usable against a real
// IncomingMessage or a test double alike.
export function readBodyCapped(req, maxBytes) {
  return new Promise((resolve) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(tooLarge ? { ok: false } : { ok: true, text: Buffer.concat(chunks).toString("utf8") }));
    req.on("error", () => resolve({ ok: false }));
  });
}
