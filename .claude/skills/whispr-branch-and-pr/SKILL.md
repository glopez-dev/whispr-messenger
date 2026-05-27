---
name: whispr-branch-and-pr
description: "Use when starting a branch, pushing, opening a pull request, requesting a Copilot review, checking CI, merging a PR, or returning to main in the whispr-messenger repo. Examples: \"Open a PR for this branch\", \"Push and request Copilot review\", \"Check CI on this PR\", \"Merge this PR\", \"Go back to main\""
---

# Branch and PR Workflow — whispr-messenger

## When to Use

- "Start a branch for WHISPR-XXX"
- "Push this branch"
- "Open a pull request"
- "Request a Copilot review"
- "Check CI on PR #N"
- "Merge PR #N"
- "Go back to main / clean up after merging"

## Workflow

```
1. git checkout main && git pull origin main
2. git checkout -b WHISPR-XXX-short-kebab-description
3. [implement, test, commit — see whispr-testing and rules/conventions.md]
4. git push -u origin <branch-name>
5. gh api repos/glopez-dev/whispr-messenger/pulls/<PR>/requested_reviewers \
     --method POST -f 'reviewers[]=copilot'
6. mcp__github__create_pull_request (see template below)
7. gh pr checks <PR> --repo glopez-dev/whispr-messenger
8. mcp__github__merge_pull_request (merge_method: "merge")
9. git checkout main && git pull origin main
```

## Checklist

```
- [ ] Branch named WHISPR-XXX-short-kebab-description
- [ ] Pushed with -u origin <branch>
- [ ] Copilot review requested via gh api
- [ ] PR created via mcp__github__create_pull_request
- [ ] CI green (gh pr checks)
- [ ] Merged with merge_method: "merge" (never squash)
- [ ] Returned to main and pulled
```

## Push

```bash
git push -u origin <branch-name>
```

After every push, request a Copilot review on the pull request:

```bash
gh api repos/glopez-dev/whispr-messenger/pulls/<PR-number>/requested_reviewers \
  --method POST -f 'reviewers[]=copilot'
```

## Open the PR

Use `mcp__github__create_pull_request`:

```json
{
  "owner": "glopez-dev",
  "repo": "whispr-messenger",
  "title": "<same as commit title>",
  "head": "<branch-name>",
  "base": "main",
  "body": "## Summary\n- bullet 1\n- bullet 2\n\n## Test plan\n- [ ] Unit tests green\n- [ ] Lint clean\n- [ ] Tested on iOS simulator\n- [ ] Tested on Android emulator\n\nCloses <TICKET-KEY>"
}
```

## Check CI

```bash
gh pr checks <PR-number> --repo glopez-dev/whispr-messenger
```

Fix any failing checks before merging.

## Merge

Once all CI checks are green, use `mcp__github__merge_pull_request`:

```json
{
  "owner": "glopez-dev",
  "repo": "whispr-messenger",
  "pullNumber": <number>,
  "merge_method": "merge"
}
```

**Always use `merge`** — never squash, never rebase. See `rules/conventions.md`.

## Return to main

```bash
git checkout main
git pull origin main
```
