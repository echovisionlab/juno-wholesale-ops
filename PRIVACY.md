# Privacy Policy

Juno Wholesale Ops is local-first. The project does not send catalog data to a
central service operated by the maintainers.

## Data Processed

Depending on configuration, your deployment may process:

- Gmail message metadata needed to locate XLSX attachments
- raw XLSX attachments saved in each mailbox source `storage_dir`
- parsed catalog rows
- read-only live observation results
- watch rules, signal events, operator digest data, and notification records

Raw Gmail payloads are stored only as the minimal message payload captured by
the ingest repository for dedupe and replay context. Raw XLSX attachments remain
on your filesystem or mounted storage.

## Local-first Storage

Data remains in your Postgres database, filesystem attachment archive, and
browser profile. Back up and delete those locations according to your own
operational policy.

## Webhooks

Webhook URLs may contain secrets. Prefer `secret_ref` values that point to
runtime env or mounted secrets. `config.url` exists for local development and
is not recommended for production. Dashboard and API responses mask webhook
config.

## Public Issues

Do not post real wholesale data, XLSX files, Gmail payloads, customer data,
credentials, cookies, auth headers, webhook URLs, or database dumps in public
issues or pull requests. Use synthetic demo data instead.
