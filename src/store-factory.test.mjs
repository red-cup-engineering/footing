import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDailyStoreAuto } from "./store-factory.mjs";

test("daily runs, scores and one-attempt locks survive reopening the same local directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "footing-local-"));
  try {
    const store = openDailyStoreAuto(dir);
    const run = {runId:"r1", date:"2026-09-20", actor:"alice", score:100};
    await store.appendRun(run); await store.appendScore(run);
    await store.writeScoredLock(run.date, run.actor, run.runId);
    const reopened = openDailyStoreAuto(dir);
    assert.deepEqual(await reopened.readRunById(run.date, run.runId), run);
    assert.deepEqual(await reopened.readScoresForDate(run.date), [run]);
    await assert.rejects(reopened.writeScoredLock(run.date, run.actor, "r2"), {code:"EEXIST"});
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test("an empty local data directory is refused", () => {
  assert.throws(() => openDailyStoreAuto(""), /persistent local data directory/);
});
