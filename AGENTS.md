<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Juno Wholesale Ops Codex Workflow

This repository is a read-only catalog intelligence service. Every Codex change
must preserve the boundary in `docs/PROJECT_BOUNDARIES.md`: no cart, wishlist,
checkout, ordering, Juno account mutation, purchase automation, or sales-volume
claims.

## Work Intake

- Start by checking `git status --short --branch`. If the active worktree has
  unrelated dirty changes, use a clean worktree or branch instead of mixing
  scopes.
- Before committing, pushing, opening a PR, or writing PR body text, check the
  repository's open GitHub milestones, issues, and PRs with `gh`.
- Treat GitHub issues and `docs/ROADMAP.md` as the source of truth for whether
  work is stabilization, partial implementation, or a feature candidate.
- Explicitly decide whether a PR closes an issue or only references it. Use
  closing keywords only when the issue is fully implemented, tested, documented,
  and verified on `main`.
- Do not touch `v0.1.0` tags, GitHub Releases, release notes, Release Please
  branches, or release automation unless the user explicitly requests release
  work.

## Agent Usage

Use sub-agents aggressively for broad stabilization, security, UX, or release
work, but keep ownership clear.

- The main agent owns orchestration, final integration, validation, and the
  user-facing report.
- Use explorer agents for independent audits such as auth/security exposure,
  Settings Center UX, roadmap/docs consistency, CI/deploy state, and code
  complexity review.
- Use worker agents only when each worker has a disjoint file or module scope.
  Tell workers they are not alone in the codebase and must not revert unrelated
  changes.
- Do not duplicate the same review in multiple agents. Split by risk area:
  security, frontend UX, persistence/migrations, docs/roadmap, CI/deploy.
- Integrate agent findings before merge. If a finding is intentionally not
  fixed, record the reason in the PR or final report.

## Review And Merge Readiness

- Code review should lead with bugs, security risks, operational regressions,
  missing tests, and unnecessary complexity.
- For Settings Center or dashboard UI work, review whether the UI is operational
  and actionable. Avoid decorative badges, status noise, or labels that do not
  help an operator decide what to do.
- For auth, notification, mail source, webhook, OAuth, and backup work, verify
  that secrets, tokens, webhook URLs, OAuth credentials, service account JSON,
  cookies, and auth headers are never printed, echoed by APIs, committed, or
  shown in screenshots.
- For database changes, include migrations, update `infra/postgres/schema.sql`,
  and update migration-count tests.
- For public API changes, keep responses minimal and avoid exposing build-time
  or environment metadata unless it is part of a deliberate public contract.
- Before merging, confirm PR CI is green. After merging, confirm `main` CI and
  publish/deploy automation where applicable.

## Local Gates

Use the smallest meaningful gate while iterating, then run the full gate before
PR/merge for code changes:

```bash
pnpm validate
pnpm build
pnpm public:safety
docker build -t juno-wholesale-ops:local .
```

For frontend behavior, use the dev server for local iteration so HMR reflects
changes immediately. Use browser smoke checks for `/login`, `/settings`, and
the dashboard when those surfaces are touched.

## Deployment Verification

- `inventory-dev` is the dev deployment target. Verify it through the
  user-provided URL/API, not by guessing from production deployment state.
- `inventory.dsub.io` and `inventory-dev.dsub.io` are different targets. Do not
  treat production availability as proof of dev deployment.
- If a public version endpoint intentionally omits commit metadata, do not add
  SHA/env exposure just for convenience. Use CI/publish records and safe health
  endpoints as the deployment source of truth.
