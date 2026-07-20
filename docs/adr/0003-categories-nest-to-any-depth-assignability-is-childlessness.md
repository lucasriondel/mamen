# Categories nest to any depth; assignability is childlessness

Supersedes [ADR 0001](./0001-two-level-category-tree-enforced-at-the-api.md).

Categories nest to **any depth**, and a Category is assignable **iff it has no
children** — not because of where it sits. The tree is deliberately **ragged**:
*Food > Groceries* stays two deep while *Life > Subscriptions > Streaming
services* goes three. Root-ness and depth both stop being load-bearing; the only
question ever asked of a node is whether anything hangs beneath it.

ADR 0001 capped the tree at two levels because the folder rollup was a single
hop — `filter(c => c.parentId === parent.id)`. The cap and the rollup were the
same fact, so a node at depth 3 hung transactions off somewhere the rollup never
visited and the total silently understated. That reasoning was sound and is now
obsolete: the rollup is a real recursive descent, so depth 4 is no more dangerous
than depth 3, and a numeric cap would buy nothing while costing a depth
computation the schema cannot do in one hop.

## What we keep from ADR 0001

**Enforcement stays at the API, not the UI.** Every failure here is silently
wrong rather than loudly wrong, and the UI is not the only writer — seeds,
imports, and any future auto-categoriser bypass the picker entirely. That is the
part of ADR 0001 that survives its own reversal intact.

## Considered options

**Strict depth-3** — only depth-3 nodes assignable — was rejected because the
seeded tree is two deep. Every existing leaf would have become non-assignable at
once, so it demanded either a migration inventing a filler level (*Food > Food >
Groceries*) or exactly the ragged depth it claimed to avoid. Strict depth is
ragged depth wearing a hat.

**Assignable mid-tier nodes** — *Subscriptions* holding both transactions and
children — was rejected because it reintroduces the double-count ADR 0001 named:
a rollup that visits a node *and* counts its own rows must not count it twice, and
"folder total = sum of children" stops being true.

**A depth cap (3, or any N)** was rejected as pure cost. Depth is not derivable in
one hop, so enforcing a limit needs a recursive CTE, a stored `depth` column, or
a materialized path — bought for a rule with no rationale behind it. The
practical ceiling is the UI's readability, not the invariant. The cap's absence
does force a **cycle guard** on re-parent (walk up from the new parent, refuse on
hitting the moved node); that is unavoidable in any re-parenting tree and cheaper
than the alternative.

## Consequences

- **`assertLeaf`'s test inverts.** It tested `parentId === null` — *"not a root"*
  as a proxy for *"is a leaf"*. That proxy holds only in a two-level world: a
  mid-tier node has a non-null `parentId` and would **silently pass as
  assignable**. The real test is a child-count probe
  (`SELECT 1 FROM categories WHERE parentId = ? LIMIT 1`), which rides the
  existing `idx_categories_parentId`. This is the single most dangerous latent
  bug in the change, and the reason a future reader must not "simplify" the probe
  back into a null-check that looks equivalent and is not.

- **A node's kind is now mutable.** Adding a child turns a leaf into a folder.
  That transformation is **refused while the node holds money** — the guard
  counts transactions *and* issuers holding it as a default, since a derived
  category hangs history off a node invisibly. The UI answers the refusal by
  offering to spill those transactions into a new leaf in one gesture, so the
  rule stays loud without being hostile.

- **Contract churn.** `CategoryNotLeaf` keeps its name and inverts its meaning
  ("you passed a node with children", not "you passed a root").
  `CategoryParentNotFolder` **dies** — any node may be a parent.
  `CategoryHasChildren` is repurposed into the money-holding guard above. The
  cycle guard needs a new variant.

- **The rollup stays client-side and is written exactly once.** The client
  already holds the whole tree and the transactions `count` endpoint already
  accepts a **set** of ids (ADR 0002) — it was built for this. A recursive
  descent over a few hundred in-memory categories is free, and a `CASE` in a
  `WHERE` already cannot use an index, so a wider `IN` set does not change the
  complexity class. The hazard is duplication: the one-hop expansion existed in
  five places, and a missed copy is silently wrong in one surface only. One
  shared module, five callers.

- **Structure and filing are different gestures.** The transactions picker does
  not nest — it files a receipt. Nesting, re-parenting, and spill live on the
  categories page, mirroring the split already drawn between setting an **Issuer
  default category** and overriding one transaction.

- **A category still reads as its leaf name alone** in a table cell; folders
  remain navigation, not identity. Depth adds navigation, not identity, so the
  rule strengthens rather than weakens. If users start hand-disambiguating leaf
  names ("Tesla connect"), that is the signal to show the immediate parent on
  collision — a pure render change, no schema, no contract.
