# Demo Data

Demo data is fully synthetic and intended for local release checks.

Fixtures:

- `demo/fixtures/catalog/preorders-demo.xlsx`
- `demo/fixtures/catalog/in-stock-demo.xlsx`

Rows use visibly synthetic artists, labels, catalog numbers, barcodes, and
Juno IDs. Demo Juno IDs use the `demo-` prefix.

## Seed

```bash
set -a
. ./.env
set +a
pnpm demo:seed
```

The seed command:

- parses the synthetic XLSX fixtures
- records demo catalog snapshots
- creates demo watch rules
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

Reset deletes only demo supplier, demo snapshots, demo signals, demo live
observations, demo notification records, and demo watch rules. It requires the
confirm flag and refuses `NODE_ENV=production`.
