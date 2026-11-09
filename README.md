# Job Aggregator

A job board that brings recent listings from public job APIs into one feed, with honest posting dates and clear eligibility, built for job seekers in Nigeria and abroad.

It is a portfolio and learning project: public and non-commercial.

**Status:** the API serves a feed of recent jobs from PostgreSQL. Ingestion from real providers (Phase 4) is in progress. Until it lands, the feed holds fake demo jobs only.

## What the API does today

| Endpoint | Purpose |
|---|---|
| `GET /jobs` | Jobs posted in the last 24 hours, 3 days or 7 days, by the provider's own posting date, with search, filters, sorting and pagination |
| `GET /jobs/:id` | One job |
| `GET /health` | Liveness: the process is up |
| `GET /ready` | Readiness: the database answers |

Query parameters for `GET /jobs`:

| Parameter | Values |
|---|---|
| `window` | `24h` (default), `3d`, `7d` |
| `q` | Text to find in the title or company, up to 100 characters |
| `location` | Text to find in the location |
| `work_arrangement` | `remote`, `hybrid`, `onsite`, `unknown` |
| `employment_type` | `full-time`, `part-time`, `contract`, `temporary`, `internship`, `unknown` |
| `source` | A source slug, such as `demo` |
| `page`, `limit` | Page from 1 to 1000; limit from 1 to 100, default 20 |
| `sort` | `newest` (default), `oldest` |

Unknown parameters and malformed values return `400`; a valid query with no matches returns `200` with an empty list.

## Stack

Node.js 24, Express 5 and TypeScript (strict, ES modules), with PostgreSQL 18 through hand-written parameterized SQL (`pg`, no ORM). A Next.js frontend comes later.

## Running it locally

You need Node.js 24 and PostgreSQL 18.

1. Install dependencies:

   ```sh
   cd api
   npm install
   ```

2. Create a role and a database, for example in `psql` as a superuser:

   ```sql
   CREATE ROLE job_app LOGIN PASSWORD 'change-me';
   CREATE DATABASE job_aggregator_dev OWNER job_app;
   ```

3. Copy `.env.example` to `.env` and set `DATABASE_URL`.

4. Apply the migrations, then load the feed configuration:

   ```sh
   npm run migrate
   psql "postgres://job_app:change-me@localhost:5432/job_aggregator_dev" \
     -v ON_ERROR_STOP=1 --single-transaction -f seeds/feeds.sql
   ```

5. Optionally, load nine fake jobs for trying the API:

   ```sh
   psql "postgres://job_app:change-me@localhost:5432/job_aggregator_dev" \
     -v ON_ERROR_STOP=1 --single-transaction -f seeds/dev.sql
   ```

6. Start the server and open `http://localhost:4000/jobs?window=7d`:

   ```sh
   npm run dev
   ```

The seed dates are relative to the moment you run them, so re-run `seeds/dev.sql` when the demo jobs age out of the windows.

## Data sources and attribution

Planned providers for Phase 4 are Remote OK, Remotive, Arbeitnow and Jooble. Each job will name its provider and link to the provider's own listing page, as their terms require. Job descriptions are not stored or republished.

The listings belong to their providers and employers. Any commercial use would need its own licensing review.

The fake jobs in `seeds/dev.sql` belong to the `demo` source and use `example.com` links. They are never credited to a real provider.

## Project layout

```text
api/
  migrations/     numbered SQL files; npm run migrate applies each one once
  seeds/          feeds.sql (feed configuration), dev.sql (fake demo jobs)
  src/
    config/       environment variables, validated at startup
    db/           connection pool and migration runner
    routes/       URL to controller
    controllers/  reads and validates the request, shapes the response
    models/       feed rules: windows, filters, pagination
    repositories/ SQL only
    utils/        AppError
```

## Licence

No licence has been chosen yet, so all rights are reserved for now.
