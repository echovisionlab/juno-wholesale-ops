# Production Deploy

Target hostname:

```text
inventory.dsub.io -> dsub-app-vm.intra.io:3100
```

This follows the dsub production pattern: the repository owns the canonical
Compose and stack files, while Komodo stack environment owns runtime values and
secrets.

## Security Gate

The app protects all non-health routes through `src/proxy.ts`.

- reads `dsub_session` and `dsub_session_dev`
- calls `https://auth.dsub.io/sessions/whoami`
- requires an active Kratos session
- requires `identity.metadata_public.role=admin`
- redirects browser requests to `https://www.dsub.io/auth/login?redirect=...`
- returns JSON `401`, `403`, or `503` for API/non-browser requests

`/api/health`, Next assets, and public static files bypass this gate.

## Komodo Setup

Create or update a Komodo stack from `deploy/prod/app.stack.yml`.

Set these secrets in the stack environment, not in git:

```text
DATABASE_URL
GOOGLE_SERVICE_ACCOUNT_KEY_JSON
JUNO_LOGIN_EMAIL
JUNO_LOGIN_PASSWORD
```

Use an immutable image tag for `INVENTORY_WEB_IMAGE`, for example:

```text
harbor.dsub.io/dsub/inventory-web:sha-<git-sha>
```

The external Caddy/proxy layer must add:

```caddyfile
inventory.dsub.io {
    reverse_proxy dsub-app-vm.intra.io:3100
}
```

## Smoke Checks

Unauthenticated browser request should redirect:

```bash
curl -I https://inventory.dsub.io/
```

Health should stay available for Komodo:

```bash
curl -fsS https://inventory.dsub.io/api/health
```

An authenticated DSUB admin should render the dashboard in a browser. A
non-admin DSUB user should receive `403`.

Before deployment, validate that migrations and the generated master schema are
in sync:

```bash
pnpm db:migrations:check
```

The live worker needs all migrations applied before start. It is controlled by
the Next.js server through `/api/live-lookups/worker`, which starts or stops the
polling loop as a child process inside the web container. Its persistent
Playwright profile is stored in the
`inventory-juno-browser-profile` Docker volume so it does not relogin unless
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

This app performs its own Kratos `whoami` and role check. If inventory grows
into a broader DSUB internal surface, move the hostname behind dsub Oathkeeper
and check the admin role through Keto using the same generated-rule pattern as
the main dsub manage APIs.
