# Conventions — Commits, Merges, Hooks

These rules apply always. Do not violate them without explicit user confirmation.

## Commit messages

Use Conventional Commits:

```
<type>(<scope>): <short imperative summary>

<optional body — explain the why, not the what>
```

- **type**: `fix`, `feat`, `refactor`, `test`, `docs`, `chore`
- **scope**: screen or feature name, e.g. `chat`, `auth`, `profile`, `navigation`
- Subject in **English**, even when the codebase is in another language.
- Do **not** mention Claude, AI, or any tooling in the commit message.
- Do **not** use emojis.

Example:

```
fix(chat): scroll to bottom on new message received
```

Stage only the files you changed (`git add <file1> <file2>` — never `git add -A` or `git add .`).

## Hooks

- Never use `--no-verify` to skip git hooks. If a hook fails, fix the underlying issue and create a new commit.
- Never amend an existing commit — always create a new one.

## Merging PRs

- Always use **merge** (not squash, not rebase) to keep the granular commit history.
- `mcp__github__merge_pull_request` → `"merge_method": "merge"`.

## Semantic version bump

`.github/workflows/release.yml` runs on every push to `main` and bumps the
version tag based on the commits since the last `v*` tag (merge commits
excluded, matching is case-insensitive):

| Commit pattern | Bump |
|---|---|
| `<type>!:` / `<type>(scope)!:` (trailing `!`) or `BREAKING CHANGE` / `BREAKING-CHANGE` in the subject | **major** |
| `feat:` / `feat(scope):` | **minor** |
| Anything else (`fix`, `chore`, `docs`, `refactor`, `test`, …) | **patch** |

If any commit in the range matches `major`, the bump is major; otherwise if
any matches `minor`, the bump is minor; otherwise patch. Choose the commit
type with this in mind.
