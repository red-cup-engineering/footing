import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFileDailyStore } from "./store.mjs";

function scratchStore() {
  const dir = mkdtempSync(join(tmpdir(), "footing-store-test-"));
  return { store: openFileDailyStore(dir), dir };
}

test("appendRun/readRunsForDate: round-trips a run record, JSONL, append-only", () => {
  const { store, dir } = scratchStore();
  try {
    const rec = { runId: "r1", date: "2026-08-20", actor: "alice", score: 100 };
    store.appendRun(rec);
    store.appendRun({ ...rec, runId: "r2" });
    assert.deepEqual(store.readRunsForDate("2026-08-20").map((r) => r.runId), ["r1", "r2"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readRunsForDate: an unwritten date returns an empty array, not an error", () => {
  const { store, dir } = scratchStore();
  try {
    assert.deepEqual(store.readRunsForDate("2026-01-01"), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readRunById: finds a run by id within its date, null if absent", () => {
  const { store, dir } = scratchStore();
  try {
    store.appendRun({ runId: "r1", date: "2026-08-20" });
    assert.equal((store.readRunById("2026-08-20", "r1")).runId, "r1");
    assert.equal(store.readRunById("2026-08-20", "nope"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appendScore/readScoresForDate: round-trips a score record", () => {
  const { store, dir } = scratchStore();
  try {
    store.appendScore({ runId: "r1", date: "2026-08-20", score: 500 });
    assert.deepEqual(store.readScoresForDate("2026-08-20"), [{ runId: "r1", date: "2026-08-20", score: 500 }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hasScoredLock/writeScoredLock: the one-scored-attempt-per-day lock", () => {
  const { store, dir } = scratchStore();
  try {
    assert.equal(store.hasScoredLock("2026-08-20", "alice"), false);
    store.writeScoredLock("2026-08-20", "alice", "r1");
    assert.equal(store.hasScoredLock("2026-08-20", "alice"), true);
    // a different actor/date is independent
    assert.equal(store.hasScoredLock("2026-08-20", "bob"), false);
    assert.equal(store.hasScoredLock("2026-08-21", "alice"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("listRunDates/listScoreDates: sorted date lists derived from the files actually written", () => {
  const { store, dir } = scratchStore();
  try {
    store.appendRun({ runId: "r1", date: "2026-08-21" });
    store.appendRun({ runId: "r2", date: "2026-08-20" });
    assert.deepEqual(store.listRunDates(), ["2026-08-20", "2026-08-21"]);
    assert.deepEqual(store.listScoreDates(), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("record shape is opaque -- an entrantKind field (or any extra field) round-trips untouched", () => {
  const { store, dir } = scratchStore();
  try {
    store.appendRun({ runId: "r1", date: "2026-08-20", entrantKind: "agent" });
    assert.equal((store.readRunsForDate("2026-08-20")[0]).entrantKind, "agent");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
