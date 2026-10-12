import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { isSafeId, isEntrantKind, readBodyCapped, MAX_BODY_BYTES, MAX_LOG_MOVES } from "./guard.mjs";

test("isSafeId: accepts alphanumeric/hyphen/underscore ids up to 64 chars", () => {
  assert.equal(isSafeId("player-1"), true);
  assert.equal(isSafeId("a"), true);
  assert.equal(isSafeId("A1_-"), true);
});

test("isSafeId: rejects path-injection attempts and empty/oversize/non-string values", () => {
  assert.equal(isSafeId("../../etc/passwd"), false);
  assert.equal(isSafeId(""), false);
  assert.equal(isSafeId("a".repeat(65)), false);
  assert.equal(isSafeId(null), false);
  assert.equal(isSafeId(42), false);
});

test("isEntrantKind: exactly 'human' or 'agent', nothing else", () => {
  assert.equal(isEntrantKind("human"), true);
  assert.equal(isEntrantKind("agent"), true);
  assert.equal(isEntrantKind("robot"), false);
  assert.equal(isEntrantKind(""), false);
  assert.equal(isEntrantKind(undefined), false);
});

test("MAX_BODY_BYTES / MAX_LOG_MOVES are positive, sane bounds", () => {
  assert.ok(MAX_BODY_BYTES > 0);
  assert.ok(MAX_LOG_MOVES > 0);
});

function fakeReq() {
  return new EventEmitter();
}

test("readBodyCapped: resolves the concatenated body text on 'end'", async () => {
  const req = fakeReq();
  const p = readBodyCapped(req, 1000);
  req.emit("data", Buffer.from("hello "));
  req.emit("data", Buffer.from("world"));
  req.emit("end");
  assert.deepEqual(await p, { ok: true, text: "hello world" });
});

test("readBodyCapped: stops accumulating and reports not-ok once the byte cap is crossed", async () => {
  const req = fakeReq();
  const p = readBodyCapped(req, 5);
  req.emit("data", Buffer.from("123456789"));
  req.emit("end");
  assert.deepEqual(await p, { ok: false });
});

test("readBodyCapped: an 'error' event resolves not-ok rather than rejecting", async () => {
  const req = fakeReq();
  const p = readBodyCapped(req, 1000);
  req.emit("error", new Error("boom"));
  assert.deepEqual(await p, { ok: false });
});
