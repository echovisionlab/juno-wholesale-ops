# Contributing

Thanks for improving Juno Wholesale Ops. Contributions must preserve the
read-only catalog intelligence boundary.

## Development

```bash
pnpm install
pnpm db:dev:up
DATABASE_URL=postgres://juno_wholesale_ops_app:change-me@localhost:5437/juno_wholesale_ops?sslmode=disable pnpm db:migrate
pnpm dev
```

## Required Checks

Run before opening a pull request:

```bash
pnpm validate
pnpm build
docker build -t juno-wholesale-ops:local .
```

Coverage gates are 100% for the configured files. Pure logic should have unit
tests. DB behavior should use Testcontainers PostgreSQL.

## Migration Rules

Migrations are append-only. Do not edit historical migrations. Add the next
sequential file and regenerate `infra/postgres/schema.sql` with:

```bash
pnpm db:schema:dump
```

## Fixture Rules

Fixtures must be synthetic. Do not commit real wholesale files, real artist or
label data from private sheets, credentials, webhook URLs, or email payloads.

## Pull Request Checklist

Use the repository pull request template. The checklist is mandatory for
read-only boundary, fixture safety, tests, and validation.
