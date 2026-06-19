# Self-hosting

## Local Development

```bash
pnpm db:dev:up
pnpm storage:dev:up # optional MinIO for S3-compatible attachment storage
cp .env.example .env
set -a
. ./.env
set +a
pnpm db:migrate
pnpm dev
```

After migrations, open `/settings`. Process env is limited to `DATABASE_URL`
and optional initial admin bootstrap values. Saved Postgres settings are the
primary operator settings surface. Mail ingest uses separate
`mail_connection` and `mail_mailbox_source` records, with no env fallback for
mailbox addresses, Gmail service account JSON, attachment storage settings, or
supplier codes. The Settings Center shows current editable values directly in
inputs, masks secrets, and avoids raw payload dumps.

Local MinIO is available through `pnpm storage:dev:up` for S3-compatible storage
testing. It uses the same MinIO release as the dsub local stack and exposes the
console on `http://localhost:29101`.

## Production Checklist

- Auth is always enabled. Configure an admin bootstrap path through existing
  admin rows, `AUTH_INITIAL_ADMIN_EMAIL`/`AUTH_INITIAL_ADMIN_PASSWORD`, or
  external provider admin mapping.
- Set the Settings Center `Site address` to the public app URL.
- Register the displayed External SSO callback URL in the provider console when
  enabling Generic OAuth/OIDC.
- Configure each mailbox source in the Settings Center. For Gmail, paste or
  mount the Google Workspace service account JSON into the mail source secret
  field or a private secret reference.
- Choose `Local drive` or `S3 compatible / MinIO` attachment storage per mailbox
  source. Saving requires a passing connection test that checks mailbox access
  and storage write/delete access.
- Keep Juno credentials in saved secret fields or private secret storage.
- Store raw attachments outside the application image, either in private local
  storage or private object storage.
- Back up Postgres and attachment storage.
- Keep browser profile storage private.
- Prefer webhook `secret_ref` over inline config.

`DATABASE_URL` remains runtime-only and required at process start. The app does
not fall back to database settings when it is missing. The internal Better Auth
secret is never editable or displayed in the Settings Center. Auth is always
enabled before the service is exposed beyond trusted local access.

## Docker

Build locally:

```bash
docker build -t juno-wholesale-ops:local .
```

Published images use the first-party Harbor namespace:

```text
harbor.dsub.io/dsub/juno-wholesale-ops-web:<tag>
```

The `Publish Image` GitHub Actions workflow publishes `main` and
`sha-<commit>` tags on pushes to `main`. Release Please owns version bumps,
release PRs, `v*` tags, and GitHub Releases. Release tags promote the existing
`sha-<commit>` image for that commit to the release tag instead of rebuilding.
If Release Please is running with `GITHUB_TOKEN`, the release workflow
dispatches `publish-image.yml` on the new tag because GitHub suppresses most
workflow events created by that token.
Configure these GitHub repository or organization secrets before enabling the
workflow:

```text
HARBOR_REGISTRY_USERNAME
HARBOR_REGISTRY_PASSWORD
```

Configure `RELEASE_PLEASE_TOKEN` with a maintainer-scoped token if Release
Please PRs, tags, and GitHub Releases must trigger follow-up GitHub Actions
workflows through a non-`GITHUB_TOKEN` actor. Without that token, Release Please
can still run with `GITHUB_TOKEN`, but GitHub may suppress workflows caused by
release artifacts created by that token.

Release tags also run the Komodo production deploy job after image promotion.
Configure these GitHub `production` environment secrets if you want tagged
releases to deploy automatically:

```text
KOMODO_URL
KOMODO_API_KEY
KOMODO_API_SECRET
KOMODO_STACK_NAME
```

`KOMODO_TOKEN` or `KOMODO_USERNAME` / `KOMODO_PASSWORD` may be used instead of
API key credentials. The Komodo stack must already exist, and its environment
must include `DATABASE_URL` before a production deploy can pass. Do not put
database URLs, supplier credentials, or raw attachment storage paths in GitHub
Actions secrets.

Production compose should use an immutable image reference such as
`harbor.dsub.io/dsub/juno-wholesale-ops-web:sha-<commit>` or a reviewed release
tag.

The production compose files under `compose/` and `deploy/prod/` are skeletons.
Review them before use and inject secrets through your deployment platform.
