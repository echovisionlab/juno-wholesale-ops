# v0.1.0 Release Notes

## Purpose

Juno Wholesale Ops v0.1.0 is a self-hosted, read-only catalog intelligence release
candidate. It helps operators ingest Juno wholesale XLSX catalog attachments,
deduplicate snapshots, observe catalog rows, and review observed signals.

This is an unofficial project. It is not affiliated with Juno.

## Read-only Boundary

This release does not automate ordering, cart actions, wishlist actions, checkout flows, or purchase decisions.

이 릴리즈는 자동 주문, 장바구니 조작, 위시리스트 조작, 체크아웃 흐름, 구매 결정을 자동화하지 않습니다.

Observed stock and status changes are treated as observed signals only. They are
not evidence of actual sales volume or actual demand.

## Major Features

- Gmail readonly XLSX ingestion with duplicate protection.
- Postgres catalog snapshots and append-only migrations.
- Catalog identity normalization and watch rule matching.
- Today Signals, Movement Signals, Catalog Trends, and Operator Digest APIs.
- Optional read-only live observation worker.
- Read-only notification queue and dispatch layer.
- Synthetic fixture seed/reset commands for local validation.
- Public safety checks for release readiness.

## Synthetic Fixture Seed

Local validation uses only synthetic workbooks:

- [../demo/fixtures/catalog/preorders-demo.xlsx](../demo/fixtures/catalog/preorders-demo.xlsx)
- [../demo/fixtures/catalog/in-stock-demo.xlsx](../demo/fixtures/catalog/in-stock-demo.xlsx)

```bash
pnpm db:dev:up
set -a
. ./.env
set +a
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

Reset synthetic rows after review:

```bash
set -a
. ./.env
set +a
pnpm demo:reset -- --confirm-demo-reset
```

## Quick Start

```bash
pnpm install
pnpm db:dev:up
set -a
. ./.env
set +a
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

Open `http://localhost:3006`.

## Known Limitations

- Gmail ingest requires Google Workspace service account delegation.
- Live observation requires operator-provided Juno credentials when enabled.
- Notification webhook sending is dry-run by default and must be explicitly enabled with `--send`.
- Synthetic fixture data is not a wholesale price sheet.
- This repository is a self-hosted application, not an npm package.

## Security And Privacy Notes

- Do not commit `.env`, `.data`, browser profiles, service account JSON, raw Gmail payloads, raw attachments, credentials, cookies, auth headers, or webhook URLs.
- Prefer private secret storage for production credentials.
- Keep Postgres and attachment storage in private backup planning.
- Run `pnpm public:safety` before tagging.

## Upgrade And Migration Notes

v0.1.0 is the first release candidate. Apply migrations with:

```bash
DATABASE_URL=<postgres-url> pnpm db:migrate
```

The migration sequence is append-only and should be checked with:

```bash
pnpm db:migrations:check
```
