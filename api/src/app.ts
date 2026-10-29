import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import { pool } from "./db/pool.js";
import jobsRouter from "./routes/jobsRoutes.js";

const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
};

// Keep all four parameters: Express treats a function as an error handler by its arity.
const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  const status =
    Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  if (status >= 500) console.error(err);

  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : err.message,
  });
};

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ status: "ready" });
    } catch (err) {
      console.error("Readiness check failed", err);
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use("/jobs", jobsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
