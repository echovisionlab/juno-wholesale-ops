# Synthetic Fixture Seed

The local seed fixtures are fully synthetic and intended for development and
release checks.

Fixtures:

- `demo/fixtures/catalog/preorders-demo.xlsx`
- `demo/fixtures/catalog/in-stock-demo.xlsx`

Rows use visibly synthetic artists, labels, catalog numbers, barcodes, and
Juno IDs. Synthetic Juno IDs use the `demo-` prefix.

## Seed

```bash
set -a
. ./.env
set +a
pnpm demo:seed
```

The seed command:

- parses the synthetic XLSX fixtures
- records synthetic catalog snapshots
- creates synthetic watch rules
- generates observed signals and movement signals
- queues in-app read-only notifications
- does not call Gmail, Juno, or external webhooks

## Reset

```bash
set -a
. ./.env
set +a
pnpm demo:reset -- --confirm-demo-reset
```

Reset deletes only synthetic fixture supplier, snapshots, signals, live
observations, notification records, and watch rules. It requires the confirm
flag and refuses `NODE_ENV=production`.
