-- Feed configuration, safe for every environment. Run after migrations.
-- This file is the source of truth: re-running it resets each feed to the values below.
INSERT INTO source_feeds (source_id, feed_key, name, config, min_interval_minutes, is_enabled)
SELECT s.id, f.feed_key, f.name, f.config::jsonb, f.min_interval_minutes, f.is_enabled
FROM (VALUES
  ('remote-ok', 'all', 'Remote OK: all jobs', '{}', 1440, true),
  ('remotive',  'all', 'Remotive: all jobs',  '{}',  360, true),
  ('arbeitnow', 'all', 'Arbeitnow: all jobs', '{"maxPages": 5, "visaPass": true}', 360, true),
  -- Jooble stays off until its key and live check (Task 4.9); these queries are provisional.
  ('jooble', 'lagos',          'Jooble: jobs in Lagos',
     '{"keywords": "", "location": "Lagos"}', 1440, false),
  ('jooble', 'nigeria-remote', 'Jooble: remote jobs from Nigeria',
     '{"keywords": "remote", "location": "Nigeria"}', 1440, false)
) AS f(slug, feed_key, name, config, min_interval_minutes, is_enabled)
JOIN job_sources s ON s.slug = f.slug
ON CONFLICT (source_id, feed_key) DO UPDATE SET
  name                 = EXCLUDED.name,
  config               = EXCLUDED.config,
  min_interval_minutes = EXCLUDED.min_interval_minutes,
  is_enabled           = EXCLUDED.is_enabled;
