# Operations

Recommended manual sequence:

```bash
pnpm gmail:ingest:write
pnpm juno:live:worker
pnpm insights:refresh
pnpm notifications:refresh
```

Use `/settings` as the first operator stop before running commands. The
Settings Center groups configuration by operating unit: Data Mode, Auth/Admin
Access, Gmail Workspace Ingest, Juno Live Session, and Notifications. Editable
settings show the current value directly in the input; source/storage details
live under Advanced. Sanitized JSON diagnostics live under Advanced and are
collapsed by default. Mail ingest settings are separate mail source records, not
env fallbacks.

Notes:

- `gmail:ingest:write` runs active Gmail mailbox sources, writes new catalog
  snapshots, and runs snapshot insights.
- `juno:live:worker` observes product pages read-only.
- `insights:refresh` refreshes movement and trend signals.
- `notifications:refresh` queues read-only notifications and performs dry-run
  dispatch by default.
- External webhook delivery requires `pnpm notifications:dispatch -- --send`
  or `pnpm notifications:refresh -- --send`.
- `DATABASE_URL` stays runtime-only.
- The public Site address is the primary saved setting in the Settings Center. `AUTH_BASE_URL`
  remains only a bootstrap value before the saved setting exists.
- Auth is always enabled. `AUTH_SECRET` is an optional runtime override; when it
  is absent, startup stores an internal random Better Auth secret in the
  database without exposing it in Settings Center. Production deployments must
  provide at least one admin bootstrap path.
- Secret settings are write-only and masked; never expect the UI or API to echo
  mail source credentials, Juno passwords, OIDC client secrets, webhook URLs,
  cookies, or auth headers.

Never put credentials, cookies, auth headers, webhook URLs, or raw XLSX contents
in logs or public issue text.
