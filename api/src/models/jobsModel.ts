import { listFreshJobs, type JobRow } from "../repositories/jobsRepository.js";

export const FEED_WINDOWS = { "24h": 24, "3d": 72, "7d": 168 } as const;
export type FeedWindow = keyof typeof FEED_WINDOWS;
export const DEFAULT_WINDOW: FeedWindow = "24h";

export function isFeedWindow(value: unknown): value is FeedWindow {
  return typeof value === "string" && Object.hasOwn(FEED_WINDOWS, value);
}

export async function getFeed(window: FeedWindow): Promise<JobRow[]> {
  return listFreshJobs(FEED_WINDOWS[window]);
}
