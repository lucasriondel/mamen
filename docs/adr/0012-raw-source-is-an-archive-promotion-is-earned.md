# ADR 0012 — The raw source row is an archive; a column is earned by a matcher

**Status**: accepted
**Supersedes**: nothing. **Amends**: the CSV import path described in
[`packages/web/docs/adr/0001-client-side-csv-parsing.md`](../../packages/web/docs/adr/0001-client-side-csv-parsing.md).

## Context

The Green-Got CSV delivers thirteen columns. The parser maps four of them (then
`green-got.ts:31-50`; since issue #182 the same mapping is the Green-Got
**Statement Format** record in `parsers/formats.ts`): `Date`, `Montant` +
`Direction` folded into a signed `amount`, and `Intitulé` into
`rawIssuerString`. `Statut` is read as a filter.
The other eight — `N° transaction`, `Arrondi`, `Devise`, `IBAN du compte`,
`IBAN du tiers`, `Moyen de paiement`, `Catégorie`, `Référence` — are dropped on
the floor and are unrecoverable without the original file.

`IBAN du tiers` is the column that forced the question. It is populated on
exactly the SEPA and direct-debit rows, and on a real statement the same IBAN
appears on both a credit and a debit — it identifies the user's *own other
account*. That is materially useful, and it had been discarded on every import
to date.

The generalisable failure is not "we missed one column". It is that **an
importer cannot know at import time which column will turn out to matter.**
Deciding usefulness at import is a guess, and a wrong guess is only discoverable
later, when the data needed to fix it is gone. Recovering it means re-importing
every statement — which, given that this app has no dedup (below), is itself
unsafe.

## Decision

### 1. Keep the whole original row, verbatim, as `rawSource`

Every CSV-imported transaction carries `rawSource`: a JSON object mapping the
row's own column names to their string values, stored on the transaction and
returned with it. Every key is kept, **including the ones already mapped** to
real fields.

This makes mapped-ness a **rendering** decision rather than an **import**
decision. A future "actually, we want `Moyen de paiement`" becomes a display
change against data already in the database, not a migration plus a re-import.
That is the entire point: the archive converts an irreversible loss into a
reversible one.

Keys stay in the provider's own words — `Intitulé`, not `label`. Translating
them would reintroduce exactly the import-time interpretation the archive exists
to avoid, and the bank's own header *is* the accurate provenance.

The storage shape follows `anomalyFlags`, the existing precedent on this table:
a `TEXT` column holding JSON, `null` when absent, with the codec doing the
parse (`repository.ts:73`).

`rawSource` means **as most recently delivered**. A re-import replaces it rather
than preserving the first delivery: an archive of a superseded row is a museum
piece, and the useful question is always what the bank says about this row now.

### 2. `rawSource` is an archive. Nothing derives from it.

It is not a second source of truth. No derivation reads it, no matcher queries
it, no total counts it. It renders on the transaction detail page as an
open-ended key/value list, labelled as the bank's own words.

That label is load-bearing for one column in particular. Green-Got ships its own
`Catégorie` (`INCOME`, `CLOTHING_BEAUTY`, `OTHER`), which will sometimes
disagree with mamen's **Derived category**. Presented as a bare "Category" field
it would read as a contradiction or a bug; presented under the bank's name it
reads as provenance, which is what it is.

### 3. A value is promoted to a real column when a matcher needs to reach it

`counterpartyIban` is promoted out of the archive into a real nullable column,
normalised upper-case and space-stripped to match `accounts.iban` (migration
0029). `rawSource` keeps the raw delivered form. The column and the archive
deliberately disagree, and that is the division of labour: **the column is for
matching, the archive is for provenance.**

The criterion for promotion is narrow and mechanical: *a matcher cannot reach
inside an opaque JSON bin sensibly.* Anything that only ever needs to be *looked
at* stays in the archive. This keeps the column list from re-accreting all
thirteen fields under the excuse that each might be handy.

