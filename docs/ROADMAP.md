# Roadmap

This roadmap keeps the project focused on read-only catalog intelligence. Items
may move only when they preserve the documented project boundaries.

## Next Operational Candidates

The next work queue is intentionally small and operational. Versions are not
planned manually here. Each merged PR uses a semantic Conventional Commit title,
and Release Please decides the next release from the manifest and changelog
configuration.

Each candidate keeps the read-only boundary unchanged and must not add ordering,
cart, wishlist, checkout, Juno account mutation, or sales-volume inference
behavior.

Storybook remains on port `6008`.

### Supplier adapter docs/examples

Issue: [#1](https://github.com/echovisionlab/juno-wholesale-ops/issues/1)

- Document adapter expectations for supplier email/XLSX sources beyond the
  default pipeline.
- Use synthetic fixture examples only.
- Explain parser contracts, fixture rules, and public safety expectations.

### Watch rule import/export

Issue: [#2](https://github.com/echovisionlab/juno-wholesale-ops/issues/2)

- Add a local JSON or YAML path for moving watch rules between self-hosted
  environments.
- Validate schema and duplicate handling.
- Exclude raw catalog rows, Gmail payloads, credentials, webhook URLs, cookies,
  and auth headers.

### Backup/restore guide

Issue: [#3](https://github.com/echovisionlab/juno-wholesale-ops/issues/3)

- Document Postgres backup and restore.
- Cover raw attachment storage and browser profile caveats.
- Keep secret and environment backup guidance explicit without publishing secret
  values.

### Notification provider adapters

Issue: [#4](https://github.com/echovisionlab/juno-wholesale-ops/issues/4)

- Design provider-specific notification formatting for services such as Slack,
  Discord, or Telegram.
- Preserve dry-run defaults, secret masking, and `--send` opt-in external
  delivery.

### Dashboard filtering/saved views

Issue: [#5](https://github.com/echovisionlab/juno-wholesale-ops/issues/5)

- Add filters for signal type, severity, watch hits, and date ranges.
- Store saved views in the local/self-hosted database.
- Avoid user tracking and multi-tenant SaaS behavior.
- Keep Settings Center controls concise and do not reintroduce raw JSON dumps
  into the main dashboard.

### Parser fixture expansion

Issue: [#6](https://github.com/echovisionlab/juno-wholesale-ops/issues/6)

- Expand parser regression coverage with synthetic XLSX fixtures.
- Cover empty rows, unknown columns, safe large row counts, date formats, price
  formats, and missing Juno ID fallback identity cases.
- Never publish real Juno wholesale XLSX, artists, labels, barcodes, catalog
  numbers, pricesheets, credentials, or email payloads.

### Mail source provider setup

Issue: [#44](https://github.com/echovisionlab/juno-wholesale-ops/issues/44)

- Move Mail Sources to provider-based setup while keeping Gmail Workspace as the
  only implemented provider.
- Require a successful read-only connection test before saving a runnable source.
- Keep Gmail Workspace scopes fixed and non-editable.

### Notification operations UX

Issue: [#45](https://github.com/echovisionlab/juno-wholesale-ops/issues/45)

- Make channel, rule, queue, and dispatch flows clear for operators.
- Add provider-specific notification formatting while keeping dry-run defaults.
- Keep webhook URLs, tokens, auth headers, and secrets masked.

### Storybook coverage

Issue: [#43](https://github.com/echovisionlab/juno-wholesale-ops/issues/43)

- Add stories for Settings Center sections, dialogs, and important dashboard
  states.
- Keep Storybook on port `6008`.

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
