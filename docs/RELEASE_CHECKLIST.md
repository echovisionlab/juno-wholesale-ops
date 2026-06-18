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
- [ ] Settings Center reviewed: source badges, secret masking, reset-to-runtime, diagnostics, and production auth warning
- [ ] Release notes drafted
- [ ] GitHub Actions green
- [ ] Public repository checklist reviewed
- [ ] Dependabot open alerts are zero, or every remaining alert has an owner-approved accepted risk record with a review deadline
- [ ] Harbor publish secrets are configured if this release should publish an image
- [ ] Komodo deploy secrets are configured if this release should deploy after image promotion
- [ ] Production Komodo stack exists and has runtime-only `DATABASE_URL`
- [ ] Settings Center shows the effective Gmail scope is read-only unless the owner has explicitly accepted Gmail label mutation
- [ ] No cart, wishlist, checkout, purchase action, or Juno account mutation added
- [ ] No sales-volume claims without observed evidence

## Demo Check

```bash
pnpm db:dev:up
set -a
. ./.env
set +a
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

Confirm:

- [ ] Dashboard has no browser console warnings or errors.
- [ ] Today Signals renders from demo data.
- [ ] Movement Signals renders.
- [ ] Catalog Trends renders.
- [ ] Operator Digest renders.
- [ ] Notification Center renders.
- [ ] Settings Center renders at `/settings` with no raw secrets.
- [ ] Dashboard links to Settings Center and preserves API status failures.
- [ ] No external webhook call is made.

Reset demo rows after review:

```bash
set -a
. ./.env
set +a
pnpm demo:reset -- --confirm-demo-reset
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
- [ ] Confirm the tagged image was promoted in Harbor.
- [ ] Confirm the Komodo deploy job updated `JUNO_WHOLESALE_OPS_WEB_IMAGE`.
- [ ] Confirm production `/api/health` is healthy through the public endpoint.
- [ ] Prepare the GitHub Release draft from `docs/RELEASE_NOTES_v0.1.0.md`.
- [ ] Attach no real wholesale data, credentials, cookies, auth headers, webhook URLs, or raw attachments.
- [ ] Reconfirm repository visibility change approval before switching to public.

Do not release if the public safety check reports tracked env files, `.data`
files, secrets, broken local links, unsafe demo fixture values, missing release
documents, or missing release links.
