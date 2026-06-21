# Roadmap

This roadmap keeps the project focused on read-only catalog intelligence. Items
may move only when they preserve the documented project boundaries.

Release Please still owns release PRs, tags, and version bumps from Conventional
Commit titles. The buckets below describe intent: `v0.6.x` is stabilization, and
`v0.7.0` is the next feature-candidate pool.

Every item must keep the read-only boundary unchanged and must not add ordering,
cart, wishlist, checkout, Juno account mutation, or sales-volume inference
behavior.

Storybook remains on port `6008`.

## Implemented or Partially Implemented

### Dashboard filtering and saved views

Issue: [#5](https://github.com/echovisionlab/juno-wholesale-ops/issues/5)
Status: partially implemented.

- Dashboard filters cover signal type, severity, watch-hit inclusion, and date
  range.
- Saved views are stored in the local/self-hosted database.
- Dashboard controls stay inside the read-only operator surface and avoid raw
  catalog row dumps.
- Remaining stabilization: browser-level regression coverage, Storybook states,
  and operational edge-case review before closing the issue.

### Mail source provider model

Issue: [#44](https://github.com/echovisionlab/juno-wholesale-ops/issues/44)
Status: partially implemented.

- Mail Sources now use a provider registry and provider-shaped source records.
- Gmail Workspace is the only implemented ingest adapter.
- IMAP, Microsoft Graph, and Generic mailbox are represented as planned/disabled
  providers, not runnable adapters.
- Runnable sources require a successful read-only connection and attachment
  storage test before saving.

### SSO multi-provider base

Status: partially implemented.

- Settings Center supports multiple DB-managed OAuth/OIDC providers with
  callback URLs, button labels, logo URLs, enabled state, and provider-scoped
  admin mapping.
- The login page can render multiple ready SSO providers.
- Remaining hardening is secret storage: move SSO client secrets toward
  `secret_ref` or encrypted-at-rest storage instead of raw write-only DB values.

### Notification operations UX

Issue: [#45](https://github.com/echovisionlab/juno-wholesale-ops/issues/45)
Status: remaining hardening.

- In-app, logging, generic webhook, Slack-style, Discord-style, and
  Telegram-style notification payloads exist.
- Settings Center separates queue, dry-run dispatch, send queued, and refresh
  actions.
- Dry-run remains the default. External sends require an explicit send action.
- In-app-only operation is normal; missing webhook URLs are a webhook send
  limitation, not a system warning.
- Remaining stabilization: keep queue/dry-run/send/refresh copy, telemetry, and
  error states aligned across Settings Center, CLI docs, and API responses.

## v0.6.x Stabilization

### Auth and login policy alignment

- Keep `emailPasswordLoginEnabled=false` synchronized between Better Auth
  runtime options, `/login`, and Settings Center.
- Show login-method-unavailable state when local email/password login is off and
  no ready SSO provider exists.
- Keep Settings Center admin bootstrap and SSO readiness copy aligned with the
  login page.

### SSO secret storage hardening

Issue: [#54](https://github.com/echovisionlab/juno-wholesale-ops/issues/54)
Status: implemented for new and migrated SSO providers.

- Store new SSO provider secrets through `client_secret_ref` only.
- Keep legacy raw `client_secret` values masked and runtime-compatible until
  each provider is migrated.
- Treat Postgres backups as secret-bearing while any legacy raw SSO secret rows
  or other saved credentials remain.
- Keep rotation and restore docs explicit without publishing secret values.
- Remaining follow-up: add a migration/reporting aid for operators to identify
  legacy SSO rows that still need `client_secret_ref` migration.

### Mail provider UX stabilization

- Keep Gmail Workspace visibly implemented.
- Keep IMAP, Microsoft Graph, and Generic mailbox visibly planned/disabled.
- Do not allow planned providers to be saved as runnable ingest sources.

### Notification operations stabilization

- Keep dry-run and send flows visibly separate in the UI and CLI docs.
- Keep webhook URLs, tokens, auth headers, and secrets masked.
- Keep missing webhook destinations out of warning state unless an explicit send
  attempt fails for that webhook delivery.

### Backup/restore guide

Issue: [#3](https://github.com/echovisionlab/juno-wholesale-ops/issues/3)

- Document Postgres backup and restore.
- Cover raw attachment storage and browser profile caveats.
- Explain how `secret_ref` values and external secret managers must be restored
  before app startup.

### Storybook coverage

Issue: [#43](https://github.com/echovisionlab/juno-wholesale-ops/issues/43)

- Add stories for Settings Center sections, dialogs, login method states, and
  dashboard setup states.
- Keep Storybook on port `6008`.

## v0.7.0 Feature Candidates

### Supplier adapter docs/examples

Issue: [#1](https://github.com/echovisionlab/juno-wholesale-ops/issues/1)

- Document adapter expectations for supplier email/XLSX sources beyond the
  default pipeline.
- Use synthetic fixture examples only.
- Explain parser contracts, fixture rules, and public safety expectations.

### Additional mail adapters

- Implement IMAP, Microsoft Graph, or Generic mailbox adapters only after the
  provider UX and secret storage policy are stable.
- Preserve read-only mailbox access and connection-test gating.

### Watch rule import/export

Issue: [#2](https://github.com/echovisionlab/juno-wholesale-ops/issues/2)

- Add a local JSON or YAML path for moving watch rules between self-hosted
  environments.
- Validate schema and duplicate handling.
- Exclude raw catalog rows, Gmail payloads, credentials, webhook URLs, cookies,
  and auth headers.

### Notification provider adapters

Issue: [#4](https://github.com/echovisionlab/juno-wholesale-ops/issues/4)

- Extend provider-specific formatting only where it remains informational and
  read-only.
- Preserve dry-run defaults, secret masking, and explicit send opt-in external
  delivery.

### Parser fixture expansion

Issue: [#6](https://github.com/echovisionlab/juno-wholesale-ops/issues/6)

- Expand parser regression coverage with synthetic XLSX fixtures.
- Cover empty rows, unknown columns, safe large row counts, date formats, price
  formats, and missing Juno ID fallback identity cases.
- Never publish real Juno wholesale XLSX, artists, labels, barcodes, catalog
  numbers, pricesheets, credentials, or email payloads.

## Later

- More operator digest grouping options.
- Expanded synthetic fixture scenarios for local validation.
- Additional self-hosting deployment examples.
- Screenshot capture for public documentation.

## Not planned

- Auto-ordering.
- Cart automation.
- Checkout automation.
- Wishlist mutation.
- Purchase action automation.
- Juno account mutation.
- Sales-volume inference.
- Claims about actual demand without observed evidence.
- Real wholesale fixture publication.
