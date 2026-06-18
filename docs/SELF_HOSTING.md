# Self-hosting

## Local Development

```bash
pnpm db:dev:up
cp .env.example .env
set -a
. ./.env
set +a
pnpm db:migrate
pnpm dev
```

After migrations, open `/settings`. Runtime env is bootstrap/fallback; the
singleton `service_setting` row is the primary operator settings surface. The
Settings Center shows database/runtime/default/unset source badges, masks
secrets, and lets operators clear DB overrides back to runtime/default values.

## Production Checklist

- Optionally provide a strong `AUTH_SECRET` runtime override. If omitted,
  startup stores an internal random Better Auth secret in Postgres.
- Auth is always enabled. Configure an admin bootstrap path through existing
  admin rows, `AUTH_INITIAL_ADMIN_EMAIL`/`AUTH_INITIAL_ADMIN_PASSWORD`, or
  external provider admin mapping.
- Set the Settings Center `Site address` to the public app URL. `AUTH_BASE_URL`
  may be used only as a bootstrap fallback before the database setting exists.
- Mount Google service account JSON as a secret.
- Keep Juno credentials in runtime env or secret storage.
- Store raw attachments outside the application image.
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
`sha-<commit>` tags on pushes to `main`. Release tags `v*` promote the existing
`sha-<commit>` image for that commit to the release tag instead of rebuilding.
Configure these GitHub repository or organization secrets before enabling the
workflow:

```text
HARBOR_REGISTRY_USERNAME
HARBOR_REGISTRY_PASSWORD
```

Production compose should use an immutable image reference such as
`harbor.dsub.io/dsub/juno-wholesale-ops-web:sha-<commit>` or a reviewed release
tag.

The production compose files under `compose/` and `deploy/prod/` are skeletons.
Review them before use and inject secrets through your deployment platform.
