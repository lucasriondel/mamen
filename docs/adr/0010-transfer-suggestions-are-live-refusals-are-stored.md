# ADR 0010 — Transfer suggestions stay live; only the user's refusal is stored

**Status**: accepted (issue #91)
**Supersedes**: nothing. **Amends**: the wire shape introduced with PRD #48.

## Context

A **transfer group** nets out of the **recap**, so an unconfirmed internal
transfer inflates both spend and income by the same amount — the recap says the
user spent 500 € they only moved. Confirming these pairs matters, and until now
the only place to do it was the `/transfers` page: a destination the user had to
remember existed and visit deliberately.

Worse, the suggestion list was **unfalsifiable**. Detection pairs any
opposite-sign, equal-magnitude rows in different accounts inside a date window,
so coincidences get suggested — a 50 € grocery debit against an unrelated 50 €
reimbursement — and there was no way to say "these two are not a transfer". Every
read re-derived the same wrong pair, forever, and the noise crowded out the real
transfers.

The original ask was to **compute suggestions at import and store them**, with
validate/revoke actions on the stored rows.

## Decision

### 1. Detection stays live. Only the refusal is stored.

`transferCandidates` remains the existing server-side SQL self-join over the
whole dataset, recomputed on every read. Nothing is materialised at import time
and no candidate is stored. What *is* stored is a **dismissed pair**: a (debit,
credit) pairing the user has explicitly refused, in its own
`transfer_dismissals` table, which the detection query excludes.

This inverts the requested design deliberately. A stored candidate is wrong the
moment either leg is hand-linked, deleted, marked a refund or bundled — so
storage buys a staleness problem, a backfill path for every row predating the
feature, and an import-time coupling. The only thing storage genuinely buys is
**persistent user state**, and that state is the refusal, not the suggestion.
Storing refusals alone delivers the revoke behaviour with no staleness and no
backfill.

If a future requirement genuinely needs materialised candidates (an expensive
scoring model at import time, say), that is a different decision made for a
different reason, and the dismissals table survives it unchanged.

### 2. Dismissals are pair-keyed, not leg-keyed.

The primary key is `(debitId, creditId)`. A leg-keyed "this row is never a
transfer" flag is too blunt: one salary credit can legitimately pair with a real
transfer *and* with a coincidence, and refusing the coincidence must not silently
refuse the transfer. A row-level "never a transfer" flag is a separate feature
and is out of scope.

The composite key doubles as the idempotence guarantee — `INSERT OR IGNORE`
makes re-dismissing a stored pair a no-op, which matters because two panels can
legitimately display the same pair.

**No foreign keys**, consistent with every other row reference in this schema
(`transferGroupId`, `bundleId`, `linkedRefundId`) and with the fact that the app
never enables `PRAGMA foreign_keys` — a declared `ON DELETE CASCADE` would be
inert decoration. The cascade is real but explicit: it runs in the shared
post-delete cleanup every delete path already goes through, beside the
transfer-group and bundle cleanups. Left behind, a dismissal would suppress a
pairing between two rows that no longer exist, and would suppress the wrong one
entirely once sqlite reused the id.

### 3. `TransferCandidate` collapses to the grouped shape.

It was a flat pair (`from`, `to`, `daysApart`), one entry per pair. It is now a
debit `leg` plus its `counterparts` (each a transaction + `daysApart`),
closest-date first.

A debit matching three credits read as three near-identical rows, when it is
**one decision**: the user picks at most one, and picking one settles the other
two. The flat type is **retired**, not kept alongside — it had one consumer, both
surfaces now render the grouped form, and deriving the grouping client-side in
two places is duplication that drifts. The internal SQL row projection keeps its
flat shape; only the wire type changed, and the fold from pair rows to groups is
a pass over an ordered result set, not something SQL is asked to shape.

### 4. The payload stays debit-oriented; the client indexes it both ways.

`leg` is always the debit, which is what stops one real pair surfacing as both
A→B and B→A. Credit rows still need an indicator — a savings account is a list of
incoming transfers, and a blank one would be useless — so the client builds a
**two-way index** from the same payload: leg id → its credits, and counterpart id
→ the debits it is a candidate for.

Returning a group per row in both directions was rejected: it doubles the payload
and re-introduces the duplicate-pair problem the sign orientation exists to
solve.

### 5. Confirm is per-pair; dismiss is group-level. The UI states the asymmetry.

- **Confirm** is per counterpart. There is no bulk confirm: a leg belongs to at
  most one transfer group, so "confirm all" is incoherent.
- **Dismiss** is ONE action per panel, at its foot, writing a dismissal for every
  pair the panel displayed — and nothing else.

Per-counterpart dismiss buttons with group-wide effect were explicitly rejected:
a button's placement must not lie about its blast radius.

The **scope rule**: dismissal removes exactly the pairs shown in the panel the
user is standing in. Dismissing from a credit's panel clears that credit's pairs
with each listed debit; those debits' pairs with *other* credits survive. The
client therefore sends the **exact pairs it displayed**, normalised debit-first —
expanding a "group" server-side from one leg id would let the server's idea of the
group differ from what was on screen if the data moved between read and write.

### 6. One cache entry serves every surface.

The grouped list is fetched once for the whole dataset and shared by the
transactions table, the Transfers page and the transaction detail page. The table
looks each visible row up in the two-way index; panels open with no request.

Per-page filter params and an id-only summary endpoint were both considered and
rejected for now: the shared-cache win across three surfaces outweighs payload
size at the expected scale. If the candidate count grows into the thousands, the
lightweight-summary option remains open.

### 7. The client-side counterpart scan is retired.

The detail page ran its own scan over whatever rows it happened to have loaded —
a second source of truth for a question the server already decides, and the
weaker one: it could not see outside its window and knew nothing about dismissed
pairs. It now reads the shared cache; `suggestTransferCounterparts` and its unit
tests are deleted rather than left as a tempting second answer.

## Consequences

- Detection cost is paid on every read. It is one indexed self-join over a
  personal-finance dataset; if that ever stops being true, the summary-endpoint
  option above is the lever, not materialisation.
- **Dismissal is permanent.** There is no undismiss, no dismissed-pairs view, no
  recovery. A user who dismisses an ambiguous group loses the correct pair inside
  it. The group-level-only button mitigates this by being honest about scope, and
  the copy says "there's no undo yet" rather than implying a tidy-up — but the
  risk is real, and undismissing is the first thing to add if it bites. The
  endpoint's array body keeps that additive.
- Confirming needs no cleanup of superseded candidates: stamping both legs with a
  group id makes them ineligible, so the debit's other pairs vanish from the next
  read on their own.
- A pair can be dismissed and later become impossible anyway (a leg is deleted,
  bundled, linked elsewhere). The dismissal row is then dead weight until one of
  its legs is deleted. Accepted: it is two integers.
