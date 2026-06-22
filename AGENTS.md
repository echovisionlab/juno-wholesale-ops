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

## Code Quality Defaults

- Write readable code first. Prefer clear names, direct control flow, and
  obvious ownership over clever compression.
- Keep responsibility boundaries explicit. UI components render and coordinate
  interactions, controllers own client-side mutation flow, repositories own
  persistence, domain modules own policy and calculations, and scripts own
  operational orchestration.
- Apply clean-code judgment while respecting the existing architecture. Do not
  introduce an interface, adapter, service, or abstraction unless it clarifies a
  stable API boundary, reduces real duplication, or isolates an external
  dependency.
- Reuse established components and helpers before adding local one-off
  definitions. If a local definition is necessary, keep its scope narrow and its
  responsibility easy to name.
- Prefer small, reviewable changes that keep behavior, tests, docs, and
  operational UX moving together.

## Manager-Orchestrated Delivery

- Treat the main Codex thread as the engineering manager and integrator for
  substantial work. The main agent decomposes scope, assigns ownership,
  integrates results, validates end to end, and reports state to the user.
- Use expert agents for implementation, risk-specific audits, and review gates
  when work is non-trivial. Give each expert a concrete scope, expected output,
  and explicit instruction not to revert unrelated changes.
- After an expert or worker completes a substantial task, route the result
  through a separate expert review gate before merging or marking the task
  done. If a separate reviewer is unavailable, record the reason in the PR or
  final report and do not describe the task as review-gated.
- Review gates check readability, responsibility boundaries, unnecessary
  complexity, operational safety, UI usefulness, and test coverage.
- Track meaningful gaps, blockers, follow-up plans, and discovered issues in
  GitHub issues/milestones and `docs/ROADMAP.md`. Keep status labels honest:
  planned, partial, stabilization, blocked, or done.
- Close issues only after the implementation, tests, docs, main verification,
  and any required deployment checks are complete. Reference issues without
  closing keywords when the work is preparatory or partial.
- For each milestone-sized stream, keep the loop explicit: plan, assign,
  implement, review gate, validate, update issue/PR, merge, verify `main`, and
  verify deployment where applicable.

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
