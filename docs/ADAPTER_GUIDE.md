# Adapter Guide

Adapters must preserve the read-only boundary.

Allowed adapter behavior:

- read-only data retrieval
- normalized observed signal creation
- notification delivery that is informational only
- secret masking in API and dashboard responses

Disallowed adapter behavior:

- Juno account mutation
- cart mutation
- wishlist mutation
- checkout flow automation
- automated purchasing decisions
- claims about actual sales volume without observed evidence

New adapters should expose dry-run behavior by default and require explicit
operator action for any external notification send.
