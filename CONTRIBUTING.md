# Contributing

Thanks for looking. Before you spend time on a change, please read the next
section — this repo is not the kind of open-source project that is looking for
help across the board, and it would be unfair to let you find that out from a
closed pull request.

## What this project is

mamen is a self-hosted personal-finance app that one person uses on their own
bank exports. It is public because there is no reason for it not to be, not
because it is looking for users. There is no roadmap, no release cadence, no
support promise, and the maintainer is one person.

Much of the code is written by coding agents working one GitHub issue at a time.
That shapes what is useful here more than anything else: the prose docs
(`CONTEXT-MAP.md`, the per-package `CONTEXT.md` files, `docs/adr/`) are the
shared context those agents read, so a change that makes the code and the docs
disagree is a real regression even when every test passes.

**Welcome:**

- Bug reports, especially with the statement rows (redacted) that reproduce them
- A parser for another bank's CSV export — this is the one extension point the
  code is deliberately shaped for, see `packages/web/src/features/import/parsers/`
- Corrections to documentation that has drifted from the code
- Security reports — see [SECURITY.md](SECURITY.md)

**Probably not:**

- New product features, unless you opened an issue first and it was labelled
  `ready-for-agent` or `ready-for-human`. Features here come with domain
  vocabulary and an ADR, and agreeing on those is most of the work.
- Multi-user, authentication, multi-currency. Each is a rewrite of an assumption
  the whole codebase rests on.
- Dependency bumps, reformatting sweeps, or refactors with no behaviour change.

## Getting set up

You need [Bun](https://bun.sh) — the repo pins `bun@1.3.4` — and a
`CLAUDE_CODE_OAUTH_TOKEN` in the API's environment, without which the API does
not boot at all (the `claude` CLI itself is only needed if you exercise PDF
import). [README.md](README.md#running-it-locally) has the full setup; the short
version:

```sh
bun install
echo 'CLAUDE_CODE_OAUTH_TOKEN=<your-token>' > packages/api/.env
bun dev
```

The web app is on <http://localhost:5070> and the API on
<http://localhost:5500>. Both dev servers tee their output to `logs/web.log` and
`logs/server.log`; read those before starting a second instance.

## Running the checks

All three run from the repo root and cover every workspace:

```sh
bun run typecheck
bun run test
bun run lint
```

`bun run lint:fix` applies what Biome can fix on its own. Formatting is Biome's
too — tabs, 80 columns — so don't hand-format around it.

A few things worth knowing before the first red run:

- `bun run test` runs Vitest in each package. The API's `test` script starts with
  a drift guard: it re-derives the OpenAPI spec from the contract and fails if
  `packages/api/openapi.json` no longer matches. So a contract change means
  running `bun run --filter @mamen/api emit-openapi` and committing the result.
- Tests never need the `claude` CLI or a real token — the API's suite provides a
  fake executor. Only the running server needs them.
- `bun run lint` is currently red on pre-existing errors in files nobody has got
  to. Compare the count before and after your change rather than expecting zero,
  and leave every file you touch clean.

## Sending a change

- One change per pull request, and say what it does in prose — what you decided
  and why, not just what moved.
- Tests before implementation where you can. The convention here is a failing
  test first: it is what tells you the test would have caught the bug.
- Follow the vocabulary in [CONTEXT-MAP.md](CONTEXT-MAP.md). If your change needs
  a word that isn't there, that's a sign it needs a decision, not a name.
- Architectural decisions get an ADR in `docs/adr/` (or
  `packages/web/docs/adr/` for frontend-only ones).

## For coding agents

[CLAUDE.md](CLAUDE.md) is the agent-facing version of this file and is kept
current with the code. It points at the per-package `CONTEXT.md` files, the
domain map, and the skill docs under `docs/agents/` — the issue-tracker
conventions, the triage-label vocabulary, and where the dev-server logs live.
Read it first; it is more specific than this document, and it is the one that
gets updated when the code moves.
