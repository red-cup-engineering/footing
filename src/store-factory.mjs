import { openFileDailyStore } from "./store.mjs";

export function asAsyncDailyStore(store) {
  return {
    root: store.root,
    appendRun: (rec) => Promise.resolve().then(() => store.appendRun(rec)),
    readRunsForDate: (date) => Promise.resolve().then(() => store.readRunsForDate(date)),
    readRunById: (date, runId) => Promise.resolve().then(() => store.readRunById(date, runId)),
    appendScore: (rec) => Promise.resolve().then(() => store.appendScore(rec)),
    readScoresForDate: (date) => Promise.resolve().then(() => store.readScoresForDate(date)),
    listRunDates: () => Promise.resolve().then(() => store.listRunDates()),
    listScoreDates: () => Promise.resolve().then(() => store.listScoreDates()),
    hasScoredLock: (date, actor) => Promise.resolve().then(() => store.hasScoredLock(date, actor)),
    writeScoredLock: (date, actor, runId) => Promise.resolve().then(() => store.writeScoredLock(date, actor, runId)),
  };
}

export function openDailyStoreAuto(root) {
  if (typeof root !== "string" || root.length === 0) throw new TypeError("a persistent local data directory is required");
  return asAsyncDailyStore(openFileDailyStore(root));
}
