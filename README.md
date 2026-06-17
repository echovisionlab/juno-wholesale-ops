# Juno Wholesale Ops

Internal catalog-ingestion and purchasing operations service for Juno wholesale emails.

The MVP keeps the service compact:

- Next.js app for the operator UI and lightweight API routes
- Mantine components with shared theme settings in `src/theme.ts`
- Node worker scripts in the same repo for Gmail polling and XLSX ingestion
- Postgres migrations under `infra/postgres/migrations`
- Raw XLSX attachments stored outside git for replayable parsing

## Runtime Shape

```text
Configured Google Workspace mailbox
  -> query configured Juno XLSX mail search
  -> save raw XLSX by sha256
  -> parse Juno catalog rows
  -> write catalog snapshot and raw item rows to Postgres
```

Use a separate `juno_wholesale_ops` database when possible. If this must share
another Postgres server, keep the tables outside unrelated application schemas.

## Environment

Copy `.env.example` to `.env.local` for local development.

```bash
cp .env.example .env.local
```

Set `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` to the local service account JSON path or
to the mounted secret path in production. Never commit the JSON key.

The delegated mailbox and Gmail query are deployment settings, not source-code
constants. Set them through env or the singleton `service_setting` row:

```text
GOOGLE_WORKSPACE_DELEGATED_USER=<workspace-user@example.com>
GMAIL_INGEST_QUERY=has:attachment filename:xlsx newer_than:30d
```

The worker then filters XLSX attachments by filename:

```text
CATALOG_ATTACHMENT_PATTERN=New Preorders|New Releases In Stock
```

That keeps large `Full Stock List` and `Bestselling Titles` files out of the
daily MVP path unless we intentionally broaden the model.

## Commands

```bash
pnpm db:dev:up # local Postgres on localhost:5437
pnpm dev # http://localhost:3006
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm storybook
pnpm build-storybook
```

`pnpm test:coverage` enforces 100% statements, branches, functions, and lines
for the pure ingestion logic. Storybook runs on port `6008`.

Local Postgres is defined in `compose/dev.yml` and intentionally maps to host
port `5437` so it can coexist with other development databases on `5432`.
`pnpm db:dev:down` stops it without removing the persistent Docker volume.

Set `NEXT_PUBLIC_FONT_STYLESHEET_URL` when you want the app to load a hosted
font stylesheet. If unset, the UI uses the same Mantine theme with local font
fallbacks.

## Admin Auth Gate

The app can protect non-health routes with Better Auth. Email/password sign-in
is built in, and one external OIDC/OAuth provider can be configured from env or
from the singleton `service_setting` row.

```text
request
  -> /api/session/admin
  -> Better Auth session
  -> auth_user.role=admin
```

`AUTH_ENABLED` defaults to `false`. Production must explicitly set
`AUTH_ENABLED=true`, `AUTH_SECRET`, and `AUTH_BASE_URL`. Use
`AUTH_EMAIL_PASSWORD_ENABLED=true` for local admin accounts. Use
`AUTH_EXTERNAL_PROVIDER_ENABLED=true` with `AUTH_EXTERNAL_PROVIDER_ID`,
`AUTH_EXTERNAL_DISCOVERY_URL`, `AUTH_EXTERNAL_CLIENT_ID`, and
`AUTH_EXTERNAL_CLIENT_SECRET` for an external provider.

Browser requests without a valid admin session redirect to:

```text
/login?redirect=<current request URL>
```

API requests receive JSON `401`, `403`, or `503`. `/api/health` stays public
for Komodo health checks.

If `AUTH_INITIAL_ADMIN_EMAIL` and `AUTH_INITIAL_ADMIN_PASSWORD` are set,
`pnpm db:migrate` creates that administrator once. If the email already exists,
the seed is a no-op.

Gmail checks:

```bash
pnpm gmail:smoke
pnpm gmail:ingest
pnpm gmail:ingest:write
pnpm juno:live:enqueue
pnpm juno:live:worker
```

`pnpm gmail:ingest` is dry-run by default. It downloads and parses attachments
into `.data/mail-attachments` but does not write Postgres rows. Use
`pnpm gmail:ingest:write` only after applying all migrations.

Write mode records every run in the singleton `gmail_ingest_state` row:

- last Gmail query and query window
- last query start/finish/status/error
- last successful Gmail message received time
- last unique catalog snapshot id, catalog date, and content hash inserted into DB

After the first successful write, Gmail search becomes incremental. The worker
removes any date filters from `GMAIL_INGEST_QUERY` and adds an `after:YYYY/MM/DD`
filter based on `last_successful_message_received_at - GMAIL_INGEST_LOOKBACK_MS`.
The default lookback is seven days to absorb Gmail date granularity and delayed
group delivery. Duplicate group/direct deliveries are still rejected by message,
attachment, and catalog content hashes.

The current ingest cursor is exposed read-only:

```http
GET /api/ingest/status
```

The setup checklist is exposed read-only:

