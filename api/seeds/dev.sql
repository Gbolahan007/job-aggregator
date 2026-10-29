INSERT INTO job_sources (slug, name, base_url) VALUES
  ('remote-ok',  'Remote OK',  'https://remoteok.com'),
  ('greenhouse', 'Greenhouse', 'https://www.greenhouse.io')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO jobs (
  source_id, external_id, title, company, application_url,
  work_arrangement, employment_type, location,
  salary_min, salary_max, salary_currency, salary_period,
  published_at, published_at_provenance, status
) VALUES
  -- 1. Fresh, 2 hours old, with a salary
  ((SELECT id FROM job_sources WHERE slug = 'remote-ok'), 'seed-1', 'Backend Developer', 'Acme Pay', 'https://example.com/jobs/seed-1',
   'remote', 'full-time', NULL, 60000, 80000, 'USD', 'year', now() - interval '2 hours', 'source', 'active'),
  -- 2. Fresh, 20 hours old
  ((SELECT id FROM job_sources WHERE slug = 'greenhouse'), 'seed-2', 'Frontend Developer', 'Kora Labs', 'https://example.com/jobs/seed-2',
   'hybrid', 'full-time', 'Lagos, Nigeria', NULL, NULL, NULL, NULL, now() - interval '20 hours', 'source', 'active'),
  -- 3. Two days old: only in the 3-day and 7-day windows
  ((SELECT id FROM job_sources WHERE slug = 'remote-ok'), 'seed-3', 'Full-Stack Developer', 'Lagos Logistics', 'https://example.com/jobs/seed-3',
   'remote', 'contract', NULL, 40, 60, 'USD', 'hour', now() - interval '2 days', 'source', 'active'),
  -- 4. Eight days old: outside every window
  ((SELECT id FROM job_sources WHERE slug = 'greenhouse'), 'seed-4', 'Backend Engineer', 'Ewa Health', 'https://example.com/jobs/seed-4',
   'onsite', 'full-time', 'Abuja, Nigeria', NULL, NULL, NULL, NULL, now() - interval '8 days', 'source', 'active'),
  -- 5. No date at all
  ((SELECT id FROM job_sources WHERE slug = 'remote-ok'), 'seed-5', 'Frontend Engineer', 'Pixel Yard', 'https://example.com/jobs/seed-5',
   'unknown', 'unknown', NULL, NULL, NULL, NULL, NULL, NULL, 'unknown', 'active'),
  -- 6. Estimated date, 5 hours old
  ((SELECT id FROM job_sources WHERE slug = 'greenhouse'), 'seed-6', 'Backend Developer', 'Tide Grid', 'https://example.com/jobs/seed-6',
   'remote', 'full-time', NULL, NULL, NULL, NULL, NULL, now() - interval '5 hours', 'estimated', 'active'),
  -- 7. A date in the future: bad provider data
  ((SELECT id FROM job_sources WHERE slug = 'remote-ok'), 'seed-7', 'Full-Stack Engineer', 'Bright Orbit', 'https://example.com/jobs/seed-7',
   'remote', 'full-time', NULL, NULL, NULL, NULL, NULL, now() + interval '3 hours', 'source', 'active'),
  
  -- 8. Fresh but closed
  ((SELECT id FROM job_sources WHERE slug = 'greenhouse'), 'seed-8', 'Frontend Developer', 'Moss & Co', 'https://example.com/jobs/seed-8',
   'onsite', 'part-time', 'Lagos, Nigeria', NULL, NULL, NULL, NULL, now() - interval '1 hour', 'source', 'closed'),

  -- 9. Five days old: only in the 7-day window
  ((SELECT id FROM job_sources WHERE slug = 'remote-ok'), 'seed-9', 'Full-Stack Developer', 'Lagos Logistics', 'https://example.com/jobs/seed-9',
   'remote', 'contract', NULL, 40, 60, 'USD', 'hour', now() - interval '5 days', 'source', 'active')
ON CONFLICT (source_id, external_id) DO UPDATE SET
  published_at            = EXCLUDED.published_at,
  published_at_provenance = EXCLUDED.published_at_provenance,
  status                  = EXCLUDED.status,
  updated_at              = now();

