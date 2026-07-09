# mamen

## Dev server logs

`bun dev` (root, `turbo dev`) runs both dev servers. Each tees its output to a gitignored log file at repo root:

- `logs/server.log` — API/server (`@mamen/server`, bun --watch)
- `logs/web.log` — web frontend (`@mamen/web`, vite)

Before debugging a running-app issue: read the relevant log file first instead of starting a new server instance. Check if a server is already running (`lsof -i :<port>`) before spawning one.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`gh` CLI); external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context monorepo — `CONTEXT-MAP.md` at root points to per-package `CONTEXT.md`. See `docs/agents/domain.md`.
