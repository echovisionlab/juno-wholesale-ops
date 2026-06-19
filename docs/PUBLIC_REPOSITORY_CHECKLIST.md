# Public Repository Checklist

Use this checklist before changing repository visibility. Do not make the
repository public until the owner explicitly approves that final action.

## Repository Settings

- [ ] Repository visibility change has final owner approval.
- [ ] Default branch: main.
- [ ] Branch protection or ruleset reviewed.
- [ ] Required status checks: Quality, Tests, Build.
- [ ] GitHub Actions permissions are minimal.
- [ ] Secret scanning is enabled.
- [ ] Dependabot alerts are enabled.
- [ ] Dependabot open alerts are zero, or remaining alerts have owner-approved accepted risk records with review deadlines.
- [ ] Public issue templates warn against sharing secrets or real wholesale data.

## Repository Contents

- [ ] No production secrets in repository.
- [ ] No real wholesale data in repository.
- [ ] No real Gmail payloads or raw attachments in repository.
- [ ] No webhook URLs, auth headers, cookies, service account keys, or Juno credentials in repository.
- [ ] Synthetic fixture workbooks only.
- [ ] README quick start verified.
- [ ] LICENSE present.
- [ ] SECURITY.md present.
- [ ] PRIVACY.md present.
- [ ] CHANGELOG.md present.
- [ ] Release notes written.
- [ ] Public safety check passes.
- [ ] Runtime dependency audit passes at moderate severity or higher.

## Release Actions

- [ ] `pnpm validate` passes.
- [ ] `pnpm build` passes.
- [ ] `docker build -t juno-wholesale-ops:local .` passes.
- [ ] Browser synthetic fixture check completed.
- [ ] Tag creation approved.
- [ ] GitHub Release draft prepared.
- [ ] Repository visibility change approved after release candidate review.
