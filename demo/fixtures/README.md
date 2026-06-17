# Synthetic Demo Fixtures

The XLSX files in `demo/fixtures/catalog/` are generated synthetic catalog
workbooks. They are not real wholesale sheets and do not contain real artist,
label, catalog number, barcode, Juno ID, credential, webhook URL, or email
data.

Use them with:

```bash
pnpm demo:seed
pnpm demo:reset -- --confirm-demo-reset
```

All demo Juno IDs must start with `demo-`.
