# Changelog

## 0.1.0 - 2026-06-18

### Added

- Read-only Juno wholesale XLSX ingestion.
- Catalog snapshot dedupe across Gmail message ids, RFC822 ids, attachment hashes, and sheet content hashes.
- Catalog item identity normalization.
- Watch rules and observed signal generation.
- Movement, trend, and operator digest insights.
- Read-only notification delivery.
- Synthetic demo mode.
- Public safety checks.
- Self-hosting, privacy, security, and release documentation.

### Security

- Gmail readonly default scope.
- Admin route guards.
- Conservative live lookup defaults.
- Webhook secret masking.
- Public fixture safety checks.
- Replaced the vulnerable `xlsx` parser dependency with a maintained XLSX reader.
- Added parser byte-size, row-count, and first-sheet-only safeguards for catalog workbooks.
- Pinned `postcss` to a patched release through the package manager override.
- Release checklist for repository visibility, GitHub settings, and CI status.

### Boundaries

- No cart actions.
- No auto-ordering.
- No checkout automation.
- No sales-volume claims without observed evidence.
- No actual demand inference from observed stock or status changes.
