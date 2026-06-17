# Security Policy

## Reporting

Report vulnerabilities privately to the maintainers. Do not open a public issue
with credentials, wholesale catalog contents, Gmail payloads, cookies, auth
headers, webhook URLs, service account JSON, database dumps, or raw attachments.

Include:

- affected version or commit
- reproduction steps with secrets removed
- expected and actual behavior
- whether the read-only boundary appears affected

## Supported Scope

Security support covers the current `main` branch and the latest tagged
release. Older deployments should update before requesting detailed triage.

## Secret Exposure

If a Google service account key, Juno credential, webhook secret, cookie, auth
header, or database URL is exposed:

1. Revoke or rotate the exposed value at the provider.
2. Remove the value from logs, issue text, screenshots, and local shells.
3. Re-run `pnpm public:safety`.
4. Review webhook delivery records and worker logs for unexpected activity.

## Read-only Boundary Reports

Please report any behavior that appears to call cart, wishlist, checkout, or
ordering endpoints. Those behaviors are outside the project boundary and should
be treated as security-sensitive.
