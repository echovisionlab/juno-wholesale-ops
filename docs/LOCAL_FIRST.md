# Local-first Operation

Juno Wholesale Ops runs with your database, your filesystem, and your
credentials. The maintainers do not receive catalog data from your deployment.

## Local Storage

- Postgres stores catalog snapshots, settings, signals, and notification
  records.
- `GMAIL_STORAGE_DIR` stores raw XLSX attachments outside git.
- Playwright stores browser profile data in the configured local profile path.

## Credentials

Google service account keys, delegated mailbox settings, Juno credentials, and
webhook secrets stay in runtime env, secret mounts, or private DB settings.
They should not be committed.

## External Calls

Gmail calls happen only when ingest scripts run. Juno live observation opens
read-only product pages. Generic webhook delivery happens only when you
configure a webhook channel and run notification dispatch with `--send`.
