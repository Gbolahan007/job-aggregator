import {
  getJobById,
  listFreshJobs,
  type FeedFilters,
  type FeedSort,
  type JobRow,
} from "../repositories/jobsRepository.js";

// Feed windows
export const FEED_WINDOWS = { "24h": 24, "3d": 72, "7d": 168 } as const;
export type FeedWindow = keyof typeof FEED_WINDOWS;
export const DEFAULT_WINDOW: FeedWindow = "24h";

export function isFeedWindow(value: unknown): value is FeedWindow {
  return typeof value === "string" && Object.hasOwn(FEED_WINDOWS, value);
}

// Search and filters
export const MAX_SEARCH_LENGTH = 100;
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

// Sorting and pagination
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const MAX_PAGE = 1000;
export const SORT_OPTIONS: readonly FeedSort[] = ["newest", "oldest"];
export const DEFAULT_SORT: FeedSort = "newest";

export function isFeedSort(value: unknown): value is FeedSort {
  return (
    typeof value === "string" &&
    (SORT_OPTIONS as readonly string[]).includes(value)
  );
}

export interface FeedRequest {
  page: number;
  limit: number;
  sort: FeedSort;
}

export async function getFeed(
  window: FeedWindow,
  filters: FeedFilters,
  { page, limit, sort }: FeedRequest,
) {
  const offset = (page - 1) * limit;
  const { jobs, total } = await listFreshJobs(FEED_WINDOWS[window], filters, {
    limit,
    offset,
    sort,
  });
  return { jobs, total, totalPages: Math.ceil(total / limit) };
}

// Single job
const JOB_ID_PATTERN = /^[1-9]\d{0,17}$/;

export function isJobId(value: unknown): value is string {
  return typeof value === "string" && JOB_ID_PATTERN.test(value);
}

export async function getJob(id: string): Promise<JobRow | null> {
  return getJobById(id);
}
