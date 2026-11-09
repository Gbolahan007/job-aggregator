-- 002_ingestion.sql: real providers, feeds, location and eligibility columns, run log.
-- Adds to 001; changes no existing column or constraint.

-- Real providers are reference data every environment needs, not dev seed data.
-- DO NOTHING keeps any row that already exists (remote-ok is already in dev databases).
INSERT INTO job_sources (slug, name, base_url) VALUES
  ('remote-ok', 'Remote OK', 'https://remoteok.com'),
  ('remotive',  'Remotive',  'https://remotive.com'),
  ('arbeitnow', 'Arbeitnow', 'https://www.arbeitnow.com'),
  ('jooble',    'Jooble',    'https://ng.jooble.org')
ON CONFLICT (slug) DO NOTHING;

-- One row per thing we fetch: a provider's whole feed, or one Jooble search.
CREATE TABLE source_feeds (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id             bigint NOT NULL REFERENCES job_sources(id) ON DELETE RESTRICT,
  feed_key              text NOT NULL CHECK (feed_key ~ '^[a-z0-9-]+$'),
  name                  text NOT NULL CHECK (btrim(name) <> ''),
  config                jsonb NOT NULL DEFAULT '{}'::jsonb
                          CHECK (jsonb_typeof(config) = 'object'),
  min_interval_minutes  integer NOT NULL DEFAULT 180 CHECK (min_interval_minutes >= 0),
  is_enabled            boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT source_feeds_source_key_uniq UNIQUE (source_id, feed_key)
);

-- Where a job is, who may apply, and what the provider said in its own words.
-- Every new column has a default or allows NULL, so existing rows stay valid.
ALTER TABLE jobs
  ADD COLUMN feed_id bigint REFERENCES source_feeds(id) ON DELETE RESTRICT,
  ADD COLUMN country_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN remote_eligibility text NOT NULL DEFAULT 'unknown'
    CHECK (remote_eligibility IN ('worldwide', 'restricted', 'unknown')),
  ADD COLUMN eligibility_text text CHECK (btrim(eligibility_text) <> ''),
  ADD COLUMN eligible_country_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN visa_sponsorship text NOT NULL DEFAULT 'unknown'
    CHECK (visa_sponsorship IN ('offered', 'not_offered', 'unknown')),
  ADD COLUMN salary_text text CHECK (btrim(salary_text) <> ''),

  -- Two capital letters per element. '*' stands in for a NULL element,
  -- so a NULL inside an array fails the pattern too.
  ADD CONSTRAINT jobs_country_codes_check
    CHECK (array_to_string(country_codes, ',', '*') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  ADD CONSTRAINT jobs_eligible_codes_check
    CHECK (array_to_string(eligible_country_codes, ',', '*') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),

  -- Eligible countries only make sense for a restricted job.
  -- Restricted with no countries means a region we don't map, such as "Europe".
  ADD CONSTRAINT jobs_eligible_codes_need_restricted_check
    CHECK (remote_eligibility = 'restricted' OR cardinality(eligible_country_codes) = 0);

-- PostgreSQL doesn't index foreign-key columns automatically; closures filter by feed_id.
CREATE INDEX jobs_feed_id_idx        ON jobs (feed_id);
-- The "New on our site" view filters and sorts on first_seen_at.
CREATE INDEX jobs_first_seen_idx     ON jobs (first_seen_at DESC, id DESC);
-- GIN indexes serve the "array contains" operator @> used by the country filters.
CREATE INDEX jobs_country_codes_idx  ON jobs USING gin (country_codes);
CREATE INDEX jobs_eligible_codes_idx ON jobs USING gin (eligible_country_codes);

-- One row per feed per run: what happened and how many requests it cost.
CREATE TABLE ingestion_runs (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feed_id         bigint NOT NULL REFERENCES source_feeds(id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  request_count   integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  fetched_count   integer NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  inserted_count  integer NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  updated_count   integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  closed_count    integer NOT NULL DEFAULT 0 CHECK (closed_count >= 0),
  skipped_count   integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  error           text,

  -- A run is 'running' exactly when it has no finish time.
  CONSTRAINT ingestion_runs_finished_check
    CHECK ((status = 'running') = (finished_at IS NULL)),
  CONSTRAINT ingestion_runs_order_check
    CHECK (finished_at >= started_at)
);

CREATE INDEX ingestion_runs_feed_started_idx ON ingestion_runs (feed_id, started_at DESC);
