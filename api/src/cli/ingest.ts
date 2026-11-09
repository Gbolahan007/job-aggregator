// npm run ingest                       every enabled feed
// npm run ingest -- --source=remotive  one source's feeds only
import { parseArgs } from "node:util";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { createLogger } from "../ingestion/log.js";
import { adapters } from "../ingestion/providers/index.js";
import { runIngestion } from "../ingestion/runIngestion.js";

const secrets = [env.joobleApiKey].filter((s): s is string => s !== undefined);
const log = createLogger(secrets);

try {
  const { values } = parseArgs({ options: { source: { type: "string" } } });
  const summary = await runIngestion({ adapters, log, secrets, onlySource: values.source });
  if (summary.status === "completed" && summary.feeds.some((f) => f.outcome === "failed")) {
    process.exitCode = 1;
  }
} catch (err) {
  log("error", "run_crashed", { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
} finally {
  await pool.end();
}
