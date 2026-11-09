import type pg from "pg";
import { pool } from "../db/pool.js";
import type { Feed, NormalizedJob, ProviderAdapter } from "../ingestion/types.js";

/** Any fixed number works, as long as nothing else in this database uses it as a lock key. */
export const INGEST_LOCK_KEY = 4_231_001;

interface FeedRow {
  id: string;
  source_id: string;
  source_slug: string;
  feed_key: string;
  name: string;
  config: Record<string, unknown>; // jsonb arrives already parsed
  min_interval_minutes: number;
}

/** Enabled feeds of enabled sources, optionally for one source only. */
export async function listEnabledFeeds(sourceSlug?: string): Promise<Feed[]> {
  const { rows } = await pool.query<FeedRow>(
    `SELECT f.id, f.source_id, s.slug AS source_slug, f.feed_key, f.name,
            f.config, f.min_interval_minutes
     FROM source_feeds f
     JOIN job_sources s ON s.id = f.source_id
     WHERE f.is_enabled AND s.is_enabled
       AND ($1::text IS NULL OR s.slug = $1)
     ORDER BY s.slug, f.feed_key`,
    [sourceSlug ?? null],
  );
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceSlug: r.source_slug,
    feedKey: r.feed_key,
    name: r.name,
    config: r.config,
    minIntervalMinutes: r.min_interval_minutes,
  }));
}

/**
 * Takes the run-wide lock on a connection of its own and keeps that connection.
 * Returns null when another run holds the lock. If this process dies, PostgreSQL
 * closes the connection and the lock goes with it.
 */
export async function tryAcquireRunLock(): Promise<pg.PoolClient | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [INGEST_LOCK_KEY],
    );
    if (rows[0]?.locked) return client;
    client.release();
    return null;
  } catch (err) {
    client.release(true);
    throw err;
  }
}

export async function releaseRunLock(client: pg.PoolClient): Promise<void> {
  try {
    await client.query("SELECT pg_advisory_unlock($1)", [INGEST_LOCK_KEY]);
    client.release();
  } catch (err) {
    // Never hand a connection that may still hold the lock back to the pool: close it.
    client.release(true);
    throw err;
  }
}

/** Marks runs a crashed process left as 'running'. Safe only while holding the run lock. */
export async function failAbandonedRuns(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE ingestion_runs
     SET status = 'failed', finished_at = now(),
         error = 'interrupted: the process stopped before this run finished'
     WHERE status = 'running'`,
  );
  return rowCount ?? 0;
}

/** When this feed last fetched successfully, or null if it never has. */
export async function lastSuccessfulRunAt(feedId: string): Promise<Date | null> {
  const { rows } = await pool.query<{ at: Date | null }>(
    `SELECT max(started_at) AS at
     FROM ingestion_runs
     WHERE feed_id = $1 AND status IN ('succeeded', 'partial')`,
    [feedId],
  );
  return rows[0]?.at ?? null;
}

/** Requests spent since midnight UTC by every feed of one source, failed runs included. */
export async function requestsTodayForSource(sourceId: string): Promise<number> {
  const { rows } = await pool.query<{ used: number }>(
    `SELECT coalesce(sum(r.request_count), 0)::int AS used
     FROM ingestion_runs r
     JOIN source_feeds f ON f.id = r.feed_id
     WHERE f.source_id = $1
       AND r.started_at >= date_trunc('day', now(), 'UTC')`,
    [sourceId],
  );
  return rows[0]?.used ?? 0;
}

export async function startRun(feedId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO ingestion_runs (feed_id) VALUES ($1) RETURNING id",
    [feedId],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("INSERT INTO ingestion_runs returned no id");
  return id;
}

/** Counted before the request is sent, so a crash can't hide a request that was spent. */
export async function addRequest(runId: string): Promise<void> {
  await pool.query(
    "UPDATE ingestion_runs SET request_count = request_count + 1 WHERE id = $1",
    [runId],
  );
}

export interface RunResult {
  status: "succeeded" | "partial" | "failed";
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  closedCount: number;
  skippedCount: number;
  error: string | null;
}

export async function finishRun(runId: string, result: RunResult): Promise<void> {
  await pool.query(
    `UPDATE ingestion_runs
     SET status = $2, finished_at = now(),
         fetched_count = $3, inserted_count = $4, updated_count = $5,
         closed_count = $6, skipped_count = $7, error = $8
     WHERE id = $1`,
    [
      runId,
      result.status,
      result.fetchedCount,
      result.insertedCount,
      result.updatedCount,
      result.closedCount,
      result.skippedCount,
      result.error,
    ],
  );
}

export interface SaveResult {
  inserted: number;
  updated: number;
  closed: number;
}

/**
 * Writes one feed's jobs in a single transaction.
 * Placeholder until Task 4.4, which adds the upsert and closures here.
 * Until then it writes nothing, so no run can change the jobs table.
 */
export async function saveJobs(
  _feed: Feed,
  _jobs: NormalizedJob[],
  _snapshot: ProviderAdapter["snapshot"],
): Promise<SaveResult> {
  return { inserted: 0, updated: 0, closed: 0 };
}
