/** Requests per UTC day, for providers with a hard quota. Jooble's free key allows 500 in total. */
export const DAILY_REQUEST_CAPS: Readonly<Record<string, number>> = { jooble: 2 };

export type BudgetDecision = { ok: true } | { ok: false; reason: string };

/** Thrown when a request would go over a source's daily cap. */
export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetError";
  }
}

/** May this feed run now? Pure: the caller supplies the last success and the time. */
export function checkFeedInterval(
  lastSuccessAt: Date | null,
  minIntervalMinutes: number,
  now: Date,
): BudgetDecision {
  if (lastSuccessAt === null) return { ok: true };
  const nextAllowed = lastSuccessAt.getTime() + minIntervalMinutes * 60_000;
  if (now.getTime() >= nextAllowed) return { ok: true };
  const minutesLeft = Math.ceil((nextAllowed - now.getTime()) / 60_000);
  return {
    ok: false,
    reason: `last succeeded ${lastSuccessAt.toISOString()}; next run allowed in ${minutesLeft} min`,
  };
}

/** May this source spend one more request today? */
export function checkDailyCap(sourceSlug: string, requestsToday: number): BudgetDecision {
  const cap = DAILY_REQUEST_CAPS[sourceSlug];
  if (cap === undefined || requestsToday < cap) return { ok: true };
  return { ok: false, reason: `daily request cap reached: ${requestsToday} of ${cap} used today (UTC)` };
}
