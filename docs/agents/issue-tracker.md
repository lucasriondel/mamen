# Issue tracker

This repo has no remote issue tracker. Issues live as markdown files in `docs/issues/`, one file per issue, committed to the repo.

## File format

Filename: `NNNN-short-slug.md` (zero-padded id, stable forever).

```markdown
---
id: 4
title: Inventory the current API surface
state: open            # open | closed
labels: [wayfinder:research]
assignee: none         # none | a name — non-none means claimed
parent: 1              # id of parent issue (e.g. a wayfinder map); omit if top-level
blocked-by: []         # ids of issues that must close first
---

## Question

<the issue body>

## Resolution

<appended when the issue closes — the answer, plus links to any assets>
```

## Wayfinding operations

- **Map**: an issue labelled `wayfinder:map`. Its tickets are issues with `parent: <map id>`.
- **Claim**: set `assignee:` to your name *before* working a ticket. `assignee: none` + `state: open` = unclaimed.
- **Blocking**: `blocked-by: [ids]` in frontmatter. A ticket is unblocked when every listed id has `state: closed`.
- **Frontier query**: open the frontmatter of every `state: open` file with `parent: <map id>` — the frontier is those with `assignee: none` and all `blocked-by` ids closed. Quick scan:
  `grep -l "state: open" docs/issues/*.md | xargs grep -l "assignee: none"` then check each file's `blocked-by` by hand.
- **Resolve**: append a `## Resolution` section (the resolution comment), set `state: closed`, then add one line to the map's *Decisions so far* linking the ticket file.
- **New ticket id**: highest existing id + 1. Create the file first, wire `blocked-by` after (ids exist once files do).
- **Refer by name**: in anything human-facing, cite issues by title with the file linked, never by bare id.
