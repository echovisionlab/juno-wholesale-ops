# Release Checklist

Do not create a tag, publish a GitHub Release, or change repository visibility
until the owner explicitly approves those final actions.

## Before Tagging

- [ ] `pnpm validate`
- [ ] `pnpm build`
- [ ] `docker build -t juno-wholesale-ops:local .`
- [ ] `pnpm db:migrations:check`
- [ ] `pnpm public:safety`
- [ ] Demo fixtures confirmed synthetic
- [ ] README links checked
- [ ] Security and privacy docs reviewed
- [ ] Release notes drafted
- [ ] GitHub Actions green
- [ ] Public repository checklist reviewed
- [ ] Dependabot open alerts are zero, or every remaining alert has an owner-approved accepted risk record with a review deadline
- [ ] No cart, wishlist, checkout, purchase action, or Juno account mutation added
- [ ] No sales-volume claims without observed evidence

## Demo Check

```bash
pnpm db:dev:up
DATABASE_URL=postgres://juno_wholesale_ops_app:change-me@localhost:5437/juno_wholesale_ops?sslmode=disable pnpm db:migrate
DATABASE_URL=postgres://juno_wholesale_ops_app:change-me@localhost:5437/juno_wholesale_ops?sslmode=disable pnpm demo:seed
pnpm dev
```

Confirm:

- [ ] Dashboard has no browser console warnings or errors.
- [ ] Today Signals renders from demo data.
- [ ] Movement Signals renders.
- [ ] Catalog Trends renders.
- [ ] Operator Digest renders.
- [ ] Notification Center renders.
- [ ] No external webhook call is made.

Reset demo rows after review:

```bash
DATABASE_URL=postgres://juno_wholesale_ops_app:change-me@localhost:5437/juno_wholesale_ops?sslmode=disable pnpm demo:reset -- --confirm-demo-reset
```

## Tagging

Only after final approval:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

## After Tagging

- [ ] Confirm the tag points at the approved release commit.
- [ ] Confirm GitHub Actions are green for the tagged commit.
- [ ] Prepare the GitHub Release draft from `docs/RELEASE_NOTES_v0.1.0.md`.
- [ ] Attach no real wholesale data, credentials, cookies, auth headers, webhook URLs, or raw attachments.
- [ ] Reconfirm repository visibility change approval before switching to public.

Do not release if the public safety check reports tracked env files, `.data`
files, secrets, broken local links, unsafe demo fixture values, missing release
documents, or missing release links.
