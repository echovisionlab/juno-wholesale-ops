# Operations

Recommended manual sequence:

```bash
pnpm gmail:ingest:write
pnpm juno:live:worker
pnpm insights:refresh
pnpm notifications:refresh
```

Use `/settings` as the first operator stop before running commands. The
Settings Center shows whether each value is coming from a database override,
runtime fallback, schema default, or is unset, and it exposes reset-to-runtime
controls for DB-backed settings.

Notes:

- `gmail:ingest:write` writes new catalog snapshots and runs snapshot insights.
- `juno:live:worker` observes product pages read-only.
- `insights:refresh` refreshes movement and trend signals.
- `notifications:refresh` queues read-only notifications and performs dry-run
  dispatch by default.
- External webhook delivery requires `pnpm notifications:dispatch -- --send`
  or `pnpm notifications:refresh -- --send`.
- `DATABASE_URL` and `AUTH_SECRET` stay runtime-only bootstrap values.
- Production deployments must keep `AUTH_ENABLED=true`.
- Secret settings are write-only and masked; never expect the UI or API to echo
  service account JSON, Juno passwords, OIDC client secrets, webhook URLs,
  cookies, or auth headers.

Never put credentials, cookies, auth headers, webhook URLs, or raw XLSX contents
in logs or public issue text.
