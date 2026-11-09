// The shapes shared by the runner and every provider adapter.

export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unknown";
export type EmploymentType =
  | "full-time"
  | "part-time"
  | "contract"
  | "temporary"
  | "internship"
  | "unknown";
export type RemoteEligibility = "worldwide" | "restricted" | "unknown";
export type VisaSponsorship = "offered" | "not_offered" | "unknown";
export type SalaryPeriod = "hour" | "day" | "week" | "month" | "year";

/** A structured salary: only when the amounts, currency and period are all explicit. */
export interface Salary {
  min: number | null;
  max: number | null;
  currency: string; // ISO 4217, e.g. "USD"
  period: SalaryPeriod;
}

/** One job in our own shape, ready to save. Anything the provider didn't state stays unknown. */
export interface NormalizedJob {
  externalId: string;
  title: string;
  company: string;
  location: string | null; // the provider's own words
  countryCodes: string[]; // [] means unknown
  workArrangement: WorkArrangement;
  employmentType: EmploymentType;
  remoteEligibility: RemoteEligibility;
  eligibilityText: string | null;
  eligibleCountryCodes: string[]; // only for restricted jobs
  visaSponsorship: VisaSponsorship;
  applicationUrl: string;
  salary: Salary | null;
  salaryText: string | null;
  publishedAt: Date | null; // only a real posting date from the provider
}

/** A row of source_feeds, with its source's slug. */
export interface Feed {
  id: string; // bigint arrives as a string
  sourceId: string;
  sourceSlug: string;
  feedKey: string;
  name: string;
  config: Record<string, unknown>;
  minIntervalMinutes: number;
}

/** An item the adapter couldn't turn into a job, and why. */
export interface SkippedItem {
  reason: string;
  externalId?: string;
}

export interface ParseResult {
  jobs: NormalizedJob[];
  skipped: SkippedItem[];
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown; // sent as JSON
  retries?: number; // default 2; Jooble will use 0 so a retry can't spend its quota
}

/** Adapters make requests only through this, never with fetch directly. */
export interface HttpClient {
  text(url: string, options?: RequestOptions): Promise<string>;
  json(url: string, options?: RequestOptions): Promise<unknown>;
}

export interface ProviderAdapter {
  sourceSlug: string; // matches job_sources.slug
  snapshot: "complete" | "window"; // may a job missing from a response be closed?
  fetch(feed: Feed, http: HttpClient): Promise<unknown>; // network only
  parse(raw: unknown, feed: Feed): ParseResult; // pure: no network, no database
}
