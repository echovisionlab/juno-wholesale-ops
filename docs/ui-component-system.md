# UI Component System

This document defines the UI ownership model for Juno Wholesale Ops.

The dependency direction is:

```text
app routes -> features -> core UI
```

Do not invert this direction.

## Layers

### App Routes

Routes under `src/app` should stay thin. They may load server data, apply route
guards, and pass typed props into feature components. They should not own large
forms, tables, dialogs, notification handling, or domain workflows.

### Features

Feature code lives under `src/features/{domain}` and owns product workflows.

Feature components may:

- call APIs and server routes.
- own domain state, modals, form drafts, save/test actions, and notifications.
- compose Mantine primitives and core UI into operator workflows.
- use domain terms such as mail source, SSO provider, Juno live, watch rule, or
  notification rule.

Feature components should still be split by workflow. A feature file over about
500 lines needs a clear reason to remain whole. Large Settings Center sections
should be split into list, dialog, form, and status components.

### Core UI

Core UI lives under `src/components/core` and is domain-free. It may wrap Mantine
only when the project has a stable product-level UI rule to encode.

Core UI must not import:

- `src/features/**`
- `src/app/**`
- API routes or repository code
- auth/session helpers
- notification side effects
- domain settings or provider schemas

Core UI receives text and state through props. It does not decide what to save,
test, enable, disable, enqueue, ingest, or notify.

### Compatibility Components

Existing `src/components/**` modules may temporarily re-export feature or core
components while imports are migrated. New code should import feature code from
`@/features/...` and pure primitives from `@/components/core/...`.

## Storybook

Storybook is a state matrix tool, not a screenshot gallery.

- Core stories use `Core/...` titles.
- Feature stories use `Feature/...` titles.
- A feature story should model real operator states: empty, configured, disabled,
  missing credential, invalid config, test failed, and test passed where
  applicable.
- Settings Center changes should include feature stories for the affected
  section, not only route-level browser checks.
- Do not add overlapping globs that register the same story twice.

## Current Migration Notes

Juno started with a small component tree, but Settings Center accumulated too
much domain behavior in one TSX file. The migration target is:

```text
src/app/settings/page.tsx             # thin route wrapper
src/features/settings/                # Settings Center workflows
src/components/core/                  # domain-free primitives
src/components/settings/SettingsPage  # temporary compatibility export
```

The first migration step moved Settings Center into `src/features/settings`.
Next steps should split mail sources, SSO providers, Juno live, and notification
settings into focused feature components with Storybook coverage.
