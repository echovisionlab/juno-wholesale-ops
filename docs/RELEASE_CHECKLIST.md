# Release Checklist

Before publishing:

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
- [ ] Tag prepared

Do not release if the public safety check reports tracked env files, `.data`
files, secrets, broken local links, or unsafe demo fixture values.
