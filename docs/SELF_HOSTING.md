# Self-hosting

## Local Development

```bash
pnpm db:dev:up
DATABASE_URL=postgres://juno_wholesale_ops_app:change-me@localhost:5437/juno_wholesale_ops?sslmode=disable pnpm db:migrate
pnpm dev
```

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

## Docker

Build locally:

```bash
docker build -t juno-wholesale-ops:local .
```

The production compose files under `compose/` and `deploy/prod/` are skeletons.
Review them before use and inject secrets through your deployment platform.
