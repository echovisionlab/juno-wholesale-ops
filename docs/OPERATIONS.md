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
  auth settings, mail source credentials, Juno passwords, and notification
  secrets. Encrypt them, restrict restore access, and never put them in git,
  public issue text, screenshots, CI logs, or support bundles.
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
- The public Site address is a saved setting in the Settings Center.
- Auth is always enabled. Startup stores an internal random Better Auth secret
  in the database when one is missing. Production deployments must provide at
  least one admin bootstrap path.
- Secret settings are write-only and masked; never expect the UI or API to echo
  mail source credentials, Juno passwords, SSO client secret references, webhook
  URLs, cookies, or auth headers.
- SSO provider saves store a `client_secret_ref` only. Supported forms are
  `env:NAME` and `file:/absolute/path`; raw SSO client secret input is rejected,
  and unsupported or unavailable refs make that provider unavailable.
- Rotate SSO client secrets by changing the upstream identity provider secret,
  then updating the referenced runtime secret. Change Settings Center only when
  the reference name or file path changes.
- Restore runtime `secret_ref` and SSO `client_secret_ref` targets before
  starting notification dispatch or SSO flows.

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
