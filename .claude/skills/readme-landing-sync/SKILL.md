---
name: readme-landing-sync
description: Reconcile the README and the landing page — the commands, the steps and their order, the prerequisites, the environment facts and the images — so that a reader who follows either one gets commands that work. Use when a command, a script, a port, a prerequisite or a screenshot changed, when the two are suspected of having drifted, or before pointing anybody at either document.
---

# Reconciling the README and the landing page

Two documents explain this project to a stranger: `README.md` at the repo root,
and the public page under `packages/landing-page/`. They drift because a change
lands in whichever one the author had open, and the highest-cost drift is a
**command** — a stale one sends a newcomer to a shell that fails.

Two rules decide every edit this pass produces:

- **The README is the source of truth for facts**; the landing page is the
  source of truth for its own form.
- **Facts get copied across, prose never does.** The page renders markup with
  no markdown pass, so syntax carried over reaches the reader literally.

## What must agree

| Surface | On the page | What holds it |
| --- | --- | --- |
| The commands, and the order they are run in | `src/content/install.ts`, each step's `commands` | `src/content/readme-sync.test.ts`, and the diff `bun run landing:reconcile` prints |
| The prerequisites, and the version the repo pins | the same module's `prerequisites` | `src/content/readme-sync.test.ts`, `src/reconcile/facts.test.ts` |
| The dev servers: their names, their URLs, their order | the same module's `servers` | `src/content/readme-sync.test.ts` |
| The environment variables an operator has to decide on | the same module's `environment` | `src/reconcile/facts.test.ts` |
| The images, and the alt text describing them | `src/content/screenshots.ts` | `src/screenshots/sync.test.ts` |

## What may differ

Everything else, and it should. The README carries a stack table, a package
table, a ports table, the demo data and demo stack sections, the checks and the
deploy notes — none of which the landing page has any business restating.

The page may say **less** than the README. It may never say something **else**.
Wording differs on purpose too: the README addresses somebody reading the
repository, the page somebody deciding whether to run it at all.

## Running the pass

```sh
bun run landing:reconcile
```

It extracts every command each document tells a reader to run — fenced blocks
*and* the ones named in a sentence — diffs the install path they share as text,
and checks that every script either of them names still exists. Both sides go
through one extraction (`src/reconcile/commands.ts`), which is what makes the
comparison a comparison rather than two readings; the suite
`src/reconcile/commands.test.ts` runs the same functions, so the pass you run by
hand cannot pass while CI would fail.

Then run the rest, which is the half a diff cannot see:

```sh
bun run test
```

**Compare mechanically, not by eye.** Two documents read side by side agree
right up until the flag on line three. If you find yourself scrolling between
two windows, you are doing the part that should have been a test.

## When the two disagree

Three possibilities, and they are in the order to check them:

1. **The code moved, and both documents are stale.** They can agree with each
   other perfectly and neither with the repo — a renamed script, a version bump,
   a variable that grew a default. **Check the code first.** `bun run
   landing:reconcile` catches the renamed-script form of this; the rest is
   `src/reconcile/facts.test.ts`, which reads the facts out of the files that
   decide them: `package.json` for the pinned Bun version,
   `packages/api/src/config.ts` for what the environment does,
   `packages/shared/src/ports.ts` for the ports.
2. **The page is stale.** The usual case — nobody re-reads the landing page
   while changing a port.
3. **The README is stale.** Rarer, and the one worth being sure about.

**Never edit the correct document to match the stale one.** If which is which is
not obvious in ten seconds, go and read the code; both documents are downstream
of it.

The pass in issue #150 turned up case 1: both documents said the `claude` CLI is
what PDF import needs, which was true when it was the only way to read a
statement and stale as soon as the AI catalogue
(`packages/shared/src/contract/ai.ts`) grew hosted providers that need no CLI.
Neither document was wrong about the other. Both were edited to say *the default
provider's* CLI, and a test now reads the catalogue rather than trusting either.

## Rules the page's words obey

- **No markdown, ever.** Nothing renders the content modules — no markdown pass,
  no entities — so a backticked command reaches the reader with its backticks
  and an asterisk meant as emphasis reaches them as an asterisk. Copy the fact,
  rewrite the sentence. `src/content/prose.test.ts` is that rule, walked over
  every string in the structure.
- **A command lives in its step's `commands`**, never inside a sentence: there
  it renders as a block a reader can copy, and it is the field the diff reads.
- **Numbers are imported, not written.** The ports come from
  `packages/shared/src/ports.ts` and the app's prefix from its constant, so a
  page telling a reader where to look cannot outlive the move.
- **Words live in `src/content/`**, never in a renderer — `src/copy.test.ts`
  fails on a package file that restates a sentence.

## Generated files — never hand-edited

- `packages/landing-page/src/content/screenshots.gen.ts` — the page's only
  knowledge of the images. Written by `bun run landing:screenshots`;
  `src/screenshots/sync.test.ts` renders it again from the source images and
  fails on any difference, so an edit here is a red run, not a fix.
- `packages/landing-page/public/screenshots/` — copies of the README's frames,
  rewritten wholesale by the same command. The originals live in
  `docs/screenshots/` and are captured by
  `.claude/skills/demo-screenshots/SKILL.md`; re-capturing without syncing
  leaves the deployed page showing the previous release.
- `packages/api/openapi.json` — regenerated by the command the README's
  **Checks** section names, and asserted by the API's own test script. The
  README documents it; nothing about it is written by hand.

Changing an image, then, is not this pass: capture, sync, and let the alt text
be the one thing you write — in both documents, word for word, which
`src/screenshots/sync.test.ts` holds.

## Leaving the pass behind

The durable half of this work is the assertions. Anything reconciled by hand
once should leave a test behind, so the next drift fails a run instead of
waiting for someone to think of doing this again:

- a fact **both documents state** → `src/reconcile/facts.test.ts`, read out of
  the file that decides it;
- a fact **the page restates from the README** →
  `src/content/readme-sync.test.ts`;
- a rule about **how the page says things** → `src/content/prose.test.ts`;
- a **command** → nothing to write: the extraction already covers it, provided
  the document presents it as a command rather than describing it.

A reconciliation that ends with two edited files and no new test has fixed today
and scheduled tomorrow.
