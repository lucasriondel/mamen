# ADR 0013 — The repository publishes how it is built; a document nobody can reach is not kept

**Status**: accepted
**Supersedes**: nothing. **Decides**: the judgement call issue
[#151](https://github.com/lucasriondel/mamen/issues/151) leaves open — whether
the agent tooling and the internal working notes ship when the repository goes
public.

## Context

This repository was written by one person driving agents. `.sandcastle/` is the
orchestration loop that plans, implements, reviews and merges from GitHub
Issues; `.claude/skills/` holds the two procedures a person would otherwise have
to remember (capturing the README's screenshots, reconciling the README against
the landing page); `CLAUDE.md`, `CONTEXT-MAP.md` and the per-package
`CONTEXT.md` files exist so an agent arrives with the domain vocabulary already
loaded. Under `docs/` there are twelve ADRs, three runbooks, three agent-facing
guides, the twenty-one planning documents of the Effect API rework, six research
notes, two live specs and the four published screenshots.

None of that is the app. All of it is how the app got written, and issue #151 is
right that it needs deciding rather than defaulting: publish everything and a
reader wades through scaffolding, publish nothing and a repository whose every
commit carries `Co-Authored-By: Claude` has no explanation of itself.

Two facts narrow the question.

The first is that `CONTRIBUTING.md` already sets honest expectations — no
roadmap, no support promise, one maintainer. A repository that says that and
then hides the loop doing the work is being coy about the only interesting thing
in it. The tooling is not an embarrassment to be tidied away before visitors; it
is the answer to *how does one person maintain five packages*.

The second is that prose has no build. A module nobody imports fails a
typecheck, shows up in coverage, or is deleted by the next person who greps for
it. A document nobody reads does none of those things — it sits there being
indistinguishable, **from the outside**, from a document that is still true. A
visitor cannot tell that `docs/design/categories-proposals.html` was settled in
August and `docs/specs/skippable-import-table.md` is waiting to be built. Both
are markup in a directory.

## Decision

**The repository publishes how it is built.** `.sandcastle/`, `.claude/skills/`,
`CLAUDE.md`, `CONTEXT-MAP.md`, the per-package `CONTEXT.md` files, `scripts/`
and the whole of `docs/` are published as they stand. Nothing is moved to a
private repository, nothing is stripped at publication time, and no document is
rewritten to read as though a person typed it.

**And every tracked document must have a door.** Something else in the
repository has to name it — by path, by filename, or by its directory from
prose. What has no door is not "internal", it is *orphaned*, and an orphan is
deleted rather than published.

The rule is deliberately mechanical, and `publication-readiness.test.ts`
computes it: from the files that are not documents — the root documents, the
manifests, the packages and their tests — follow every name transitively, and
whatever is not reached fails. A directory counts as a door only when a
*markdown* file names it, because a glob in a lint config is not a door: the
mockups below were listed in `.oxfmtrc.json`, cited by the one file whose whole
purpose was to never look at them.

Acted on, this run:

- **`design/` and `docs/design/` are deleted.** Three single-file HTML mockups,
  154 kB, at two competing paths — the root `design/` and `docs/design/`, which
  is itself the tell. Every surface they proposed shipped; each still opens in a
  browser and renders something that looks like mamen and is not, which is the
  worst possible destination for a visitor's first click.
- **`docs/specs/` is given a door** from `CONTEXT-MAP.md`, which now says what
  the directory is for: designed but not yet built, superseded when the issue
  implementing it closes. It was unreachable, and it is the one directory where
  that mattered — its two documents are live.
- **The root manifest's `sandcastle` script is dropped**, and the two flow
  scripts are restored to what `.sandcastle/setup.sh` registers. `bun run
  sandcastle` pointed at `.sandcastle/main.ts`, which has never existed; the
  other two invoked `implement/index.ts` directly, bypassing `run.ts` — the
  wrapper that waits out a Claude session limit and that the tooling's own README
  says every script goes through.

## Consequences

A reader of the public repository sees the agent loop, the skills, and the
working notes that produced the code. That is the intent, and it is only
defensible while `CONTRIBUTING.md` stays honest about there being one maintainer
and no roadmap — a repository that invites contribution *and* publishes an
autonomous merge loop is telling two different stories. If the contributing
guide ever changes, this ADR is the thing to reconsider, and
`publication-readiness.test.ts` asserts the "no roadmap" sentence so that the
change cannot be quiet.

Adding a document now costs one sentence somewhere pointing at it. That is the
price of the rule and it is the point of the rule: the moment of writing a note
is the only moment anybody knows where it belongs.

The rule is about reachability, not about quality. A document with a door may
still be stale — `docs/issues/` and `docs/research/` are the finished record of
a rework that shipped, kept for the reasoning and not the plan. What the rule
buys is that a reader who arrives at one arrives *through* a sentence saying
which kind it is.

Deleting the mockups loses nothing but the files: they are in the history, and
the history survives the bank-statement scrub
([`docs/operations/bank-statement-scrub.md`](../operations/bank-statement-scrub.md)),
which rewrites commits rather than dropping them.
