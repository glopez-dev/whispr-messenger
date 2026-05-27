# Project Identity

These project-level facts apply always.

| Key | Value |
|---|---|
| GitHub org/repo | `glopez-dev/whispr-messenger` |
| Default base branch | `main` |
| Node package manager | `npm` |
| Branch naming | `WHISPR-XXX-short-kebab-description` |

## Branch naming

Format: `WHISPR-<ticket-number>-<short-kebab-description-of-the-fix>`

Example: `WHISPR-310-fix-chat-screen-scroll-to-bottom`

Always branch from a fresh `main`:

```bash
git checkout main
git pull origin main
git checkout -b WHISPR-XXX-short-kebab-description
```
