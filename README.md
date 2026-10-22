# footing

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

`@red-cup-engineering/footing` — the daily-tournament plumbing shared by every 561 Group game
with a seeded-daily, server-replay-verified competitive mode. Extracted from apps/ruinfold's own
`src/server/*` modules (the implementation) after apps/durante independently,
disclosedly ported the same modules; this package is that duplication resolved, not a new design.

A game supplies its own `dailySeed(date)` and `replayFn(date, submission)` (pure, game-specific —
that's where the actual game engine lives); footing owns everything else the tournament loop needs
regardless of which game it is: UTC date arithmetic, submission guards, an append-only
run/score/scored-lock store (local files behind an async surface),
leaderboard ranking, and the game-agnostic half of the submission pipeline.

Zero runtime dependencies.

## Modules

- `./dates` — `formatUTCDate`, `isValidDateStr`, `addDaysUTC`, `todayUTC`.
- `./guard` — `MAX_BODY_BYTES`, `MAX_LOG_MOVES`, `isSafeId`, `isEntrantKind`, `readBodyCapped`.
- `./leaderboard` — `rankLeaderboard` (4-level tiebreak: score, endedAt.tick, submittedAt, runId).
- `./store` — `openFileDailyStore(root)`, the synchronous local file-store.
- `./store-factory` — `openDailyStoreAuto(root)` opens the local daily store;
  `asAsyncDailyStore` adapts a synchronous store onto the async surface. The scored lock
  uses exclusive file creation, preserving one scored attempt across concurrent requests.
- `./submission` — `submitDailyRun(opts)`, the POST /runs pipeline: guard → validate shape →
  derive the seed → force mode by date === today → scored-lock precheck → your
  `replayFn` → store unconditionally → scored-lock + score iff scored. Returns a result object;
  building the actual HTTP response body stays the caller's job (see the module's own header for
  why: it's what keeps the byte-diff between two games' wire shapes exact).

## Naming table (cartridge / qwzspace / footing)

`seq` and `actor` are kept as-is from the two apps' own history (renaming would touch every
consumer's store for no behavioral gain). `intent` is cartridge's own published envelope field,
untouched — footing sits between cartridge's intent-log input and its own run/score records, it
does not redefine cartridge's contract. `tick` is optional on a `Move`: ruinfold's log entries
declare it per-move; durante's engine derives it internally and never puts it on the move.
`entrantKind` is first-class and optional (default `"human"`) — peer-labeling AI entrants; a game
that doesn't ask for it (`requireEntrantKind: false`) never sees the field, one that requires it
(`requireEntrantKind: true`, durante's exact existing posture) rejects `"bad-entrant-kind"` on a
missing/invalid value.

## What stays local to a game, deliberately not in footing

Weekly boon/reward-ledger rollover (ruinfold-only today); a game's own scoring formula and
end-reason vocabulary (opaque to footing's replay contract — `{rejected: string} | {rejected:
null, endedAt: {tick, reason}, score: number | null}`); HTTP response-body field selection/order.
