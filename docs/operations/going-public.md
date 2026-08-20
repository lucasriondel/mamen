# Runbook: making the repository public

The repository is private. Going public is one irreversible act with a pile of
preparation in front of it, and the preparation is most of the value: anything
public may be cloned, forked, cached or indexed within minutes, so *it can
always go private again* is true of the page and not of the content.

**A person runs this, not an agent.** Every step but the last is preparation an
agent may do and report on; the flip in step 6 is a one-way decision about the
maintainer's own data, and it is deliberately the only step no test covers.
`packages/web/src/test/publication-readiness.test.ts` asserts the state of
everything else, including that the command in step 3 carries no `--visibility`.

Order matters twice over, and both places are easy to get backwards:

- **The scrub finishes before the flip**, because a force-push leaves the old
  commits fetchable by SHA until GitHub collects them — and by then a public
  repository has been cloned.
- **Branches are pruned before the rewrite clone** (step 1, not step 5), because
  the rewrite re-bases every branch that existed when you cloned.

## Before you start

- The three tickets this one waits on are closed: [#133](https://github.com/lucasriondel/mamen/issues/133)
  (the history scrub), [#136](https://github.com/lucasriondel/mamen/issues/136)
  (the root scratchpad retired into the issue tracker),
  [#150](https://github.com/lucasriondel/mamen/issues/150) (the README ↔
  landing-page reconciliation).
- The whole suite is green on `main`, and `bun run landing:reconcile` reports no
  drift.
- You have decided about the account, not only the repository. The rewrite
  scrubs the *record*, not the *exposure*: the statement has been readable in
  every clone ever taken. If one went anywhere, rotating the bank account is the
  thing that helps.

## 1. Prune the branches, before anything clones

There are around 160 branches on the remote and 200 locally, nearly all of them
finished work. Whatever survives this step is what the rewrite re-bases and what
a visitor sees in the branch dropdown.

What is merged into `main` and can go:

```sh
git fetch origin --prune
git branch -r --merged origin/main | sed 's#origin/##' | grep -v -E '^\s*(main|HEAD)'
```

Delete each on the remote — the rewrite never sees a branch that is not there:

```sh
gh api repos/lucasriondel/mamen/git/refs/heads/<branch> -X DELETE
```

Then locally:

```sh
git branch --merged main | grep -v -E '^\*|\bmain$' | xargs -r git branch -d
git fetch origin --prune
```

An **unmerged** branch is a decision, not a sweep. `git log --oneline
origin/main..origin/<branch>` says what is on it; keep it or delete it
deliberately. What issue #151 refuses is a branch left pointing at pre-rewrite
history, which is what happens if you skip this step *and* skip the `--all` on
the rewrite's push.

## 2. Run the history scrub, and confirm it from a fresh clone

A real Green-Got export is reachable in roughly 200 commits. The whole operation
is [`docs/operations/bank-statement-scrub.md`](bank-statement-scrub.md) — read
it, it is a sitting of its own — and it ends with a clone taken *after* the
force-push:

```sh
git clone git@github.com:lucasriondel/mamen.git ../mamen-scrub
cd ../mamen-scrub
./scripts/scrub-bank-statements.sh --yes     # rewrites; does not push
```

then, from a clone taken after the push:

```sh
scripts/scrub-bank-statements.sh --verify <N>
```

`<N>` is the commit count the rewrite printed. Every criterion green is the
precondition for everything below; nothing here is publishable while any of them
is red.

## 3. Set the metadata

The description, the homepage and the topics are what a visitor reads before any
code, and they are the one reversible part of publication — set them now so the
repository is not briefly public and blank.

```sh
gh repo edit lucasriondel/mamen \
  --description 'A self-hosted, single-user personal-finance app: import bank statements, curate the rows into issuers and categories, and read back where the money went. The whole state is one SQLite file.' \
  --homepage 'https://mamen.gousse.cool' \
  --add-topic 'personal-finance' \
  --add-topic 'self-hosted' \
  --add-topic 'single-user' \
  --add-topic 'bank-statements' \
  --add-topic 'budgeting' \
  --add-topic 'sqlite' \
  --add-topic 'bun' \
  --add-topic 'effect' \
  --add-topic 'effect-ts' \
  --add-topic 'typescript' \
  --add-topic 'react' \
  --add-topic 'vite' \
  --add-topic 'tanstack' \
  --add-topic 'tailwindcss' \
  --add-topic 'turborepo' \
  --add-topic 'monorepo'
```

The homepage is the landing page, at the host `packages/landing-page/src/topology.ts`
defaults to (`DEFAULT_SITE_HOST`) — not the app, which sits behind Cloudflare
Access at `/app` and would answer a visitor with a login screen.

There is **no `--visibility` in that command**, on purpose. Metadata is
preparation; the flip is step 6.

## 4. Check what a clone actually contains

The repository publishes its agent tooling and its working notes — the decision
and its rule are
[`docs/adr/0013-the-repository-publishes-how-it-is-built.md`](../adr/0013-the-repository-publishes-how-it-is-built.md).
What it must not publish is generated output, scratch notes, or tooling that
points at nothing.

`publication-readiness.test.ts` holds all three against the index on every test
run, which is earlier and cheaper than a clone. Do it against a real clone once
anyway, because the index is an argument about a clone and this is the clone:

```sh
git clone git@github.com:lucasriondel/mamen.git /tmp/mamen-public
cd /tmp/mamen-public
git ls-files | grep -E '^(node_modules|dist|logs|graphify-out|uploads)/|\.db$|\.tsbuildinfo$'
git ls-files '*.html' | grep -v '^packages/'
```

Both expect no output.

## 5. Run CI's checks in that clone, from the README alone

The question is not whether CI passes on the maintainer's machine. It is whether
a stranger who reads the README and types what it says gets a green tree. So use
the clone from step 4, install nothing else, and follow
[`README.md`](../../README.md):

```sh
cd /tmp/mamen-public
bun install
bun run lint
bun run format:check
bun run typecheck
bun run test
```

Those are the four steps `.github/workflows/ci.yml` runs, in the same order and
with nothing before them but `bun install`. If a step needs something the README
does not mention, the README is what to fix — the failure is the point of doing
this in a clone.

## 6. Flip it

Last, and by hand.

```sh
gh repo edit lucasriondel/mamen --visibility public --accept-visibility-change-consequences
```

## 7. Afterwards

- **Look at what else just became world-readable.** The Actions logs of every
  past run, and any issue or pull-request body quoting a real statement row.
  Neither is covered by the history scrub.
- **The old commits are unreachable, not absent.** They stay fetchable by SHA
  until GitHub garbage-collects; Support can purge them on request, and that is
  worth doing before rather than after.
- **Tell anyone holding a clone.** A `git pull` into a pre-rewrite clone merges
  the old history back in, statement and all — which is how a scrub gets undone.
