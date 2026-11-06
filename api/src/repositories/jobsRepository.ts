import { pool } from "../db/pool.js";

export interface JobRow {
  id: string; // bigint arrives as a string
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  work_arrangement: string;
  employment_type: string;
  application_url: string;
  salary_min: number | null; // cast to float8 in SQL, arrives as a number
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  published_at: Date | null; // timestamptz arrives as a JS Date
  published_at_provenance: string;
  status: string;
  source: string;
}

export interface FeedFilters {
  search?: string;
  workArrangement?: string;
  employmentType?: string;
  location?: string;
  source?: string;
}

export type FeedSort = "newest" | "oldest";

export interface FeedPage {
  limit: number;
  offset: number;
  sort: FeedSort;
}

export interface FeedResult {
  jobs: JobRow[];
  total: number;
}

const JOB_COLUMNS = `
  j.id, j.external_id, j.title, j.company, j.location, j.work_arrangement,
  j.employment_type, j.application_url, j.salary_min::float8 AS salary_min, j.salary_max::float8 AS salary_max,
  j.salary_currency, j.salary_period, j.published_at,
  j.published_at_provenance, j.status, s.slug AS source`;

const ORDER_BY: Record<FeedSort, string> = {
  newest: "j.published_at DESC, j.id DESC",
  oldest: "j.published_at ASC, j.id ASC",
};

function toContainsPattern(term: string): string {
  const escaped = term.replace(/[\\%_]/g, "\\$&");
  return `%${escaped}%`;
}

export async function listFreshJobs(
  windowHours: number,
  filters: FeedFilters,
  page: FeedPage,
): Promise<FeedResult> {
  const values: unknown[] = [];

  function addValue(value: unknown): string {
    values.push(value);
    return `$${values.length}`;
  }

  const conditions: string[] = [
    "s.is_enabled",
    "j.status = 'active'",
    "j.published_at_provenance = 'source'",
    "j.published_at <= now()",
    `j.published_at >= now() - make_interval(hours => ${addValue(windowHours)})`,
  ];

  if (filters.search) {
    const pattern = addValue(toContainsPattern(filters.search));
    conditions.push(`(j.title ILIKE ${pattern} OR j.company ILIKE ${pattern})`);
  }
  if (filters.workArrangement) {
    conditions.push(
      `j.work_arrangement = ${addValue(filters.workArrangement)}`,
    );
  }
  if (filters.employmentType) {
    conditions.push(`j.employment_type = ${addValue(filters.employmentType)}`);
  }
  if (filters.location) {
    conditions.push(
      `j.location ILIKE ${addValue(toContainsPattern(filters.location))}`,
    );
  }
  if (filters.source) {
    conditions.push(`s.slug = ${addValue(filters.source)}`);
  }

  const fromAndWhere = `
      FROM jobs AS j
      JOIN job_sources AS s ON s.id = j.source_id
     WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total ${fromAndWhere}`,
    values,
  );

  const pageResult = await pool.query<JobRow>(
    `SELECT ${JOB_COLUMNS}
     ${fromAndWhere}
      ORDER BY ${ORDER_BY[page.sort]}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, page.limit, page.offset],
  );

  return { jobs: pageResult.rows, total: countResult.rows[0]?.total ?? 0 };
}

export async function getJobById(id: string): Promise<JobRow | null> {
  const result = await pool.query<JobRow>(
    `SELECT ${JOB_COLUMNS}
       FROM jobs AS j
       JOIN job_sources AS s ON s.id = j.source_id
      WHERE j.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}
