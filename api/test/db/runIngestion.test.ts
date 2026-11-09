// Runs the real runner against a real test database, with stub adapters instead of providers.
// Run with DATABASE_URL pointing at a database whose name ends in _test (see the README).
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { pool } from "../../src/db/pool.js";
import { createLogger } from "../../src/ingestion/log.js";
import { REDACTED } from "../../src/ingestion/redact.js";
import { runIngestion, type RunOptions } from "../../src/ingestion/runIngestion.js";
import type { NormalizedJob, ProviderAdapter } from "../../src/ingestion/types.js";
import { INGEST_LOCK_KEY } from "../../src/repositories/ingestionRepository.js";

const FAKE_KEY = "fake-jooble-key-123456";

before(async () => {
  const { rows } = await pool.query<{ db: string }>("SELECT current_database() AS db");
  const db = rows[0]?.db ?? "";
  if (!db.endsWith("_test")) {
    throw new Error(`Refusing to run: connected to "${db}". Point DATABASE_URL at a *_test database.`);
  }
  await pool.query(
    `INSERT INTO job_sources (slug, name, base_url)
     VALUES ('demo', 'Demo data (fake jobs)', 'https://example.com')
     ON CONFLICT (slug) DO NOTHING`,
  );
});

beforeEach(async () => {
  // Start every test from no runs and no test feeds. Jobs are never touched.
  await pool.query("DELETE FROM ingestion_runs");
  await pool.query("DELETE FROM source_feeds WHERE feed_key LIKE 'test-%'");
});

after(async () => {
  await pool.end();
});

async function createFeed(sourceSlug: string, feedKey: string, minIntervalMinutes = 0) {
  await pool.query(
    `INSERT INTO source_feeds (source_id, feed_key, name, min_interval_minutes)
     SELECT id, $2, $2, $3 FROM job_sources WHERE slug = $1`,
    [sourceSlug, feedKey, minIntervalMinutes],
  );
}

interface RunRow {
  feed_key: string;
  status: string;
  request_count: number;
  fetched_count: number;
  skipped_count: number;
  finished_at: Date | null;
  error: string | null;
}

async function runRows(): Promise<RunRow[]> {
  const { rows } = await pool.query<RunRow>(
    `SELECT f.feed_key, r.status, r.request_count, r.fetched_count, r.skipped_count,
            r.finished_at, r.error
     FROM ingestion_runs r JOIN source_feeds f ON f.id = r.feed_id
     ORDER BY r.id`,
  );
  return rows;
}

function job(externalId: string): NormalizedJob {
  return {
    externalId,
    title: "Backend Developer",
    company: "Example Ltd",
    location: null,
    countryCodes: [],
    workArrangement: "unknown",
    employmentType: "unknown",
    remoteEligibility: "unknown",
    eligibilityText: null,
    eligibleCountryCodes: [],
    visaSponsorship: "unknown",
    applicationUrl: `https://example.com/jobs/${externalId}`,
    salary: null,
    salaryText: null,
    publishedAt: null,
  };
}

/** Fake fetch: every request gets 200 with an empty JSON list, unless the URL contains "forbidden". */
const fakeFetch = (async (url: string | URL | Request) =>
  String(url).includes("forbidden")
    ? new Response("", { status: 403 })
    : new Response("[]", { status: 200 })) as typeof fetch;

/** A stub adapter whose behaviour depends on the feed key. One request per fetch, unless told otherwise. */
function stub(sourceSlug: string): ProviderAdapter {
  return {
    sourceSlug,
    snapshot: "window",
    async fetch(feed, http) {
      if (feed.feedKey.endsWith("throws")) throw new Error("stub adapter failed on purpose");
      if (feed.feedKey === "test-secret") {
        return http.json(`https://ng.jooble.org/api/${FAKE_KEY}/forbidden`, { retries: 0 });
      }
      if (feed.feedKey === "test-greedy") {
        for (let i = 0; i < 3; i++) await http.json(`https://api.example.test/page/${i}`);
      }
      return http.json("https://api.example.test/jobs");
    },
    parse(_raw, feed) {
      if (feed.feedKey === "test-partial") {
        return { jobs: [job("a")], skipped: [{ reason: "missing title" }] };
      }
      return { jobs: [job("a"), job("b")], skipped: [] };
    },
  };
}

function options(lines: string[] = [], overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    adapters: { demo: stub("demo"), jooble: stub("jooble") },
    log: createLogger([FAKE_KEY], (line) => lines.push(line)),
    secrets: [FAKE_KEY],
    httpOptions: { fetchImpl: fakeFetch, sleep: async () => {} },
    ...overrides,
  };
}

