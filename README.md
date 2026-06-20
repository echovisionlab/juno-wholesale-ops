# Juno Wholesale Ops

Unofficial project. Not affiliated with Juno.

Read-only by design.

- No cart actions.
- No auto-ordering.
- No checkout automation.
- No sales-volume claims without observed evidence.

Juno Wholesale Ops is a local-first operations desk for parsing Juno wholesale
catalog XLSX attachments, storing catalog snapshots in Postgres, enriching rows
with read-only live observations, and surfacing observed signals for operators.

## What it is

This project is read-only catalog intelligence for self-hosted operators. It
collects catalog attachments from configured mailbox sources, parses the XLSX
rows, deduplicates snapshots, stores raw catalog data, and shows watch hits,
catalog trends, movement signals, operator digest data, and read-only
notifications.

The application is a Next.js app with API routes, Mantine UI components,
Postgres migrations, and Node worker scripts. It is intended to run on your own
machine or server with your own database and file storage.

## What it does not do

This project does not automate commercial actions or mutate a Juno account. It
does not place orders, prepare carts, update wishlists, perform checkout flows,
or infer actual sales volume. Observed stock/status changes are treated only as
observed signals.

It is not a SaaS platform, not a multi-tenant service, and not an official Juno
integration. External notification adapters are formatting-only and read-only;
external delivery is still explicit opt-in.

## Features

- Gmail XLSX ingestion through DB-backed mailbox source records.
- Duplicate protection by provider message id, RFC822 id, attachment SHA-256, and
  catalog content hash.
- Append-only Postgres migrations with generated schema drift checks.
- Catalog item identity normalization and watch rule matching.
- Today Signals, Movement Signals, Catalog Trends, and Operator Digest APIs.
- Read-only live stock observation through Playwright browser workers.
- Read-only notification delivery with in-app, logging, generic webhook,
  Slack-style, Discord-style, and Telegram-style webhook payloads.
- Synthetic fixture seed for local validation without real Juno wholesale email
  or XLSX data.
- Public safety checks for release readiness.

## Read-only boundary

The boundary is documented in [docs/PROJECT_BOUNDARIES.md](docs/PROJECT_BOUNDARIES.md).
The short version:

- The live worker opens product pages for observation only.
- The app does not call cart, wishlist, checkout, or ordering endpoints.
- Notification dispatch is informational only.
- Webhook sending is dry-run by default and requires an explicit `--send`.
- Fast mover candidates are proxy candidates based only on observed stock or
  status changes.

## Architecture

```text
Mailbox source
  -> XLSX attachment archive outside git
  -> Juno XLSX parser
  -> Postgres catalog snapshots
  -> identity normalization and watch matching
  -> optional read-only live observation worker
  -> insight refresh
  -> notification queue and optional dispatch
  -> Next.js dashboard on port 3006
```

Core directories:

- `src/app`: Next.js app routes and API routes.
- `src/components`: Mantine dashboard components.
- `src/lib/ingest`: Gmail, XLSX parser, and ingest repository.
- `src/lib/insights`: identity, watch, movement, trend, and digest logic.
- `src/lib/notifications`: notification matching, rendering, repository, and
  dispatcher.
- `infra/postgres/migrations`: append-only SQL migrations.
- `demo/fixtures`: synthetic XLSX fixtures.
- `docs`: public operations and release documentation.

## Quick start

```bash
pnpm install
pnpm db:dev:up
pnpm storage:dev:up # optional MinIO for S3-compatible attachment storage
cp .env.example .env
set -a
. ./.env
set +a
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

Open `http://localhost:3006`.

Local Postgres maps to host port `5437` so it can coexist with another
development database on `5432`.

Optional local MinIO maps to host ports `29100` and `29101`. The compose image
matches the dsub local stack MinIO release that still includes the console UI.

Optional local Cloudflare Tunnel:

```bash
mkdir -p .data/cloudflared
cp infra/cloudflared/dev.template.yml .data/cloudflared/config.yml
# Fill .data/cloudflared/config.yml with your local tunnel id and hostname.
# Keep .data/cloudflared/credentials.json private.
pnpm tunnel:dev:up
pnpm dev
```

The tunnel compose service is local-only and forwards the configured hostname
to the host Next.js dev server on port `3006`. It is not used by production
deployment files.

## Synthetic fixture seed

Local validation uses only synthetic catalog workbooks:

- `demo/fixtures/catalog/preorders-demo.xlsx`
- `demo/fixtures/catalog/in-stock-demo.xlsx`

Seed synthetic rows:

```bash
set -a
. ./.env
set +a
pnpm demo:seed
```

Reset synthetic rows only:

```bash
set -a
. ./.env
set +a
pnpm demo:reset -- --confirm-demo-reset
```

`demo:reset` refuses to run in `NODE_ENV=production`. See
[docs/DEMO_DATA.md](docs/DEMO_DATA.md).

## Configuration

Copy `.env.example` to `.env` for local development. Do not commit
`.env`. `DATABASE_URL` is required at process start; the service fails fast
instead of falling back to database settings when it is missing.

Important values:

- `DATABASE_URL`
- `AUTH_INITIAL_ADMIN_EMAIL`
- `AUTH_INITIAL_ADMIN_PASSWORD`

Operator settings are edited as current values in the Settings Center. Runtime
environment is only for process-required values and initial bootstrap defaults.
Mail ingest configuration does not use env fallback or legacy Gmail settings. It lives in
`mail_connection` and `mail_mailbox_source` records. Secret values are never
shown in the dashboard; only configured/unset status is shown.

