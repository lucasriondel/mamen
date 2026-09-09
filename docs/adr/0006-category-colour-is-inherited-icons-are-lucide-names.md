# Category colour is inherited, icons are Lucide names

A **Category** stops carrying a copy of its parent's colour and starts carrying
either its own colour or nothing. `color` becomes nullable: `null` means
*inherit*, and the colour actually painted is found by walking `parentId`
upwards to the first non-null ancestor. A category's `icon` stops holding an
emoji and starts holding a **Lucide icon name** in kebab-case (`shopping-cart`),
resolved to a component at render time.

Together these are what make icon and colour *editable* rather than seeded: a
folder recolour propagates to every leaf that never opted out, and an icon can be
chosen from ~1,600 candidates instead of typed as an emoji nobody can search.

## Inheritance beats copying

The seed (`0010_seed_categories.ts`) wrote each folder's colour onto every leaf
beneath it, so a leaf's colour was a *copy*, identical to its parent's but with
no link back. That is invisible while nothing edits colour, and wrong the moment
something does: recolouring *Food* would leave *Groceries*, *Restaurants* and
*Cafés* on the old red, and the tree would have to be walked and rewritten to
fake the propagation. Storing `null` for "I never chose" makes the default a
*reference* instead of a snapshot — one write recolours a subtree, and a leaf
that genuinely wants its own colour stores one and stops inheriting.

The walk terminates at the root. A root with `null` falls back to a constant
neutral rather than looping or rendering colourless, so the resolver is total for
every tree shape including a detached node.

## The emoji column is rewritten, not tagged

`icon` keeps its column and its `Schema.String` type; the migration rewrites all
25 seeded rows from emoji to Lucide names in place. The string's *interpretation*
changes globally — there is no tagged `emoji:🍔` / `lucide:hamburger` union and
no second `iconName` column.

This is destructive to any hand-edited emoji, and that is accepted: the tagged
encoding is permanent complexity in every read path to protect data that, in this
database, does not exist. A row whose icon does not resolve renders the
fallback glyph rather than blank, so a bad value degrades instead of breaking.

Names are stored **kebab-case** (`credit-card`), Lucide's canonical id, not the
PascalCase React export (`CreditCard`). The id is what Lucide's own registry,
docs and search index use, so it survives export renames and is what a user would
type. A lookup maps id → component at the render boundary.

## Considered options

**Keep colour copied, propagate on write** was rejected: it makes a folder
recolour an N-row transaction that can partially fail, and it cannot distinguish
"this leaf matched its parent by accident" from "this leaf chose that colour".
Nullable-means-inherit encodes the intent directly.

**A separate `iconName` column** was rejected: two columns for one concept, with
an ordering rule between them, forever — to avoid one migration over 25 rows.

**Iconify / Simple Icons** (~200k icons, includes brand logos) was rejected *for
categories*: a category needs ~30 well-chosen concept icons, and Lucide's 1,600
already exceeds that. Brand logos solve the *issuer* problem, which is
[ADR 0007](./0007-issuer-images-are-normalised-search-is-server-side.md)'s
subject — icons are never assigned directly to an issuer.

## Consequences

- **A migration** nulls every leaf's copied colour (each is identical to its
  parent's, so no information is lost) and rewrites all 25 icons to Lucide names.
- **`Category.color` becomes `Schema.NullOr(Schema.String)`** in the contract,
  and every read site must resolve through the walk rather than reading the field.
  The resolver needs the whole tree, not one row.
- **New categories are created with `color: null`**, fixing a live bug:
  `use-category-mutations.ts` hardcoded `#94a3b8`, so every user-created category
  was grey regardless of where it sat.
- **Icon and colour become editable inline** on the category tree row — a chip
  click opens a picker popover — rather than through the existing rename/move
  dialogs, which stay single-purpose.
