# Project Boundaries

This project is read-only catalog intelligence.

It does not call cart, wishlist, checkout, or ordering endpoints. It does not
mutate a Juno account. It does not accept features that automate purchasing,
make purchasing decisions, or imply actual demand without observed evidence.

Observed stock or status changes are not evidence of actual sales volume. They
are observed signals only.

Accepted surfaces:

- Gmail read-only catalog attachment ingestion
- XLSX parsing and dedupe
- Postgres catalog snapshots
- Settings Center operator configuration with masked, write-only secrets
- read-only live product page observation
- watch hits and movement signals
- catalog trend and operator digest summaries
- read-only notification delivery

Rejected surfaces:

- account mutation
- cart mutation
- wishlist mutation
- checkout flows
- automated purchasing decisions
- claims about actual sales volume without observed evidence