```http
GET /api/settings/status
```

Add `--label` when you want the worker to create/apply `GMAIL_PROCESSED_LABEL`
in Gmail after processing.

```bash
pnpm gmail:ingest -- --label
```

## Database Migrations

Migration files live in `infra/postgres/migrations` and are append-only. Never
edit an existing migration after it has been applied. Add the next sequential
file instead.

Rules enforced by `pnpm db:migrations:check`:

- filenames use `<version>_<name>.sql`
- versions are parsed numerically and must be gapless from `1`
- versions can run through `9999999`, so more than 1000 migrations are supported
- every applied migration is recorded in `schema_migration` with a SHA-256 hash
- changed historical migration SQL fails validation through the hash ledger
- `infra/postgres/schema.sql` must match a fresh `pg_dump --schema-only` from a Testcontainers PostgreSQL database after applying all migrations

Use these commands:

```bash
pnpm db:migrate
pnpm db:schema:dump
pnpm db:migrations:check
```

Next.js also applies pending migrations once during server startup when
`DATABASE_URL` is configured. The migration runner uses the same Postgres
advisory lock and hash ledger as `pnpm db:migrate`, so concurrent server
instances serialize migration work instead of applying the same file twice.

`schema.sql` is generated, not hand-edited. After adding a migration, run
`pnpm db:schema:dump` and commit both the new migration and the regenerated
master schema.

## Juno Live Stock Lookup

Apply all migrations before running live lookups. The live worker never calls
cart, wishlist, or alert endpoints. It opens read-only product pages in a
persistent Playwright Chromium profile and parses the server-rendered
`product-availability` text.

Queue jobs from the latest catalog snapshot:

```bash
pnpm juno:live:enqueue
```

Run one batch locally:

```bash
pnpm juno:live:worker
```

Run as a polling worker from the shell:

```bash
pnpm juno:live:worker -- --loop
```

In production the Next.js server can also manage that same loop as a child
process:

```http
GET  /api/live-lookups/worker
POST /api/live-lookups/worker {"action":"start"}
POST /api/live-lookups/worker {"action":"stop"}
POST /api/live-lookups/worker {"action":"restart"}
```

The dashboard uses these endpoints for manual start/stop control. The default
child command is `node_modules/.bin/tsx -r tsconfig-paths/register
scripts/juno-live-worker.ts --loop`; override it with
`JUNO_LIVE_WORKER_COMMAND` and `JUNO_LIVE_WORKER_ARGS` only when the runtime
layout changes.

Set these as secrets or private runtime env values:

```text
JUNO_LOGIN_EMAIL
JUNO_LOGIN_PASSWORD
```

Juno runtime settings resolve from the singleton `service_setting` row first
and fall back to typed env values when a DB column is `NULL`. Leave
`service_setting.juno_live_poll_interval_ms` and `JUNO_LIVE_POLL_INTERVAL_MS`
empty to disable automatic idle polling; the worker will process already queued
jobs and then exit instead of sleeping on a schedule.

When `juno_live_poll_interval_ms` or `JUNO_LIVE_POLL_INTERVAL_MS` is set, loop
mode stays alive. If credentials are configured and
`juno_live_auto_enqueue_on_interval` / `JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL` is
true, each interval enqueues unique Juno IDs from the latest catalog snapshot
before claiming jobs. Start conservatively with one to two hours, for example:

```text
JUNO_LIVE_POLL_INTERVAL_MS=7200000
```

Per-product navigation still uses the configured randomized delay window, so the
interval controls how often new batches are queued, not a fixed request cadence.

The worker logs every major action through `AppLogger`. The default production
worker uses both JSON console logs and the `service_log_event` Postgres audit
table. Log context is sanitized before writing; credentials, cookies, auth
headers, and full HTML bodies are not stored.

## Dedupe Contract

The worker treats duplicates at multiple levels:

- Gmail message: `gmail_user_email + gmail_message_id`
- Mail identity: `rfc822_message_id`
- Attachment identity: `sha256`
- Catalog identity: `supplier + sheet content_hash`

This handles group-delivery duplicates, direct + group duplicate delivery, and
the same XLSX content being resent under a different email, filename, or date.

## Current Limits

- Local filesystem storage is the first raw-attachment backend. Replace
  `GMAIL_STORAGE_DIR` with MinIO/S3 storage before running this as a multi-host
  production worker.
- The first parser targets the observed Juno XLSX columns only.
- No purchasing analysis or insight surface is included in this slice; the
  persisted model stores ingestion source data only.

## Production Skeleton

Deployment files:

- `Dockerfile`: Next standalone image
- `compose/app.yml`: production web service with a managed worker child process
- `deploy/prod/app.stack.yml`: Komodo stack skeleton
- `deploy/prod/README.md`: proxy, secret, and smoke-check notes

Target route example:

```text
catalog.example.com -> app-host.example.com:3006
```

Do not commit production secrets. `DATABASE_URL` and Google service account
material belong in the Komodo stack environment or secret mount.
