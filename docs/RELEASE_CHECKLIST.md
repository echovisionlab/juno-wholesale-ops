# Release Checklist

Release Please owns version bumps, release PRs, release tags, and GitHub Release
creation. Do not manually create or rewrite a release tag unless the owner
explicitly approves an emergency recovery action.

## Before Tagging

- [ ] `pnpm validate`
- [ ] `pnpm build`
- [ ] `docker build -t juno-wholesale-ops:local .`
- [ ] `pnpm db:migrations:check`
- [ ] `pnpm public:safety`
- [ ] Demo fixtures confirmed synthetic
- [ ] README links checked
- [ ] Security and privacy docs reviewed
- [ ] Settings Center reviewed: editable inputs show current values, secrets stay masked, and production auth readiness is clear
- [ ] Release notes drafted
- [ ] GitHub Actions green
- [ ] Public repository checklist reviewed
- [ ] Dependabot open alerts are zero, or every remaining alert has an owner-approved accepted risk record with a review deadline
- [ ] Harbor publish secrets are configured if this release should publish an image
- [ ] Komodo deploy secrets are configured if this release should deploy after image promotion
- [ ] `RELEASE_PLEASE_TOKEN` is configured if Release Please PRs and tags must trigger follow-up workflows through a non-`GITHUB_TOKEN` actor
- [ ] Production Komodo stack exists and has runtime-only `DATABASE_URL`
- [ ] Settings Center shows the effective Gmail scope is read-only unless the owner has explicitly accepted Gmail label mutation
- [ ] No cart, wishlist, checkout, purchase action, or Juno account mutation added
- [ ] No sales-volume claims without observed evidence

## Synthetic Fixture Check

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
- [ ] Today Signals renders from synthetic fixture data.
- [ ] Movement Signals renders.
- [ ] Catalog Trends renders.
- [ ] Operator Digest renders.
- [ ] Notification Center renders.
- [ ] Settings Center renders at `/settings` with no raw secrets.
- [ ] Dashboard links to Settings Center and preserves API status failures.
- [ ] No external webhook call is made.

Reset synthetic rows after review:

```bash
set -a
. ./.env
set +a
pnpm demo:reset -- --confirm-demo-reset
```

## Release Please Flow

Normal release flow:

- [ ] Merge only Conventional Commit PRs into `main`.
- [ ] Confirm the `Release Please` workflow creates or updates a release PR.
- [ ] Review the release PR for the intended version, `CHANGELOG.md`, and `package.json`.
- [ ] Confirm CI is green on the release PR.
- [ ] Merge the release PR when the owner approves the release.

When the release PR is merged, Release Please creates the `v*` tag and GitHub
Release. If `RELEASE_PLEASE_TOKEN` is configured, the tag push triggers
`publish-image.yml`. If Release Please falls back to `GITHUB_TOKEN`, the
`Release Please` workflow dispatches `publish-image.yml` on the new tag because
GitHub suppresses most workflow events created by `GITHUB_TOKEN`.

## After Release PR Merge

- [ ] Confirm the tag points at the approved release commit.
- [ ] Confirm GitHub Actions are green for the release commit.
- [ ] Confirm the tagged image was promoted in Harbor.
- [ ] Confirm the Komodo deploy job updated `JUNO_WHOLESALE_OPS_WEB_IMAGE`.
- [ ] Confirm production `/api/health` is healthy through the public endpoint.
- [ ] Confirm the GitHub Release is published by Release Please.
- [ ] Attach no real wholesale data, credentials, cookies, auth headers, webhook URLs, or raw attachments.

Do not release if the public safety check reports tracked env files, `.data`
files, secrets, broken local links, unsafe demo fixture values, missing release
documents, or missing release links.
