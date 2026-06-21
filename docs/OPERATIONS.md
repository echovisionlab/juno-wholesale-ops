# Operations

Recommended manual sequence:

```bash
pnpm gmail:ingest:write
pnpm juno:live:worker
pnpm insights:refresh
pnpm notifications:refresh
```

Use `/settings` as the first operator stop before running commands. The
Settings Center groups configuration by operating unit: Auth/Admin Access,
Mailbox Ingest, Juno Live Session, and Notifications. Editable settings show the
current value directly in the input. Mail ingest settings are separate mail
source records, not env fallbacks.

Notes:

- Warning: Postgres backups are secret-bearing backups. They may contain saved
  auth settings, SSO client secrets, mail source credentials, Juno passwords,
  and notification secrets. Encrypt them, restrict restore access, and never put
  them in git, public issue text, screenshots, CI logs, or support bundles.
- `gmail:ingest:write` runs active Gmail mailbox sources, writes new catalog
  snapshots, and runs snapshot insights.
- Mail Source connection tests check mailbox access and attachment storage
  write/delete access before saving source configuration.
- `juno:live:worker` observes product pages read-only.
- `insights:refresh` refreshes movement and trend signals.
- `notifications:refresh` queues read-only notifications and performs dry-run
  dispatch by default.
- Notification channels support in-app, logging, generic webhook,
  Slack-style webhook, Discord-style webhook, and Telegram-style webhook
  payloads.
- External webhook delivery requires `pnpm notifications:dispatch -- --send`
  or `pnpm notifications:refresh -- --send`.
- `DATABASE_URL` is required at process start.
- `JUNO_WHOLESALE_OPS_AUTH_PROXY_INTERNAL_ORIGIN` should point to the private
  web origin in reverse-proxy deployments, for example
  `http://127.0.0.1:3006`, so auth self-checks do not depend on the public
  Caddy route.
- The public Site address is a saved setting in the Settings Center.
- Auth is always enabled. Startup stores an internal random Better Auth secret
  in the database when one is missing. Production deployments must provide at
  least one admin bootstrap path.
- Secret settings are write-only and masked; never expect the UI or API to echo
  mail source credentials, Juno passwords, OIDC client secrets, webhook URLs,
  cookies, or auth headers.
- Rotate SSO client secrets by changing the upstream identity provider secret,
  then saving the new value in Settings Center. Blank edit fields keep the
  existing saved secret.
- Restore any runtime `secret_ref` values before starting notification dispatch
  or SSO flows.

Never put credentials, cookies, auth headers, webhook URLs, or raw XLSX contents
in logs or public issue text.

## Release Automation

Release Please manages release PRs from Conventional Commits merged to `main`.
Merging a Release Please PR creates the `v*` tag and GitHub Release. The tag
push, or the Release Please workflow fallback dispatch when using `GITHUB_TOKEN`,
runs the image publish workflow on that tag. That promotes the Harbor image and
runs the Komodo production deploy job.

Use `fix:` for patch releases, `feat:` for minor releases, and `!` or a
`BREAKING CHANGE` footer only for major releases. Do not manually rewrite
release tags.
