import { test } from "node:test";
import assert from "node:assert/strict";
import { formatUTCDate, isValidDateStr, addDaysUTC, todayUTC } from "./dates.mjs";

test("formatUTCDate: zero-pads month and day", () => {
  assert.equal(formatUTCDate(new Date(Date.UTC(2026, 0, 5))), "2026-01-05");
  assert.equal(formatUTCDate(new Date(Date.UTC(2026, 11, 31))), "2026-12-31");
});

test("isValidDateStr: accepts a real calendar date", () => {
  assert.equal(isValidDateStr("2026-08-20"), true);
});

test("isValidDateStr: rejects a calendar-impossible date (Feb 30)", () => {
  assert.equal(isValidDateStr("2026-02-30"), false);
});

test("isValidDateStr: rejects malformed shapes and non-strings", () => {
  assert.equal(isValidDateStr("2026-8-20"), false);
  assert.equal(isValidDateStr("not-a-date"), false);
  assert.equal(isValidDateStr(""), false);
  // @ts-expect-error deliberate non-string input
  assert.equal(isValidDateStr(20260820), false);
});

test("isValidDateStr: honors real leap years", () => {
  assert.equal(isValidDateStr("2024-02-29"), true); // leap
  assert.equal(isValidDateStr("2023-02-29"), false); // not leap
});

test("addDaysUTC: pure calendar arithmetic, including month/year rollover", () => {
  assert.equal(addDaysUTC("2026-08-20", 1), "2026-08-21");
  assert.equal(addDaysUTC("2026-08-31", 1), "2026-09-01");
  assert.equal(addDaysUTC("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysUTC("2026-08-20", -20), "2026-07-31");
});

test("todayUTC: returns today's real UTC date, matching formatUTCDate(new Date())", () => {
  assert.equal(todayUTC(), formatUTCDate(new Date()));
});
