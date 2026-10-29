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
}

export async function listFreshJobs(windowHours: number): Promise<JobRow[]> {
  const result = await pool.query<JobRow>(
    `SELECT id, external_id, title, company, location, work_arrangement,
            employment_type, application_url, salary_min, salary_max,
            salary_currency, salary_period, published_at,
            published_at_provenance, status
       FROM jobs
      WHERE status = 'active'
        AND published_at_provenance = 'source'
        AND published_at <= now()
        AND published_at >= now() - make_interval(hours => $1)
      ORDER BY published_at DESC`,
    [windowHours],
  );
  return result.rows;
}

export async function getJobById(id: string): Promise<JobRow | null> {
  const result = await pool.query<JobRow>(
    `SELECT id, external_id, title, company, location, work_arrangement,
            employment_type, application_url, salary_min, salary_max,
            salary_currency, salary_period, published_at,
            published_at_provenance, status
       FROM jobs
      WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}
