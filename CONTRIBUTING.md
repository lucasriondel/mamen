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
`TOKEN_ENCRYPTION_KEY` in the API's environment, without which no AI credential
can be stored (the `claude` CLI and a Claude Code token are only needed if you
exercise PDF import, and that token is pasted in **Settings**, not in the
environment). [README.md](README.md#running-it-locally) has the full setup; the
short version:

```sh
bun install
echo "TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)" > packages/api/.env
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

`bun run lint:fix` applies what Biome can fix on its own.

**The formatter is oxfmt, not Biome.** The repo's `.ts`/`.tsx` is formatted by
oxfmt's defaults (spaces, 100 columns); `biome.json` still says tabs/80, so
`biome format` and `bun run lint`'s formatting complaints are wrong about every
file and are expected to be. Run `bunx oxfmt .` and don't hand-format around it.

A few things worth knowing before the first red run:

- `bun run test` runs Vitest in each package. The API's `test` script starts with
  a drift guard: it re-derives the OpenAPI spec from the contract and fails if
  `packages/api/openapi.json` no longer matches. So a contract change means
  running `bun run --filter @mamen/api emit-openapi` and committing the result.
- Tests never need the `claude` CLI or a real token — the API's suite provides a
  fake executor. Only the running server needs them.
- `bun run lint` is red, and part of that is expected. Biome's *formatting*
  complaints are now wrong about every file (see above) and its linter is red on
  pre-existing errors in files nobody has got to. Compare the count before and
  after your change rather than expecting zero, and leave every file you touch
  clean.

### The oxc toolchain

`.oxlintrc.json` and `.oxfmtrc.json` configure [oxlint](https://oxc.rs) and
oxfmt, which are replacing Biome:

```sh
bun run lint:ox
bun run format:ox:check
```

Both are **green and held there by the suite** — `oxc-clean.test.ts` runs each
one over the repo and fails on anything either reports, so a finding reaches you
through `bun run test` whether or not you ran the tools yourself. Neither script
writes: reformat with `bunx oxfmt .`.

Neither runs in CI yet, and the CI `lint` step is still Biome's — which is red on
formatting until the cutover. That is the next ticket's, not something to work
around here.

Two rules are narrowed in `.oxlintrc.json`, each with the reason beside it. If
you need a third, the bar is that the rule is wrong about *this* codebase, and
the comment is part of the change: a guard fails on a narrowing with no reason.
A single deliberate exception is an `// oxlint-disable-next-line <rule> -- why`
at the site instead.

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
