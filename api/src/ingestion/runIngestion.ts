import * as repo from "../repositories/ingestionRepository.js";
import { BudgetError, checkDailyCap, checkFeedInterval } from "./budget.js";
import { createHttpClient, type HttpClientOptions } from "./http.js";
import type { Logger } from "./log.js";
import { redact } from "./redact.js";
import type { Feed, ProviderAdapter, SkippedItem } from "./types.js";

export interface RunOptions {
  adapters: Readonly<Record<string, ProviderAdapter>>;
  log: Logger;
  secrets: readonly string[];
  onlySource?: string; // run one source's feeds only
  now?: () => Date; // tests can fix the clock
  httpOptions?: Omit<HttpClientOptions, "beforeRequest">; // tests swap in a fake fetch
}

export type FeedOutcome =
  | { feed: string; outcome: "skipped"; reason: string }
  | {
      feed: string;
      outcome: "succeeded" | "partial" | "failed";
      runId: string;
      fetched: number;
      skipped: number;
      inserted: number;
      updated: number;
      closed: number;
      error?: string;
    };

export type RunSummary = { status: "locked" } | { status: "completed"; feeds: FeedOutcome[] };

/** One ingestion run: every enabled feed, one after another, under a single lock. */
export async function runIngestion(options: RunOptions): Promise<RunSummary> {
  const lock = await repo.tryAcquireRunLock();
  if (lock === null) {
    options.log("warn", "run_skipped", { reason: "another ingestion run holds the lock" });
    return { status: "locked" };
  }

  try {
    // Holding the lock means no other run is live, so any 'running' row is left over from a crash.
    const abandoned = await repo.failAbandonedRuns();
    if (abandoned > 0) options.log("warn", "abandoned_runs_failed", { count: abandoned });

    const feeds = await repo.listEnabledFeeds(options.onlySource);
    options.log("info", "run_started", { feeds: feeds.length, onlySource: options.onlySource });

    const outcomes: FeedOutcome[] = [];
    for (const feed of feeds) {
      outcomes.push(await runFeed(feed, options)); // sequential: polite to providers
    }

    const count = (outcome: FeedOutcome["outcome"]) =>
      outcomes.filter((o) => o.outcome === outcome).length;
    options.log("info", "run_finished", {
      succeeded: count("succeeded"),
      partial: count("partial"),
      failed: count("failed"),
      skipped: count("skipped"),
    });
    return { status: "completed", feeds: outcomes };
  } finally {
    await repo.releaseRunLock(lock);
  }
}

async function runFeed(feed: Feed, options: RunOptions): Promise<FeedOutcome> {
  const label = `${feed.sourceSlug}/${feed.feedKey}`;
  const now = options.now?.() ?? new Date();

  // 1. Check the budget before spending anything. A skip writes no run row.
  const adapter = options.adapters[feed.sourceSlug];
  if (adapter === undefined) return skip(label, "no adapter for this source yet", options);

  const interval = checkFeedInterval(
    await repo.lastSuccessfulRunAt(feed.id),
    feed.minIntervalMinutes,
    now,
  );
  if (!interval.ok) return skip(label, interval.reason, options);

  const cap = checkDailyCap(feed.sourceSlug, await repo.requestsTodayForSource(feed.sourceId));
  if (!cap.ok) return skip(label, cap.reason, options);

  // 2. Open the run row.
  const runId = await repo.startRun(feed.id);
  options.log("info", "feed_started", { feed: label, runId });

  try {
    // 3. Fetch, outside any transaction. Each attempt re-checks the cap and is counted first.
    const http = createHttpClient({
      ...options.httpOptions,
      beforeRequest: async () => {
        const decision = checkDailyCap(
          feed.sourceSlug,
          await repo.requestsTodayForSource(feed.sourceId),
        );
        if (!decision.ok) throw new BudgetError(decision.reason);
        await repo.addRequest(runId);
      },
    });
    const raw = await adapter.fetch(feed, http);

    // 4. Parse and normalize: pure, no network, no database.
    const { jobs, skipped } = adapter.parse(raw, feed);

    // 5. Write in one transaction (the upsert arrives in Task 4.4).
    const saved = await repo.saveJobs(feed, jobs, adapter.snapshot);

    // 6. Finish the run row. Partial means the fetch worked but some items were skipped.
    const status = skipped.length > 0 ? "partial" : "succeeded";
    await repo.finishRun(runId, {
      status,
      fetchedCount: jobs.length + skipped.length,
      insertedCount: saved.inserted,
      updatedCount: saved.updated,
      closedCount: saved.closed,
      skippedCount: skipped.length,
      error: null,
    });
    options.log("info", "feed_finished", {
      feed: label,
      runId,
      status,
      jobs: jobs.length,
      skipped: skipped.length,
      skipReasons: countReasons(skipped),
      ...saved,
    });
    return {
      feed: label,
      outcome: status,
      runId,
      fetched: jobs.length + skipped.length,
      skipped: skipped.length,
      ...saved,
    };
  } catch (err) {
    // A failed feed records why, changes no jobs, and doesn't stop the next feed.
    const message = redact(err instanceof Error ? err.message : String(err), options.secrets);
    await repo.finishRun(runId, {
      status: "failed",
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      closedCount: 0,
      skippedCount: 0,
      error: message,
    });
    options.log("error", "feed_failed", { feed: label, runId, error: message });
    return {
      feed: label,
      outcome: "failed",
      runId,
      fetched: 0,
      skipped: 0,
      inserted: 0,
      updated: 0,
      closed: 0,
      error: message,
    };
  }
}

function skip(feed: string, reason: string, options: RunOptions): FeedOutcome {
  options.log("info", "feed_skipped", { feed, reason });
  return { feed, outcome: "skipped", reason };
}

/** { "missing title": 2, ... }: enough to spot a pattern without logging every item. */
function countReasons(skipped: SkippedItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of skipped) counts[item.reason] = (counts[item.reason] ?? 0) + 1;
  return counts;
}