A promoted value is **shape-checked at the import edge**, and one that fails the
check is simply not promoted — it stays in the archive with everything else.
Banks write prose in `IBAN du tiers` (a dash, a masked card number, "not
communicated"), and a matching column that holds a string which could not be an
account number holds something only a second junk value could ever equal. The
check is the account field's own (`isPlausibleIban`): shape only, never a
per-country length table or the mod-97 checksum, so a statement from a bank
mamen has never seen still imports. Nothing is lost by refusing, because the
delivered value is archived either way — the archive is what makes a strict
promotion edge affordable.

`counterpartyIban` clears that bar because it joins against `accounts.iban` to
mark an **IBAN-confirmed candidate**: a **transfer candidate** where one leg's
counterparty IBAN is the other leg's account, so the bank itself says where the
money went. Consistent with
[ADR 0010](./0010-transfer-suggestions-are-live-refusals-are-stored.md), the
mark is derived with the candidate on every read and never stored.

The mark **labels and never reorders**. Candidates stay ordered by closest date;
a hidden sort key would make the list's order unexplainable, and the mark
already draws the eye without moving the row.

An IBAN match never creates a **transfer group** on its own. It proves
counterparty identity, not that the legs sum to zero — the invariant that makes
a group safe to net out of the recap — so it confirms a pairing the user still
accepts by hand.

### 4. `N° transaction` stays in the archive. Import remains non-idempotent.

The provider's stable transaction id is archived like every other unmapped
column, and is **not** promoted to an `externalId` column. Import continues to
have no dedup: commit is a `bulkCreate` with no delete (`commit.ts:36-45`) and
the table carries no uniqueness constraint, so importing June twice inserts June
twice.

This is the uncomfortable half of the decision and it is deliberate. Promotion
is earned by a matcher, and no matcher reads this id today — adding the column
now would mean shipping a key whose only purpose is a dedup behaviour that does
not exist, and whose real design question ("on collision: skip, replace, or
raise `potential-duplicate`?") is unanswered. Dedup is real work with real
domain decisions, not a column.

The cost is understood: because the id is archived rather than indexed, a future
dedup implementation can read it off existing rows, but only for rows imported
after this change.

## Consequences

- **Un-dropping a column is now cheap.** Any of the eight ignored columns can be
  surfaced, or promoted, against data already stored — no re-import.
- **`rawSource` rides the public contract.** It lands on `Transaction`, so it is
  returned on list responses too, not only on detail. Forking a detail-only read
  model would be the first such split in this contract, a large structural
  precedent for a few hundred bytes a row. If list payloads ever hurt, the fix
  is a projection parameter on the list endpoint, not a second entity.
- **The detail page renders data it has no schema for**, iterating unknown keys.
  This is the first component in the app to do so.
- **Rows imported before this change have `rawSource` null**, permanently. There
  is no backfill, because backfilling is the re-import this ADR is partly about
  making safe.
- ~~**PDF-extracted rows have no `rawSource`.**~~ **Superseded by issue #189
  (PRD #180).** This was written when `ExtractedTransaction` was
  `{date, amount, rawIssuerString}` and the reason given was that there is no
  original row to keep. **Statement Formats** made that premise false: since
  issue #185 the model is told which columns the statement carries, and since
  #189 it returns each operation's own cells beside the parsed fields, keyed by
  those columns and written as the statement printed them. A returned table is
  row-shaped, and a row is what an archive keeps — so a PDF row now carries one,
  under the same rules as a CSV row's. The divergence from issue #175's stated
  scope was raised on that issue rather than landed silently.

  Nothing else in this ADR moves. The archive is still an archive on that path:
  nothing derives from it, the model reports the cells and never a conclusion
  about them, and a row with nothing to keep carries `rawSource` **absent**
  rather than `{}` — the endpoint folds that, so the detail page shows nothing
  instead of an empty block. The other provenance question a PDF row raises
  (which model, what confidence) is still a different one and is still not
  answered here.
- **Re-import still doubles rows.** Accepted, and now written down rather than
  merely true.
- **The archive will drift from the columns.** As values are promoted, the same
  datum exists twice in different forms. Intended, and the reason `rawSource` is
  documented as an archive rather than as data.
