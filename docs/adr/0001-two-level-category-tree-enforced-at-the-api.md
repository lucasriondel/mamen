# Two-level category tree, enforced at the API

Categories are a strict two-level tree — assignable **leaves** grouped under
non-assignable **folders** — and the API rejects any write that would break that
shape, rather than leaving the rule to the UI. `parentId` permits any depth, so
without this the invariant is only a convention.

We enforce it at the API because violations are **silently wrong, not loudly
wrong**, and the UI is not the only writer. The category page totals a folder as
the sum of its children. A category at depth 3 hangs transactions off a node the
rollup never visits; transactions assigned directly to a folder hang off a node
the rollup visits but does not count. Both make the total quietly understate the
truth, with no error and nothing odd on screen — the failure a user can only
catch by adding it up by hand. Seed scripts, imports, and any future
auto-categoriser bypass the picker entirely, and "create Organic under Groceries"
is a reasonable-looking payload that breaks the totals.

## Considered options

**UI-only enforcement** was the initial recommendation, on the theory that a
picker listing only leaves cannot express a bad payload. It was rejected once we
worked the examples: it holds only while the UI is the sole writer, which the
same session had already established it is not. The argument that folder
assignment fails *visibly* (and so could stay UI-only) turned out to be wrong —
under folder-as-container it is exactly as silent as the depth-3 case.

## Consequences

- The contract gains failure variants on `categories.create` / `bulkCreate` /
  `update`, reversing the deliberate no-`Conflict` stance documented in
  `packages/shared/src/contract/categories.ts` — that comment reasoned from slug
  uniqueness and did not anticipate a shape invariant.
- Rejecting a folder as `transaction.categoryId` / `issuer.defaultCategoryId`
  reaches beyond `CategoryRepo` into the transactions and issuers groups, which
  the API port had considered finished.
- `TransactionCreate` accepts `categoryId`, so `create` and `bulkCreate` need the
  guard too. The import path never sets a category (`commit.ts` sends
  parser-built records), so this costs nothing there — but a bulk payload that
  *does* carry categories should resolve folders in one query, not one per row.
