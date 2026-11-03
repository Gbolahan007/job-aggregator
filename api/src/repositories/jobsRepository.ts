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
  salary_min: string | null; // numeric arrives as a string
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: string | null;
  published_at: Date | null; // timestamptz arrives as a JS Date
  published_at_provenance: string;
  status: string;
  source?: string;
}

export interface FeedFilters {
  search?: string;
  workArrangement?: string;
  employmentType?: string;
  location?: string;
  source?: string;
}

function toContainsPattern(term: string): string {
  const escaped = term.replace(/[\\%_]/g, "\\$&");
  return `%${escaped}%`;
}

export async function listFreshJobs(
  windowHours: number,
  filters: FeedFilters = {},
): Promise<JobRow[]> {
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

  const sql = `
    SELECT j.id, j.external_id, j.title, j.company, j.location, j.work_arrangement,
           j.employment_type, j.application_url, j.salary_min, j.salary_max,
           j.salary_currency, j.salary_period, j.published_at,
           j.published_at_provenance, j.status, s.slug AS source
      FROM jobs AS j
      JOIN job_sources AS s ON s.id = j.source_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY j.published_at DESC`;

  const result = await pool.query<JobRow>(sql, values);
  return result.rows;
}

export async function getJobById(id: string): Promise<JobRow | null> {
  const result = await pool.query<JobRow>(
    `SELECT j.id, j.external_id, j.title, j.company, j.location, j.work_arrangement,
            j.employment_type, j.application_url, j.salary_min, j.salary_max,
            j.salary_currency, j.salary_period, j.published_at,
            j.published_at_provenance, j.status,
            s.slug AS source
       FROM jobs AS j
       JOIN job_sources AS s ON s.id = j.source_id
      WHERE j.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}
