# Local-first Operation

Juno Wholesale Ops runs with your database, your filesystem, and your
credentials. The maintainers do not receive catalog data from your deployment.

## Local Storage

- Postgres stores catalog snapshots, settings, signals, and notification
  records.
- Each mailbox source has an attachment storage backend for raw XLSX
  attachments outside git.
- LocalDrive stores under a local `.data` path. S3-compatible storage supports
  MinIO or S3-compatible self-hosted object storage.
- Playwright stores browser profile data in the configured local profile path.

## Credentials

Google service account JSON credentials, mailbox settings, Juno credentials,
and webhook secrets stay in private DB settings or private runtime secret
stores. They should not be committed.

## External Calls

Gmail calls happen only when ingest scripts run. Juno live observation opens
read-only product pages. Generic webhook delivery happens only when you
configure a webhook channel and run notification dispatch with `--send`.
