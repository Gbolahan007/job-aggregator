import {
  getJobById,
  listFreshJobs,
  type JobRow,
} from "../repositories/jobsRepository.js";

const JOB_ID_PATTERN = /^[1-9]\d{0,17}$/;
export const MAX_SEARCH_LENGTH = 100;

export interface FeedFilters {
  search?: string;
  workArrangement?: string;
  employmentType?: string;
  location?: string;
  source?: string;
}

export const FEED_WINDOWS = { "24h": 24, "3d": 72, "7d": 168 } as const;
export type FeedWindow = keyof typeof FEED_WINDOWS;
export const DEFAULT_WINDOW: FeedWindow = "24h";

export function isFeedWindow(value: unknown): value is FeedWindow {
  return typeof value === "string" && Object.hasOwn(FEED_WINDOWS, value);
}

export async function getFeed(
  window: FeedWindow,
  filters: FeedFilters = {},
): Promise<JobRow[]> {
  return listFreshJobs(FEED_WINDOWS[window], filters);
}

export function isJobId(value: unknown): value is string {
  return typeof value === "string" && JOB_ID_PATTERN.test(value);
}

export async function getJob(id: string): Promise<JobRow | null> {
  return getJobById(id);
}

export const WORK_ARRANGEMENTS: readonly string[] = [
  "remote",
  "hybrid",
  "onsite",
];
export const EMPLOYMENT_TYPES: readonly string[] = [
  "full-time",
  "part-time",
  "contract",
  "temporary",
  "internship",
];
export const SOURCE_SLUG_PATTERN = /^[a-z0-9-]+$/;