test("a stub adapter records a succeeded run", async () => {
  await createFeed("demo", "test-ok");
  const summary = await runIngestion(options([], { onlySource: "demo" }));

  assert.equal(summary.status, "completed");
  const rows = await runRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "succeeded");
  assert.equal(rows[0]?.request_count, 1);
  assert.equal(rows[0]?.fetched_count, 2);
  assert.ok(rows[0]?.finished_at instanceof Date);
});

test("skipped items make a run partial, not failed", async () => {
  await createFeed("demo", "test-partial");
  await runIngestion(options([], { onlySource: "demo" }));

  const [row] = await runRows();
  assert.equal(row?.status, "partial");
  assert.equal(row?.fetched_count, 2);
  assert.equal(row?.skipped_count, 1);
});

test("a throwing stub records a failed run, and the next feed still runs", async () => {
  // Feeds run in feed_key order, so the failing one goes first.
  await createFeed("demo", "test-a-throws");
  await createFeed("demo", "test-b-ok");
  const summary = await runIngestion(options([], { onlySource: "demo" }));

  assert.equal(summary.status, "completed");
  const rows = await runRows();
  assert.deepEqual(
    rows.map((r) => [r.feed_key, r.status]),
    [
      ["test-a-throws", "failed"],
      ["test-b-ok", "succeeded"],
    ],
  );
  assert.equal(rows[0]?.error, "stub adapter failed on purpose");
  assert.ok(rows[0]?.finished_at instanceof Date);
});

test("a second run inside the minimum interval skips the feed and writes no row", async () => {
  await createFeed("demo", "test-ok", 60);
  await runIngestion(options([], { onlySource: "demo" }));
  const second = await runIngestion(options([], { onlySource: "demo" }));

  assert.equal(second.status, "completed");
  if (second.status === "completed") {
    assert.equal(second.feeds[0]?.outcome, "skipped");
  }
  assert.equal((await runRows()).length, 1);
});

test("a key in a URL never reaches the run row or the logs", async () => {
  await createFeed("jooble", "test-secret");
  const lines: string[] = [];
  await runIngestion(options(lines, { onlySource: "jooble" }));

  const [row] = await runRows();
  assert.equal(row?.status, "failed");
  assert.ok(row?.error?.includes(REDACTED), `error was: ${row?.error}`);
  assert.ok(!row?.error?.includes(FAKE_KEY));
  assert.ok(lines.length > 0);
  for (const line of lines) assert.ok(!line.includes(FAKE_KEY), `leaked in: ${line}`);
});

test("Jooble's cap: two feeds run, a third is skipped before spending anything", async () => {
  await createFeed("jooble", "test-a");
  await createFeed("jooble", "test-b");
  await createFeed("jooble", "test-c");
  const summary = await runIngestion(options([], { onlySource: "jooble" }));

  assert.equal(summary.status, "completed");
  if (summary.status === "completed") {
    assert.deepEqual(
      summary.feeds.map((f) => [f.feed, f.outcome]),
      [
        ["jooble/test-a", "succeeded"],
        ["jooble/test-b", "succeeded"],
        ["jooble/test-c", "skipped"],
      ],
    );
  }
  const total = (await runRows()).reduce((sum, r) => sum + r.request_count, 0);
  assert.equal(total, 2);
});

test("the cap also stops a feed that tries to spend too much in one run", async () => {
  await createFeed("jooble", "test-greedy"); // wants 4 requests; only 2 are allowed today
  await runIngestion(options([], { onlySource: "jooble" }));

  const [row] = await runRows();
  assert.equal(row?.status, "failed");
  assert.equal(row?.request_count, 2);
  assert.match(row?.error ?? "", /daily request cap reached/);
});

test("runs left 'running' by a crash are marked failed at the next start", async () => {
  await createFeed("demo", "test-ok");
  await pool.query(
    `INSERT INTO ingestion_runs (feed_id, started_at)
     SELECT id, now() - interval '1 hour' FROM source_feeds WHERE feed_key = 'test-ok'`,
  );
  await runIngestion(options([], { onlySource: "demo" }));

  const rows = await runRows();
  assert.equal(rows[0]?.status, "failed");
  assert.match(rows[0]?.error ?? "", /interrupted/);
  assert.equal(rows[1]?.status, "succeeded");
});

test("a second runner backs off while the lock is held", async () => {
  await createFeed("demo", "test-ok");
  const holder = await pool.connect();
  try {
    await holder.query("SELECT pg_advisory_lock($1)", [INGEST_LOCK_KEY]);
    const summary = await runIngestion(options([], { onlySource: "demo" }));
    assert.deepEqual(summary, { status: "locked" });
    assert.equal((await runRows()).length, 0);
  } finally {
    await holder.query("SELECT pg_advisory_unlock($1)", [INGEST_LOCK_KEY]);
    holder.release();
  }
});
