// store -- append-only JSONL persistence for a daily tournament's runs/scores/scored-lock, the
// local file-store backend. Extracted verbatim from apps/ruinfold/src/server/store.mts's own
// run/score/lock surface (its `LedgerEntry`/`BoonRecord` types and their four append/read
// methods do NOT move here -- they're ruinfold's own weekly-boon extension, composed on top of
// this store locally, not part of footing's contract; see footing's design report). Every write
// is an append; nothing is ever rewritten in place, which is what makes the whole thing
// crash-safe and auditable. Root directory is a constructor PARAMETER, never a hardcoded path.
//
// Layout under root:
//   runs/<date>.jsonl              one line per accepted run (any mode, any outcome)
//   scores/<date>.jsonl            one line per SCORED, non-null-score run -- the leaderboard source
//   scored-attempts/<date>/<actor>.json   the one-scored-run-per-day lock
//
// Record shape is intentionally NOT validated or narrowed here: a RunRecord/ScoreRecord is
// whatever object a caller passes to appendRun/appendScore, serialized as-is. This is what makes
// the optional `entrantKind` field (footing's naming-table ruling: first-class, default "human",
// but a game that never sets it just never sees the key) free at this layer -- store.mjs has no
// opinion on which keys a record carries, only that every write is one JSON-encoded line appended
// to the right file.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function ensureDirFor(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function appendJSONL(file, obj) {
  ensureDirFor(file);
  appendFileSync(file, JSON.stringify(obj) + "\n", "utf8");
}

function readJSONL(file) {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const out = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) out.push(JSON.parse(trimmed));
  }
  return out;
}

function listDates(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.slice(0, -".jsonl".length))
    .sort();
}

// Open a durable local tournament directory.
export function openFileDailyStore(root) {
  const runsDir = join(root, "runs");
  const scoresDir = join(root, "scores");
  const lockDir = join(root, "scored-attempts");

  const runFile = (date) => join(runsDir, `${date}.jsonl`);
  const scoreFile = (date) => join(scoresDir, `${date}.jsonl`);
  const lockFile = (date, actor) => join(lockDir, date, `${actor}.json`);

  return {
    root,
    appendRun(rec) {
      appendJSONL(runFile(rec.date), rec);
    },
    readRunsForDate(date) {
      return readJSONL(runFile(date));
    },
    readRunById(date, runId) {
      return this.readRunsForDate(date).find((r) => r.runId === runId) ?? null;
    },
    appendScore(rec) {
      appendJSONL(scoreFile(rec.date), rec);
    },
    readScoresForDate(date) {
      return readJSONL(scoreFile(date));
    },
    listRunDates() {
      return listDates(runsDir);
    },
    listScoreDates() {
      return listDates(scoresDir);
    },
    hasScoredLock(date, actor) {
      return existsSync(lockFile(date, actor));
    },
    writeScoredLock(date, actor, runId) {
      const f = lockFile(date, actor);
      ensureDirFor(f);
      writeFileSync(f, JSON.stringify({ actor, date, runId, lockedAt: new Date().toISOString() }), { encoding: "utf8", flag: "wx", flush: true });
    },
  };
}
