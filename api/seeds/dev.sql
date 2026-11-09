-- Dev-only fake jobs. Every one belongs to the 'demo' source, never to a real provider.
-- Real providers come from migration 002. Safe to run repeatedly.

INSERT INTO job_sources (slug, name, base_url) VALUES
  ('demo', 'Demo data (fake jobs)', 'https://example.com')
ON CONFLICT (slug) DO NOTHING;

-- Earlier versions of this file credited the fake jobs to remote-ok and greenhouse.
-- Move them to demo. UPDATE keeps each row's id, so saved Postman requests keep working.
UPDATE jobs
SET source_id  = (SELECT id FROM job_sources WHERE slug = 'demo'),
    updated_at = now()
WHERE external_id LIKE 'seed-%'
  AND source_id IN (SELECT id FROM job_sources WHERE slug IN ('remote-ok', 'greenhouse'));

-- The greenhouse row only ever existed for fake jobs. Remove it once nothing points at it.
DELETE FROM job_sources s
WHERE s.slug = 'greenhouse'
  AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.source_id = s.id);

INSERT INTO jobs (
  source_id, external_id, title, company, application_url,
  work_arrangement, employment_type, location,
  salary_min, salary_max, salary_currency, salary_period,
  published_at, published_at_provenance, status
) VALUES
  -- 1. Fresh, 2 hours old, with a salary
  ((SELECT id FROM job_sources WHERE slug = 'demo'), 'seed-1', 'Backend Developer', 'Acme Pay', 'https://example.com/jobs/seed-1',
   'remote', 'full-time', NULL, 60000, 80000, 'USD', 'year', now() - interval '2 hours', 'source', 'active'),
  -- 2. Fresh, 20 hours old
  ((SELECT id FROM job_sources WHERE slug = 'demo'), 'seed-2', 'Frontend Developer', 'Kora Labs', 'https://example.com/jobs/seed-2',
   'hybrid', 'full-time', 'Lagos, Nigeria', NULL, NULL, NULL, NULL, now() - interval '20 hours', 'source', 'active'),
  -- 3. Two days old: only in the 3-day and 7-day windows
  ((SELECT id FROM job_sources WHERE slug = 'demo'), 'seed-3', 'Full-Stack Developer', 'Lagos Logistics', 'https://example.com/jobs/seed-3',
   'remote', 'contract', NULL, 40, 60, 'USD', 'hour', now() - interval '2 days', 'source', 'active'),
  -- 4. Eight days old: outside every window
  ((SELECT id FROM job_sources WHERE slug = 'demo'), 'seed-4', 'Backend Engineer', 'Ewa Health', 'https://example.com/jobs/seed-4',
   'onsite', 'full-time', 'Abuja, Nigeria', NULL, NULL, NULL, NULL, now() - interval '8 days', 'source', 'active'),
  -- 5. No date at all
  ((SELECT id FROM job_sources WHERE slug = 'demo'), 'seed-5', 'Frontend Engineer', 'Pixel Yard', 'https://example.com/jobs/seed-5',
   'unknown', 'unknown', NULL, NULL, NULL, NULL, NULL, NULL, 'unknown', 'active'),
  -- 6. Estimated date, 5 hours old
  ((SELECT id FROM job_sources WHERE slug = 'demo'), 'seed-6', 'Backend Developer', 'Tide Grid', 'https://example.com/jobs/seed-6',
   'remote', 'full-time', NULL, NULL, NULL, NULL, NULL, now() - interval '5 hours', 'estimated', 'active'),
  -- 7. A date in the future: bad provider data
  ((SELECT id FROM job_sources WHERE slug = 'demo'), 'seed-7', 'Full-Stack Engineer', 'Bright Orbit', 'https://example.com/jobs/seed-7',
   'remote', 'full-time', NULL, NULL, NULL, NULL, NULL, now() + interval '1 year', 'source', 'active'),
  
  -- 8. Fresh but closed
  ((SELECT id FROM job_sources WHERE slug = 'demo'), 'seed-8', 'Frontend Developer', 'Moss & Co', 'https://example.com/jobs/seed-8',
   'onsite', 'part-time', 'Lagos, Nigeria', NULL, NULL, NULL, NULL, now() - interval '1 hour', 'source', 'closed'),

  -- 9. Five days old: only in the 7-day window
  ((SELECT id FROM job_sources WHERE slug = 'demo'), 'seed-9', 'Full-Stack Developer', 'Lagos Logistics', 'https://example.com/jobs/seed-9',
   'remote', 'contract', NULL, 40, 60, 'USD', 'hour', now() - interval '5 days', 'source', 'active')
ON CONFLICT (source_id, external_id) DO UPDATE SET
  published_at            = EXCLUDED.published_at,
  published_at_provenance = EXCLUDED.published_at_provenance,
  status                  = EXCLUDED.status,
  updated_at              = now();

