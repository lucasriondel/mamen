# Spec: give `derivedCategory` an alias-parameterized generator

Status: ready-for-agent
Origin: architecture review 2026-08-18, card 3 — retargeted after grilling.
Supersedes: card 3's `row-codec.ts` extraction, which is NOT part of this spec.

## Why

ADR 0008 (`docs/adr/0008-recap-exclusion-is-derived-through-the-issuer.md`) prescribes
one shared SQL fragment per derived field, reused everywhere, never hand-copied. It names
`derivedCategory` explicitly: `manualExcluded` stands to `excludedFromRecap` exactly as
`manualCategory` stands to `categoryId`.

`recapExclusion` obeys this — it has `recapExclusionFor(row, issuer)` at repository.ts:482.
`derivedCategory` does not. It is alias-locked to `t`/`i` at repository.ts:462, so every
query needing different aliases restates the CASE by hand.

Three hand-written copies exist today. All three are semantically identical to the canonical
fragment right now — **this is a drift-prevention change, not a bug fix**. No user-visible
defect. The value is that a future edit to the category-derivation rule currently has to be
made in four places, with only a comment to say so.

## Scope

In scope: `derivedCategory` and the one `isNotBundleMember` copy at L944.
Out of scope: the 25-column row codec, `TransferCandidateRow` (49 fields), `legFromRow`
(24 picks), `readColumns`/`candidateColumns` restructuring. Leave all of them alone.

## Changes

1. `packages/api/src/transactions/repository.ts:462` — add `derivedCategoryFor(row, issuer)`
   returning the fragment with the given aliases. Mirror the existing `recapExclusionFor`
   at L482 exactly: same shape, `sql.literal()` for the aliases. Keep `derivedCategory`
   as `derivedCategoryFor("t", "i")` so the 6 existing shared call sites
   (L519, L523, L657, L690, L758, L871) need no edit.

2. `repository.ts:975` (`suggestTransfersQuery`) — replace the hand-written CASE with
   `derivedCategoryFor("c", "ci")`.

3. `repository.ts:1013` (`candidateColumns`) — replace the inlined CASE with
   `derivedCategoryFor(a, issuerAlias)`. Note this function already calls
   `recapExclusionFor` on the line above; this makes the two consistent.

4. `repository.ts:944` (`transferEligibleFor`) — replace `${sql.literal(a)}.bundleId IS NULL`
   with the shared `isNotBundleMember` fragment, parameterized the same way if it needs an
   alias parameter added. If parameterizing `isNotBundleMember` turns out to require changing
   `recap-predicate.ts:56` and its 4 call sites, STOP and report — that is a scope decision,
   not an implementation detail.

## Test

Add ONE test to `packages/api/src/transactions/repository.test.ts` (4189 lines, existing suite).

Assert the same transaction resolves to the same derived category through all three read paths:
the list read, the transfer-candidate read, and the transfer suggestion. Use a transaction with
`manualCategory = 1` and a `categoryId` that DIFFERS from its issuer's `defaultCategoryId` — this
is the only input where the CASE branches matter, so a divergent copy would fail it.

A test that only checks the generator is called is not acceptable; it tests the refactor, not the rule.

## Verification

- No behavior change. The full existing suite must pass unmodified.
- Grep after the change: `manualCategory` must appear in exactly one CASE expression.
