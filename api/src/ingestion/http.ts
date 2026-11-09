import type { HttpClient, RequestOptions } from "./types.js";

export const USER_AGENT = "job-aggregator/0.1 (+https://github.com/Gbolahan007/job-aggregator)";
const TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 60_000;

/** A request we gave up on. status is null when there was no response at all. */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface HttpClientOptions {
  /** Runs before every attempt, retries included. Throwing stops the request. */
  beforeRequest?: () => Promise<void>;
  fetchImpl?: typeof fetch; // tests pass a fake
  sleep?: (ms: number) => Promise<void>; // tests skip the real wait
  timeoutMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 429 (too many requests) and 5xx (server trouble) may pass on a later try; other 4xx won't. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** 1 s, then 2 s, then 4 s. */
function backoffMs(attempt: number): number {
  return 1000 * 2 ** attempt;
}

/** Retry-After is either seconds ("120") or an HTTP date. Null when absent or unreadable. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (header === null || header.trim() === "") return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? realSleep;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  async function text(url: string, request: RequestOptions = {}): Promise<string> {
    const method = request.method ?? "GET";
    const retries = request.retries ?? DEFAULT_RETRIES;
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (request.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(request.body);
    }

    for (let attempt = 0; ; attempt++) {
      // Outside the try below: a budget refusal must stop the request, not be retried.
      await options.beforeRequest?.();

      let waitMs: number;
      try {
        const response = await fetchImpl(url, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.ok) return await response.text();

        await response.body?.cancel(); // free the connection; we won't read this body
        if (!isRetryable(response.status) || attempt >= retries) {
          throw new HttpError(`${method} ${url} returned ${response.status}`, response.status);
        }
        waitMs = retryAfterMs(response.headers.get("retry-after")) ?? backoffMs(attempt);
        if (waitMs > MAX_RETRY_WAIT_MS) {
          throw new HttpError(
            `${method} ${url} returned ${response.status} and asked us to wait ` +
              `${Math.round(waitMs / 1000)} s; giving up until the next run`,
            response.status,
          );
        }
      } catch (err) {
        if (err instanceof HttpError) throw err;
        // No response at all: a network failure or our timeout.
        const reason = err instanceof Error ? err.message : String(err);
        if (attempt >= retries) {
          throw new HttpError(`${method} ${url} failed: ${reason}`, null);
        }
        waitMs = backoffMs(attempt);
      }
      await sleep(waitMs);
    }
  }

  async function json(url: string, request: RequestOptions = {}): Promise<unknown> {
    const raw = await text(url, request);
    try {
      return JSON.parse(raw);
    } catch {
      throw new HttpError(`${request.method ?? "GET"} ${url} returned invalid JSON`, null);
    }
  }

  return { text, json };
}
