# mamen

## Dev server logs

`bun dev` (root, `turbo dev`) runs every dev server. Each tees its output to a gitignored log file at repo root:

- `logs/server.log` — API/server (`@mamen/api`, bun --watch)
- `logs/web.log` — web frontend (`@mamen/web`, vite)
- `logs/landing-page.log` — public landing page (`@mamen/landing-page`, vite)

Before debugging a running-app issue: read the relevant log file first instead of starting a new server instance. Check if a server is already running (`lsof -i :<port>`) before spawning one.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`gh` CLI); external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Demo screenshots

The README's images are captured from the demo stack by one procedure, teardown
included. See `.claude/skills/demo-screenshots/SKILL.md`.

### README and landing-page reconciliation

The README and the public landing page have to tell a reader the same commands,
steps, prerequisites and environment facts. `bun run landing:reconcile` diffs
the two command sets; the pass around it — what must agree, what may differ, and
what to do when the code moved under both — is
`.claude/skills/readme-landing-sync/SKILL.md`.

### Domain docs

Multi-context monorepo — `CONTEXT-MAP.md` at root points to per-package `CONTEXT.md`. See `docs/agents/domain.md`.
