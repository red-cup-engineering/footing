// leaderboard -- pure ranking (design: ruinfold's own daily design doc §5.1). Extracted verbatim
// from apps/ruinfold/src/server/leaderboard.mts's rankLeaderboard (apps/durante/src/server/
// leaderboard.mjs was already a byte-identical port). Takes already-loaded score records as plain
// data; does no file I/O itself, so it's testable with fixture arrays and never needs a store or
// a clock. The tiebreak order is exactly ruinfold's own three levels, plus one final
// deterministic level (runId) neither game's design strictly needs but both implementations
// already added so "ranking must never be ambiguous" holds even with identical score/tick/
// submittedAt in a fixture.
//
// weeklyTotals (ruinfold's own leaderboard.mts also exports it) does NOT move here -- it exists
// only to feed ruinfold's weekly-boon rollover, which is out of footing's scope. A future game
// that wants weekly aggregation gets to decide independently whether that's shared or local.

export function rankLeaderboard(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score; // 1. higher score
    if (a.endedAtTick !== b.endedAtTick) return a.endedAtTick - b.endedAtTick; // 2. lower endedAt.tick
    if (a.submittedAt !== b.submittedAt) return a.submittedAt < b.submittedAt ? -1 : 1; // 3. earlier submission
    return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0; // final: never ambiguous
  });
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}
