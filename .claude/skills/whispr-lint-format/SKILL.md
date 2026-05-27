---
name: whispr-lint-format
description: "Use when finishing an edit and preparing to commit — run ESLint autofix and Prettier on the whispr-messenger codebase. Examples: \"Run lint\", \"Format the code\", \"Lint and prettier before committing\", \"Prepare to commit\""
---

# Lint and Format — whispr-messenger

## When to Use

- "Run lint" / "Lint and fix"
- "Format the code" / "Run prettier"
- "Prepare to commit" / before staging files
- Any time the edit is done and the change is about to be committed

## Workflow

```bash
npm run lint:fix
npx prettier --write "src/**/*.{ts,tsx}"
```

Run both, in this order, before staging files for a commit.

## Checklist

```
- [ ] npm run lint:fix passes with no remaining errors
- [ ] npx prettier --write "src/**/*.{ts,tsx}" applied
- [ ] git diff reviewed — no unintended formatting changes outside touched lines
```

> See `rules/implementation.md`: do not change formatting outside the touched lines. If Prettier reformats unrelated files, leave those changes out of your commit.
