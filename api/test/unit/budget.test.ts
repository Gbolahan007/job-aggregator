import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDailyCap, checkFeedInterval } from "../../src/ingestion/budget.js";

const now = new Date("2026-11-10T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

test("a feed that has never succeeded may run", () => {
  assert.deepEqual(checkFeedInterval(null, 360, now), { ok: true });
});

test("a feed inside its minimum interval is refused, with the minutes left", () => {
  const decision = checkFeedInterval(minutesAgo(100), 360, now);
  assert.equal(decision.ok, false);
  assert.match(decision.ok ? "" : decision.reason, /next run allowed in 260 min/);
});

test("a feed exactly at its interval may run", () => {
  assert.deepEqual(checkFeedInterval(minutesAgo(360), 360, now), { ok: true });
});

test("sources without a cap are never refused", () => {
  assert.deepEqual(checkDailyCap("remote-ok", 1000), { ok: true });
});

test("Jooble may spend its first two requests of the day, not a third", () => {
  assert.deepEqual(checkDailyCap("jooble", 0), { ok: true });
  assert.deepEqual(checkDailyCap("jooble", 1), { ok: true });
  const third = checkDailyCap("jooble", 2);
  assert.equal(third.ok, false);
  assert.match(third.ok ? "" : third.reason, /2 of 2 used today/);
});
