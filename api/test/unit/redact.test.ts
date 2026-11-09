import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger } from "../../src/ingestion/log.js";
import { REDACTED, redact } from "../../src/ingestion/redact.js";

const KEY = "fake-key-1234567890";

test("redacts a key in a URL path", () => {
  assert.equal(
    redact(`POST https://ng.jooble.org/api/${KEY} returned 403`, [KEY]),
    `POST https://ng.jooble.org/api/${REDACTED} returned 403`,
  );
});

test("redacts a key in a query string, every time it appears", () => {
  const text = `GET https://api.example.com/jobs?key=${KEY} (retry of ?key=${KEY})`;
  const out = redact(text, [KEY]);
  assert.ok(!out.includes(KEY));
  assert.equal(out.split(REDACTED).length - 1, 2);
});

test("redacts the URL-encoded form of a key with special characters", () => {
  const key = "ab/c+d=e";
  const out = redact(`https://x.test/${encodeURIComponent(key)} and ${key}`, [key]);
  assert.equal(out, `https://x.test/${REDACTED} and ${REDACTED}`);
});

test("leaves text alone when there are no secrets, or an empty one", () => {
  assert.equal(redact("nothing secret here", []), "nothing secret here");
  assert.equal(redact("nothing secret here", [""]), "nothing secret here");
});

test("the logger writes one JSON line and never prints a secret in any field", () => {
  const lines: string[] = [];
  const log = createLogger([KEY], (line) => lines.push(line));
  log("error", "feed_failed", { url: `https://x.test/${KEY}`, nested: { message: `bad ${KEY}` } });

  assert.equal(lines.length, 1);
  const line = lines[0] ?? "";
  assert.ok(!line.includes(KEY));
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.equal(parsed.level, "error");
  assert.equal(parsed.event, "feed_failed");
  assert.equal(parsed.url, `https://x.test/${REDACTED}`);
});