The app Settings Center at `/settings` is the primary operator UX for runtime
readiness, saved operator settings, and read-only smoke checks.

`DATABASE_URL` remains runtime-only and cannot be persisted through the Settings
Center. Export `.env` into the current shell before running local CLI scripts
such as `pnpm db:migrate`, `pnpm demo:seed`, and `pnpm demo:reset`.
The public app URL is the saved `Site address` setting. External SSO setup shows
the provider callback URL that must be registered in the provider console. Auth
is always enabled. Startup creates an internal random Better Auth secret in the
database when one is missing; it is not an operator-facing setting. At least one
admin bootstrap path is still required.
Secret fields such as mail source credentials, Juno passwords, OIDC client
secrets, and webhook configuration are write-only and masked in API responses.

## Mail ingestion

Mail ingestion uses configured mailbox sources. Multiple mailboxes are separate
`mail_mailbox_source` records. Gmail sources require Google Workspace
delegation and a JSON service account credential stored as a secret DB value.
Pre-v1.0 releases do not keep compatibility shims for the older singleton Gmail
settings model; configure each mailbox source explicitly in the Settings Center.
Other provider rows can be represented for planning, but non-Gmail ingest
adapters are not implemented in v0.1.x.

Commands:

```bash
pnpm gmail:smoke
pnpm gmail:ingest
pnpm gmail:ingest:write
```

`gmail:ingest` is dry-run by default. `gmail:ingest:write` stores snapshots and
raw catalog rows in Postgres, then runs insight processing only when a new
snapshot is inserted.

Raw XLSX attachments are stored through the mailbox source attachment storage
backend:

- `Local drive`: stores attachments under a local `.data` path.
- `S3 compatible / MinIO`: stores attachments in a configured bucket and prefix.

Run the Mail Source connection test before saving; it checks both mailbox access
and attachment storage write/delete access. Keep local storage paths and object
storage buckets out of git and include them in private backup planning.

## Live stock observation

The live worker is optional and conservative by default:

```bash
pnpm juno:live:enqueue
pnpm juno:live:worker
pnpm juno:live:worker -- --loop
```

It uses Playwright Chromium with a persistent profile and randomized delays.
Automatic polling is disabled unless credentials and a poll interval are
configured. Credentials belong in saved secret fields or private secret storage.

## Insights

Insight commands:

```bash
pnpm insights:movement
pnpm insights:trends
pnpm insights:refresh
```

Admin-protected APIs:

```http
GET /api/insights/today
GET /api/insights/movement?limit=100
GET /api/insights/trends?windowDays=7&previousWindowDays=7&limit=20
GET /api/insights/digest
```

Insights use observed catalog snapshots, watch rules, signal events, and live
observations. They do not prove actual demand or actual sales volume.

## Notifications

Notification scripts:

```bash
pnpm notifications:queue
pnpm notifications:dispatch
pnpm notifications:dispatch -- --send
pnpm notifications:refresh
pnpm notifications:refresh -- --send
```

`notifications:dispatch` and `notifications:refresh` default to dry-run mode.
Actual webhook sending requires `--send`. Channels support in-app, logging,
generic webhook, Slack-style webhook, Discord-style webhook, and Telegram-style
webhook payloads. Prefer `secret_ref` for production webhook URLs. `config.url`
is supported for local development only. Dashboard/API responses mask webhook
config, and logs must not include webhook URLs, auth headers, cookies, or
secret values.

Admin-protected APIs:

```http
GET    /api/notifications/channels
POST   /api/notifications/channels
PATCH  /api/notifications/channels
DELETE /api/notifications/channels

GET    /api/notifications/rules
POST   /api/notifications/rules
PATCH  /api/notifications/rules
DELETE /api/notifications/rules

GET  /api/notifications/deliveries?limit=100
POST /api/notifications/queue
POST /api/notifications/dispatch
POST /api/notifications/refresh
```

## Self-hosting

See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) and
[docs/OPERATIONS.md](docs/OPERATIONS.md).

Production recommendations:

- Enable auth.
- Use immutable Harbor image refs such as
  `harbor.dsub.io/dsub/juno-wholesale-ops-web:sha-<commit>` or a reviewed
  release tag.
- Tagged releases can deploy through Komodo after image promotion when the
  production stack and Komodo GitHub secrets are configured.
- Use private secret storage or saved secret fields for credentials.
- Back up Postgres and raw attachment storage.
- Keep `.data`, `.env`, service account JSON, and browser profiles out of git.
- Run `pnpm validate`, `pnpm build`, and Docker build before release.

This repository is a self-hosted application. It is not intended to be
published as an npm package. `private: true` remains in `package.json` to reduce
the chance of accidental package publishing.

## Release docs

- [CHANGELOG.md](CHANGELOG.md)
- [docs/RELEASE_NOTES_v0.1.0.md](docs/RELEASE_NOTES_v0.1.0.md)
- [docs/PUBLIC_REPOSITORY_CHECKLIST.md](docs/PUBLIC_REPOSITORY_CHECKLIST.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)

## Privacy and security

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

The project does not send catalog data to a central service. Data remains in
the database, local filesystem, browser profile, and webhook destinations you
configure. Do not paste real wholesale XLSX contents, Gmail payloads,
credentials, cookies, auth headers, or webhook URLs into public issues.

Run the public safety check:

```bash
pnpm public:safety
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Contributions must preserve the
read-only boundary, use synthetic fixtures only, and keep coverage at 100% for
the configured gates.

## License

MIT. See [LICENSE](LICENSE).
