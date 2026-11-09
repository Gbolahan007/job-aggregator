import assert from "node:assert/strict";
import { test } from "node:test";
import { createHttpClient, HttpError, retryAfterMs, USER_AGENT } from "../../src/ingestion/http.js";

/** A stand-in for fetch: returns (or throws) the given steps in order and records each call. */
function fakeFetch(steps: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const step = steps.shift();
    if (step === undefined) throw new Error("test bug: no fake response left");
    if (step instanceof Error) throw step;
    return step;
  }) as typeof fetch;
  return { impl, calls };
}

/** Records how long the client asked to wait, without waiting. */
function fakeSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

test("returns the body and identifies itself with our User-Agent", async () => {
  const fetch = fakeFetch([new Response('{"ok":true}', { status: 200 })]);
  const http = createHttpClient({ fetchImpl: fetch.impl });

  assert.deepEqual(await http.json("https://api.example.test/jobs"), { ok: true });
  const headers = fetch.calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers["User-Agent"], USER_AGENT);
});

test("sends a JSON body on POST", async () => {
  const fetch = fakeFetch([new Response("[]", { status: 200 })]);
  const http = createHttpClient({ fetchImpl: fetch.impl });

  await http.text("https://api.example.test/search", { method: "POST", body: { keywords: "" } });
  const init = fetch.calls[0]?.init;
  assert.equal(init?.method, "POST");
  assert.equal(init?.body, '{"keywords":""}');
  assert.equal((init?.headers as Record<string, string>)["Content-Type"], "application/json");
});

test("retries a 503 after 1 s, then succeeds", async () => {
  const fetch = fakeFetch([new Response("", { status: 503 }), new Response("done", { status: 200 })]);
  const clock = fakeSleep();
  const http = createHttpClient({ fetchImpl: fetch.impl, sleep: clock.sleep });

  assert.equal(await http.text("https://api.example.test/"), "done");
  assert.equal(fetch.calls.length, 2);
  assert.deepEqual(clock.waits, [1000]);
});

test("honours Retry-After on a 429", async () => {
  const fetch = fakeFetch([
    new Response("", { status: 429, headers: { "Retry-After": "3" } }),
    new Response("done", { status: 200 }),
  ]);
  const clock = fakeSleep();
  const http = createHttpClient({ fetchImpl: fetch.impl, sleep: clock.sleep });

  await http.text("https://api.example.test/");
  assert.deepEqual(clock.waits, [3000]);
});

test("gives up after 2 retries: 3 attempts, then an HttpError with the status", async () => {
  const fetch = fakeFetch([
    new Response("", { status: 500 }),
    new Response("", { status: 500 }),
    new Response("", { status: 500 }),
  ]);
  const clock = fakeSleep();
  const http = createHttpClient({ fetchImpl: fetch.impl, sleep: clock.sleep });

  await assert.rejects(http.text("https://api.example.test/"), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 500);
    return true;
  });
  assert.equal(fetch.calls.length, 3);
  assert.deepEqual(clock.waits, [1000, 2000]);
});

test("does not retry a 404: it won't get better", async () => {
  const fetch = fakeFetch([new Response("", { status: 404 })]);
  const http = createHttpClient({ fetchImpl: fetch.impl });

  await assert.rejects(http.text("https://api.example.test/"), /returned 404/);
  assert.equal(fetch.calls.length, 1);
});

test("retries a network failure, then succeeds", async () => {
  const fetch = fakeFetch([new TypeError("fetch failed"), new Response("done", { status: 200 })]);
  const clock = fakeSleep();
  const http = createHttpClient({ fetchImpl: fetch.impl, sleep: clock.sleep });

  assert.equal(await http.text("https://api.example.test/"), "done");
  assert.equal(fetch.calls.length, 2);
});

test("retries: 0 means exactly one attempt", async () => {
  const fetch = fakeFetch([new Response("", { status: 503 })]);
  const http = createHttpClient({ fetchImpl: fetch.impl });

  await assert.rejects(http.text("https://api.example.test/", { retries: 0 }), /returned 503/);
  assert.equal(fetch.calls.length, 1);
});

test("gives up at once when Retry-After asks for more than 60 s", async () => {
  const fetch = fakeFetch([new Response("", { status: 429, headers: { "Retry-After": "3600" } })]);
  const clock = fakeSleep();
  const http = createHttpClient({ fetchImpl: fetch.impl, sleep: clock.sleep });

  await assert.rejects(http.text("https://api.example.test/"), /asked us to wait 3600 s/);
  assert.deepEqual(clock.waits, []);
});

test("beforeRequest runs before every attempt, and throwing stops the request", async () => {
  const fetch = fakeFetch([new Response("", { status: 503 }), new Response("never", { status: 200 })]);
  let attempts = 0;
  const http = createHttpClient({
    fetchImpl: fetch.impl,
    sleep: async () => {},
    beforeRequest: async () => {
      attempts += 1;
      if (attempts === 2) throw new Error("budget says no");
    },
  });

  await assert.rejects(http.text("https://api.example.test/"), /budget says no/);
  assert.equal(attempts, 2);
  assert.equal(fetch.calls.length, 1); // the second attempt was never sent
});

test("json() turns a non-JSON body into an HttpError", async () => {
  const fetch = fakeFetch([new Response("<html>oops</html>", { status: 200 })]);
  const http = createHttpClient({ fetchImpl: fetch.impl });

  await assert.rejects(http.json("https://api.example.test/"), /returned invalid JSON/);
});

test("retryAfterMs reads seconds and HTTP dates, and ignores junk", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  assert.equal(retryAfterMs("5", now), 5000);
  assert.equal(retryAfterMs("Tue, 10 Nov 2026 12:00:30 GMT", now), 30_000);
  assert.equal(retryAfterMs(null, now), null);
  assert.equal(retryAfterMs("soon", now), null);
});
