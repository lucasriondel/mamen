# Runbook: scrubbing the bank statement out of published history

A real Green-Got export — live IBANs, counterparty names, amounts and payment
references — is reachable in this repository's history, at the repo root and at
the import fixture's path, along with a dev SQLite write-ahead log carrying the
same transactions. Issue #108 removed all of it from the *working tree* and
wrote the rewrite; issue #133 is running the rewrite against `origin`.

`scripts/scrub-bank-statements.sh` does the mechanical part and refuses to
push. This file is the rest of the day: what has to be true before it runs,
what to read in its output, and what is not finished when the push returns.

**A person runs this, not an agent.** The rewrite is irreversible, it rewrites
the default branch, and every clone in existence stops sharing history with
origin the moment it lands.

## Before you start

- **`git-filter-repo` on `PATH`** — `pip install git-filter-repo` or
  `brew install git-filter-repo`. The script checks and stops if it is missing.
- **No open pull requests.** A rewrite orphans one: its head commit stops
  existing and the PR can never merge. Check the list in the GitHub UI; a
  fine-grained token may not be able to read `repository.pullRequests` from the
  CLI, in which case the UI is the only answer available.
- **The owner's explicit go-ahead.** It is their data and the operation is
  one-way.
- **A decision about the account itself.** The rewrite scrubs the *record*, not
  the *exposure*. The repository has been private throughout, but the statement
  has been readable in every clone ever taken of it. If a clone went anywhere,
  rotating the account is the thing that helps; the rewrite is not.

## 1. Prune the branches you do not want, first

Order matters here. `git push --force origin --all` re-bases every branch the
rewrite produced, and the rewrite produces one for every branch that existed
when you cloned — 164 of them at the time of writing, mostly finished work.
Deleting a branch *after* the push means rewriting it and then throwing the
result away; deleting it on the remote *before* you clone means it never enters
the rewrite at all.

So decide now, and delete on the remote:

```sh
gh api repos/lucasriondel/mamen/git/refs/heads/<branch> -X DELETE
```

Whatever is left is what the scrub re-bases. Issue #133 accepts either — every
branch re-based, or pruned — and what it rejects is a branch left pointing at
the old history, which is what happens if you skip this step *and* skip the
`--all` on the push.

## 2. Clone fresh and rewrite

```sh
git clone git@github.com:lucasriondel/mamen.git ../mamen-scrub
cd ../mamen-scrub
./scripts/scrub-bank-statements.sh --yes
```

The script refuses to run in a working checkout — dirty tree, a stash, a second
worktree, `node_modules/`, or a HEAD that has moved more than once — because
a throwaway clone is the only thing it is safe to be wrong in.

It rewrites, then holds the result to two things a clone taken afterwards can
no longer check, since a clone has no memory of what it used to be:

- **the commit count is not shorter than it was.** History rewritten, not
  squashed. The run prints `Rewrote N commits into N`; keep that number, it is
  the argument to `--verify` in step 4.
- **no branch was lost.** Every name that existed before the rewrite, local or
  only tracked, exists after it.

If either fails, nothing has been pushed and this clone is not the one to push.
Delete it, clone again, and work out what happened first.

## 3. Push

The script prints these; it does not run them. `filter-repo` deletes the
`origin` remote precisely so that a rewrite cannot be pushed by reflex.

```sh
git remote add origin git@github.com:lucasriondel/mamen.git
git push --force origin --all
git push --force origin --tags
```

If `main` is protected, the push is rejected — lift the protection for the
duration and put it back.

## 4. Verify from a clone taken after the push

Not from the clone you rewrote in. The question is what `origin` now serves.

```sh
git clone git@github.com:lucasriondel/mamen.git /tmp/mamen-check
/tmp/mamen-check/scripts/scrub-bank-statements.sh --verify <N>
cd /tmp/mamen-check && bun install && bun run --filter @mamen/web test formats
```

`--verify` checks the criteria against every ref the clone has, which includes
the ~164 branches it holds as `refs/remotes/origin/*` — that is how a branch
left behind on the old history shows up. `<N>` is the count from step 2.

The format test is the last criterion and the script cannot run it: the fixture
has to still be a file the Green-Got **Statement Format** can be applied to, not
merely a path that survived. The script checks the columns and that there are
rows under them; `parsers/formats.test.ts` is what settles it. (It was
`green-got.test.ts` until issue #182 — the commits *behind* the rewrite still
carry that name, which is why the note below keeps it.)

Every line green is the ticket.

## 5. Afterwards

- **Tell anyone holding a clone.** Their history no longer matches origin.
  `git fetch && git rebase --onto origin/main <old-base> <branch>` for work in
  flight; for anything else, re-clone. A `git pull` into an old clone merges the
  old history back in, statement and all — that is how a scrub gets undone.
- **GitHub keeps the old commits for a while.** A force-push makes them
  unreachable, not absent: they stay fetchable *by SHA* until GitHub garbage
  collects, and any view that cached one may still render it. If the leak needs
  to be gone rather than unreferenced, GitHub Support can purge it on request —
  worth doing before the repository goes public.
- **There are no forks** (checked: 0). A fork would keep its own copy of every
  object and no rewrite here would reach it.
- **Close the issues.** #133 is the execution. #108 was closed before the
  rewrite ever ran, which is what left this open for months — say so on it, and
  close it against this work rather than silently.

## What the rewrite costs, and why it is the right cost

About 200 commits keep `green-got.test.ts` while losing the fixture it reads,
so that one test file fails to collect if you check them out. `filter-repo`
could substitute the synthetic CSV into those commits instead and leave them
collectable, but the test at those commits asserts against the *old* rows and
would fail one line further down anyway — and substituting would write the
record as though the fixture had always been synthetic, which is not what
happened. Deleting says a file was here and it was removed.
