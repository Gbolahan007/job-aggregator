CREATE TABLE job_sources (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name        text NOT NULL,
  base_url    text NOT NULL,
  is_enabled  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);



CREATE TABLE jobs (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id                bigint NOT NULL REFERENCES job_sources(id) ON DELETE RESTRICT,
  external_id              text NOT NULL,
  title                    text NOT NULL CHECK (btrim(title) <> ''),
  company                  text NOT NULL CHECK (btrim(company) <> ''),
  description              text,
  location                 text,
  work_arrangement         text NOT NULL DEFAULT 'unknown'
                             CHECK (work_arrangement IN ('remote', 'hybrid', 'onsite', 'unknown')),
  employment_type          text NOT NULL DEFAULT 'unknown'
                             CHECK (employment_type IN ('full-time', 'part-time', 'contract', 'temporary', 'internship', 'unknown')),
  application_url          text NOT NULL CHECK (application_url ~ '^https?://'),
  salary_min               numeric(12, 2) CHECK (salary_min >= 0),
  salary_max               numeric(12, 2) CHECK (salary_max >= 0),
  salary_currency          text CHECK (salary_currency ~ '^[A-Z]{3}$'),
    salary_period            text CHECK (salary_period IN ('hour', 'day', 'week', 'month', 'year')),
  published_at             timestamptz,
  published_at_provenance  text NOT NULL DEFAULT 'unknown'
                             CHECK (published_at_provenance IN ('source', 'estimated', 'unknown')),
  status                   text NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'closed')),
  first_seen_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT jobs_source_external_uniq
    UNIQUE (source_id, external_id),

    

  CONSTRAINT jobs_published_provenance_check
    CHECK ((published_at IS NULL) = (published_at_provenance = 'unknown')),

  CONSTRAINT jobs_salary_range_check
    CHECK (
      salary_min IS NULL
      OR salary_max IS NULL
      OR salary_min <= salary_max
    ),

    CONSTRAINT jobs_salary_units_check
    CHECK (
      (salary_min IS NULL AND salary_max IS NULL
        AND salary_currency IS NULL AND salary_period IS NULL)
      OR
      ((salary_min IS NOT NULL OR salary_max IS NOT NULL)
        AND salary_currency IS NOT NULL AND salary_period IS NOT NULL)
    ),

  CONSTRAINT jobs_seen_timestamps_check
    CHECK (last_seen_at >= first_seen_at)
);
