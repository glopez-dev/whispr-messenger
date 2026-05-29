# Feature-first architecture (target convention)

This document defines the **target** folder convention for whispr-messenger as it
migrates toward a pragmatic, feature-first clean architecture. It is the contract
that the `eslint-plugin-boundaries` guardrail enforces (permissive first, strict
later) and that every refactor PR should move code *toward*. It does not describe
the current state — the migration is incremental, one feature at a time.

## Why

Today business logic, data access, encryption, and UI are tangled: services are
direct API clients, Zustand stores orchestrate fetch + decrypt + enrich + state,
and screens call services directly and decrypt inline. The goal is to isolate
testable business logic from the UI and the network, per feature, without
introducing heavyweight DI or rich-entity ceremony everywhere.

## Layout

```
src/
  features/
    <feature>/
      ui/           # screens, components, feature-specific hooks (presentation)
      application/  # use-cases + the feature's Zustand store (state-only)
      domain/       # entities (behavior), repository interfaces, pure rules
      data/         # repository implementations wrapping services/*/api.ts
  shared/
    ui/             # cross-feature presentational components
    hooks/          # cross-feature hooks
    lib/            # http client, query client, low-level helpers
    config/         # api urls, constants
    theme/          # design system
    i18n/           # translations
    types/          # cross-feature transport DTOs
```

Features: `chat`, `auth`, `contacts`, `groups`, `profile`, `settings`,
`moderation`, `calls`.

## Layers

| Layer         | Contains                                                        | May import                          |
|---------------|-----------------------------------------------------------------|-------------------------------------|
| `ui`          | screens, components, feature hooks                              | own `application`, `shared`         |
| `application` | use-cases (orchestration + encryption), the feature store      | own `domain`, `shared`              |
| `domain`      | entities with behavior, repository interfaces, pure rules      | `shared/types` only                 |
| `data`        | repository implementations (wrap `services/*/api.ts`, cache)    | own `domain`, `shared`              |

## Dependency rule

- `ui → application → domain`
- `data → domain` (data implements the interfaces declared in domain)
- `shared` is importable by everything; `shared` imports **nothing** feature-specific.
- **Nothing imports `ui`.**
- **No cross-feature imports** except through `shared`. If feature A needs
  something from feature B, it goes through `shared` (or B exposes a stable
  contract that lives in `shared`).

Wiring direction follows the dependency-inversion idea pragmatically: `domain`
declares a repository *interface*; `data` provides the implementation; the
use-case in `application` receives the implementation (composed at the store or
screen boundary) rather than importing `services/*` directly.

## Path aliases

`@/features/*` → `src/features/*`, `@/shared/*` → `src/shared/*`, `@/*` → `src/*`
(see `tsconfig.json` and the jest `moduleNameMapper`). Prefer alias imports.

## Migration status

Code still lives under the legacy roots (`src/screens`, `src/store`,
`src/services`, `src/components`, `src/context`, …). These are classified as
*legacy* element types by `eslint-plugin-boundaries` and tolerated while the
migration is in progress. They are removed feature-by-feature as each feature
gains its `ui/application/domain/data` structure. The chat feature is the pilot.
