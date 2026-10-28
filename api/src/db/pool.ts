import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

// Without this listener, an error on an idle connection crashes the process.
pool.on("error", (err) => {
  console.error("Unexpected idle database client error", err);
});
