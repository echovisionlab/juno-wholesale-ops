# Screenshots

Screenshots for public docs must use synthetic fixture data only.

Before adding screenshots:

1. Run `pnpm demo:reset -- --confirm-demo-reset`.
2. Run `pnpm demo:seed`.
3. Open the dashboard locally.
4. Confirm no real artist, label, catalog, Gmail, credential, webhook, or
   deployment values are visible.

Store screenshots under a future `docs/screenshots/` directory only after
running `pnpm public:safety`.
