# Self-hosting

## Local Development

```bash
pnpm db:dev:up
DATABASE_URL=postgres://juno_wholesale_ops_app:change-me@localhost:5437/juno_wholesale_ops?sslmode=disable pnpm db:migrate
pnpm dev
```

After migrations, open `/settings`. Runtime env is bootstrap/fallback; the
singleton `service_setting` row is the primary operator settings surface. The
Settings Center shows database/runtime/default/unset source badges, masks
secrets, and lets operators clear DB overrides back to runtime/default values.

## Production Checklist

- Set `AUTH_ENABLED=true`.
- Use a strong `AUTH_SECRET`.
- Set `AUTH_BASE_URL` to the public app URL.
- Mount Google service account JSON as a secret.
- Keep Juno credentials in runtime env or secret storage.
- Store raw attachments outside the application image.
- Back up Postgres and attachment storage.
- Keep browser profile storage private.
- Prefer webhook `secret_ref` over inline config.

`DATABASE_URL` and `AUTH_SECRET` remain runtime-only and are not editable in
the Settings Center. Keep production auth enabled before exposing the service
beyond trusted local access.

## Docker

Build locally:

```bash
docker build -t juno-wholesale-ops:local .
```

The production compose files under `compose/` and `deploy/prod/` are skeletons.
Review them before use and inject secrets through your deployment platform.
