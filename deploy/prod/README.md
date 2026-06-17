# Production Deploy

Target hostname:

```text
catalog.example.com -> app-host.example.com:3100
```

The repository owns the canonical Compose and stack files, while the deployment
environment owns runtime values and secrets.

## Security Gate

The app protects all non-health routes through `src/proxy.ts`.

- checks `/api/session/admin`
- requires an active Better Auth session
- requires `auth_user.role=admin`
- redirects browser requests to `/login?redirect=...`
- returns JSON `401`, `403`, or `503` for API/non-browser requests

`/api/health`, Next assets, and public static files bypass this gate.

## Komodo Setup

Create or update a Komodo stack from `deploy/prod/app.stack.yml`.

Set these secrets in the stack environment, not in git:

```text
DATABASE_URL
AUTH_SECRET
AUTH_BASE_URL
GOOGLE_SERVICE_ACCOUNT_KEY_JSON
JUNO_LOGIN_EMAIL
JUNO_LOGIN_PASSWORD
```

Use an immutable image tag for `JUNO_WHOLESALE_OPS_WEB_IMAGE`, for example:

```text
registry.example.com/example/juno-wholesale-ops-web:sha-<git-sha>
```

The external Caddy/proxy layer must add:

```caddyfile
catalog.example.com {
    reverse_proxy app-host.example.com:3100
}
```

## Smoke Checks

Unauthenticated browser request should redirect:

```bash
curl -I https://catalog.example.com/
```

Health should stay available for Komodo:

```bash
curl -fsS https://catalog.example.com/api/health
```

An authenticated admin should render the dashboard in a browser. A non-admin
user should receive `403`.

Before deployment, validate that migrations and the generated master schema are
in sync:

```bash
pnpm db:migrations:check
```

The live worker needs all migrations applied before start. It is controlled by
the Next.js server through `/api/live-lookups/worker`, which starts or stops the
polling loop as a child process inside the web container. Its persistent
Playwright profile is stored in the
`juno-wholesale-ops-browser-profile` Docker volume so it does not relogin unless
the Juno session expires. Juno settings resolve from the singleton
`service_setting` row first and env fallback second. Leave both DB and env poll
interval values empty to disable automatic idle polling.

For automatic live-stock refreshes, set a poll interval such as
`JUNO_LIVE_POLL_INTERVAL_MS=7200000`. With credentials present and
`JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL=true`, the child worker enqueues unique Juno
IDs from the latest catalog snapshot each interval, then processes them with the
per-product randomized delay window. Gmail ingest state is available through
`/api/ingest/status` so operators can confirm the last Gmail query and last
unique DB catalog date before widening any search window.

## Future Hardening

This app performs its own Better Auth session and admin-role check. If the app
becomes part of a broader internal platform, configure the platform identity
provider through the external provider settings instead of adding platform-
specific compatibility code.
