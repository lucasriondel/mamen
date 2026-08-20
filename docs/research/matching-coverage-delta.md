# Matching module: coverage delta and bug gate

Gate asset for [#159](https://github.com/lucasriondel/mamen/issues/159) — "Report the
coverage delta and gate on any bug the matrix found". Decides whether the work
downstream of [#158](https://github.com/lucasriondel/mamen/issues/158) (the pure
engine matrix) may proceed, and sizes the wiring tests the HTTP-suite retirement
ticket has to keep.

Measured 2026-08-20 on `sandcastle/issue-159` at `4f401ba`. Subject:
`packages/api/src/matching/issuer-matcher.ts` — the whole matching module, which
is one file: the pure engine (lines 1–393) and the `IssuerMatcher` service that
wraps it (394–848).

## Verdict

**The gate is open.** The new matrix contradicts nothing: all 64 cases pass
against the engine as written, and no case was bent to fit it. Nothing downstream
is held.

Coverage did not fall, because nothing was deleted — #158 only added a file. What
the measurement does show is the *prospective* loss, and it is total: the engine
matrix reaches **none** of the 13 service members. Retire the HTTP suites without
replacement and the module goes from 100% to 35.8% of statements, well under the
package's 90/85 gate. The wiring tests to preserve are enumerated below: **30**,
across three files.

## 1. The coverage delta

Runs: `vitest run --coverage --coverage.include='src/matching/**'`, v8 provider,
Node 22.20.0. "Before" is the full suite with `issuer-matcher.test.ts` excluded —
the package as it stood before #158 landed; "after" is the suite as it is now.

| Run | Tests | Statements | Branches | Functions | Lines |
|---|---|---|---|---|---|
| Before (#158 excluded) | 925 | 425/427 — **99.53%** | **95.78%** | 100% | 99.53% |
| After (current) | 989 | 427/427 — **100%** | **98.23%** | 100% | 100% |
| Engine matrix alone | 64 | 153/427 — **35.83%** | (see note) | — | 35.83% |

The module was already near-saturated through the HTTP boundary, so the headline
delta is small: **+2 statements, and four branch arms** (compared by source
location — v8's branch *denominator* shifts between runs, 166 before and 170
after, because it maps arms only inside functions a run actually entered). But
they are the *right* two statements. Everything the HTTP suite had never reached
was in one place:

```
131:   return b.createdAt.getTime() - a.createdAt.getTime();
132: };
```

Tier 3 of `compareSpecificity` — the `createdAt` tie-break — had **never been
executed by any test in the package**. It is exactly the logic #158 called the
thinnest and most likely to be silently wrong: a wrong tie-break raises no error,
it just hands the row to a different issuer. Four branches came with it:

| Line | Branch newly reached |
|---|---|
| 130 | the false arm of `if (la !== lb)` — two rules of equal literal length falling through to `createdAt` |
| 206 | `row.issuerId ?? null` — a manual row carrying **no** issuer |
| 291 | the `: r` arm of the update-branch rule swap — an edit competing against a *sibling*, not only against its own stored self |
| 370 | `if (before === now) continue` — a delete that leaves a row where it was |

Three branches remain uncovered. Two are `??` fallbacks no caller can reach:
`tally`'s `counts.get(id) ?? 0` (line 234) and `toView`'s (line 379) are both fed
maps seeded from the very rule set they are then keyed by, so the fallback arm has
no input that produces it. They are defensive, not untested, and 98.23% is the
branch ceiling unless they are rewritten.

The third is a genuine gap. `deleteLists`' `const before = row.issuerId ?? null`
(line 368) takes its `null` arm for any **non-manual row with no stored issuer** —
an ordinary row in a perfectly consistent table, not an exotic one. Every
`deleteLists` fixture in the matrix hands each non-manual row a stored issuer, so
the "already unmatched, still unmatched" row never reaches the loop. Verified: one
extra case — delete the only rule from a table whose single row matches nothing —
covers it, and the "exhaustive" claim in #158 does not survive it. Worth a
one-line addition to the matrix; not worth holding anything for.

> Note on the engine-alone branch figure. v8 emits branch ranges only for
> functions it actually invoked, so a run that never enters the service class has
> a smaller branch denominator (82) than one that does (170). Its printed 97.56%
> is over the pure section only and is **not** comparable to the other rows. Use
> the statement column, whose denominator (427) is fixed across every run.

## 2. What is covered by accident

Per-member statement coverage, one test file at a time. `✓` = every statement;
a percentage = the declaration executed but the body did not (the service is one
`Effect.gen`, so every member's first line runs whenever the layer is built).

| Member | lines | engine | rules | transactions | accounts | issuers | database | demo |
|---|---|---|---|---|---|---|---|---|
| `derive` (pure) | 193–220 | ✓ | ✓ | ✓ | 75% | 4% | 38% | ✓ |
| `ownedCounts` / `tally` (pure) | 227–251 | ✓ | ✓ | ✓ | ✓ | 14% | 64% | 14% |
| `previewLists` (pure) | 282–345 | ✓ | ✓ | 3% | 3% | 3% | 3% | 3% |
| `deleteLists` (pure) | 352–376 | ✓ | ✓ | 5% | 5% | 5% | 5% | 5% |
| `toView` | 378–379 | 50% | ✓ | ✓ | ✓ | 50% | ✓ | 50% |
| `issuerWrites` | 472–494 | ✗ | ✓ | 92% | ✓ | 8% | 92% | ✗ |
| `recomputeIssuers` | 495–515 | ✗ | ✓ | 80% | ✓ | 20% | 80% | ✗ |
| `ownedCountsNow` | 516–526 | ✗ | ✓ | ✓ | ✓ | 40% | 40% | ✗ |
| `withOwnedCounts` | 527–532 | ✗ | **✓** | 25% | 75% | 25% | 25% | ✗ |
| `withOwnedCount` | 533–544 | ✗ | ✓ | ✓ | ✓ | 50% | 50% | ✗ |
| `matchImported` | 545–592 | ✗ | ✓ | ✓ | ✓ | 4% | 4% | ✗ |
| `preview` | 593–649 | ✗ | **✓** | 3% | 3% | 3% | 3% | ✗ |
| `applyRuleCreate` | 650–677 | ✗ | ✓ | ✓ | ✓ | 5% | ✓ | ✗ |
| `applyRuleUpdate` | 678–713 | ✗ | **✓** | 4% | 4% | 4% | 4% | ✗ |
| `previewDelete` | 714–738 | ✗ | **✓** | 8% | 8% | 8% | 8% | ✗ |
| `applyRuleDelete` | 739–774 | ✗ | **✓** | 6% | 6% | 6% | 6% | ✗ |
| `applyAccountDelete` | 775–801 | ✗ | 5% | 5% | **✓** | 5% | 5% | ✗ |
| `removeManualIssuer` | 802–835 | ✗ | **✓** | 4% | 4% | 4% | 4% | ✗ |

Whole-file totals against the fixed 427-statement denominator: rules 95.3%,
accounts 55.7%, transactions 52.9%, database 36.1%, engine matrix 35.8%, issuers
22.0%, demo-seed 18.0%.

Three findings.

**No wrapper has lost coverage.** #158 deleted nothing, so the before/after delta
for every service member is zero. The ticket's premise — that moving assertions
inward costs the wrappers their incidental coverage — describes the *retirement*
ticket, not this one. The loss is prospective, and this report measures it as
such.

**The prospective loss is total, not partial.** The engine matrix reaches 0% of
all 13 service members. There is no wrapper that "drops sharply" and another that
survives: the pure/effectful split in this file is clean, so the matrix stops
dead at line 393. Retiring the HTTP suites with no replacement takes the module
to the engine matrix's own 35.8% and fails the package gate outright.

**Seven members are single-file covered — bolded above.** `rules/handlers.test.ts`
is the *only* file that fully exercises `preview`, `previewDelete`,
`applyRuleUpdate`, `applyRuleDelete`, `removeManualIssuer` and `withOwnedCounts`;
`accounts/handlers.test.ts` is the only one for `applyAccountDelete`. That is the
"covered only by accident" list the ticket asked for, and it is the reason the
retirement ticket keeps **more** wiring tests than planned. Note that
`removeManualIssuer` is a `transactions` endpoint whose only tests live in the
*rules* wire suite — a retirement scoped by filename would delete them without
anyone noticing which endpoint went dark.

What #158 *did* change here: `previewLists` and `deleteLists` were also
rules-only before, and are now double-covered. Those two are the only members the
matrix took off the single-file list.

## 3. The wiring tests to preserve — 30

Sized off the list above: one test per effect the pure engine cannot state. The
engine matrix already pins every *decision* these paths make, so each of these
asserts only the effect — what was read, what was written, what came back on the
wire, and in how many transactions.

**`matchImported` — 4** (`transactions/handlers.test.ts`)
1. A `bulkCreate` batch lands with each row's issuer set by the winning rule, and the 201 body matches a re-read.
2. A rule-assigned row is written with `manualIssuer = 0` alongside the issuer.
3. An empty batch short-circuits to `[]` — the rules table is never read.
4. A manual row inside the batch keeps its hand-picked issuer (the `assigned` filter issues no write for it).

**`recomputeIssuers` / `issuerWrites` — 3** (`rules/handlers.test.ts`)
5. A rule create moves previously-unmatched rows *in storage* — asserted on a re-read, not on the response body.
6. A row whose winner disappears is written back to `NULL`, not left holding a stale issuer.
7. A manual row survives every recompute untouched (it derives to its own issuer, so no write is produced).

**`applyRuleCreate` — 3**
8. The 201 body's `ownedCount` is the number the recompute settled on, not a second pass.
9. Absent predicates are null-folded on the way in and round-trip as absent.
10. The rule write and its retroactive fallout commit as one transaction — needs fault injection; see the note below.

**`applyRuleUpdate` — 4**
11. An explicit `null` clears each of the three predicates.
12. An absent key leaves the stored predicate untouched (`mergeRuleUpdate`'s half of the contract).
13. `createdAt` survives the edit — the field the whole tie-break tier reads.
14. 404 on a missing id.

**`applyRuleDelete` — 3**
15. The deleted rule's rows land on the next-best rule *in storage*.
16. Deleting the only matching rule leaves those rows unmatched in storage, and the call answers 204.
17. 404 on a missing id.

**`applyAccountDelete` — 3** (`accounts/handlers.test.ts`)
18. The cascade removes the rules whose `matchAccountId` names the account **and** re-derives the rows they had won — one transaction.
19. A rule scoped to any other account is untouched (matched by column, not by the caller's list).
20. 404 on a missing account.

**`removeManualIssuer` — 3**
21. Clearing the flag lands the row on the current winner.
22. Clearing the flag leaves the row unmatched when no rule matches.
23. 404 on a missing transaction id.

**`preview` / `previewDelete` — 5**
24. A create preview synthesises the prospective rule as the newest one, so it takes a specificity tie exactly as the real insert will — this is the `Clock` read, and it is the only place the create branch differs from the update branch outside the pure engine.
25. An update preview reuses the stored rule's `id`/`createdAt`, and an absent predicate in the payload means *dropped*, not *keep the stored one*.
26. `preview` 404s on an unknown `ruleId` — the `NotFound` is introduced after `orDieSql` precisely so it survives to the wire.
27. `previewDelete` 404s on an unknown id.
28. An uncompilable pattern previews as a 200 carrying `skipped: true`, never a 500.

**`withOwnedCounts` / `withOwnedCount` — 2**
29. `list` stamps counts derived across the *whole* rule set rather than the page — an issuer-scoped list still counts against every rule.
30. An empty page short-circuits to `[]` without reading the transactions table; `getById`/`getByIssuerPattern` stamp a single rule's count off the same read.

Set against the 62 tests in `rules/handlers.test.ts` today: about 23 are matching
wiring by the list above, another ~13 are plain CRUD-over-the-wire on `RuleRepo`
(list, count, `getByIssuerPattern`, the 404s) that have nothing to do with
matching, and the remaining ~26 are pure-engine restatements the matrix now
covers exhaustively — the specificity comparisons, the per-matcher semantics, the
predicate-combination cases, the preview bucketing rules. **Those ~26 are the
retirement's real target.** The 30 above are not.

Two notes for whoever writes them:

- **#10 has no seam today.** Nothing in the package injects a failing query, so
  "one transaction, all-or-nothing" is currently asserted by reading the code.
  Either build that seam or drop the test and say so in the ticket — do not let it
  pass by asserting the happy path and calling it atomicity.
- The engine matrix is a **third** test seam, alongside the wire suite and the repo
  suite that `packages/api/CONTEXT.md` documents. The retirement ticket should add
  it there, or the next agent will read "one file each per resource" and put pure
  cases back into the wire suite.

## 4. The bug gate

**No disagreement was found between the new matrix and the engine's actual
behaviour.** Stated explicitly, per the ticket's last acceptance criterion.

All 64 cases pass (`vitest run src/matching/issuer-matcher.test.ts`, 37 ms), and
reading them against the module's own contract comments, every expectation
matches what the code is *documented* to do — including the three places where the
documented answer is an arbitrary-but-stable one, each of which the matrix pins
rather than assumes:

- two rules carrying the same *number* of different predicate kinds are not
  ordered by kind, and fall through to literal length;
- a full tie down to the millisecond resolves positionally, to the first rule in
  the set;
- a zero amount matches neither sign and falls through to a sign-less rule.

Nothing was adjusted to fit the code. The one authoring error #158 reports finding
was in a test fixture (a metacharacter pattern that did not compile, so the
comparison it was meant to make never happened), not in the engine.

### One observation that is not a bug, and matters for §3

`deleteLists` computes its two lists by diffing each row's **stored** `issuerId`
against a re-derivation over the remaining rules. Its doc comment says something
narrower — "only rows the deleted rule had won can move" — which is true only
while stored issuers agree with the current rule set. Feed it a table where they
don't and it reports rows the deleted rule never touched:

```
rows:  [ "AMAZON EU", issuerId: null, manualIssuer: false ]
rules: [ 1: /amazon/ → issuer 10,  2: /spotify/ → issuer 20 ]
deleteLists(rows, rules, 2)  ⇒  willReassign: [1]
```

Deleting rule 2 is none of that row's business, yet it is listed. This is **not**
a bug, and the matrix is right not to flag it: `applyRuleDelete` pairs the delete
with `recomputeIssuers`, which rewrites *every* row whose derived issuer differs
from its stored one — so the row genuinely does move, and the preview is an
accurate forecast of the commit. The doc comment is the imprecise part.

The consequence is the one worth carrying into the retirement ticket:
**`deleteLists` is only as correct as the wrappers' recompute discipline.** Its
correctness is not a property of the pure function; it is a property of every
write path keeping the Issuer invariant. That is what tests 5–7, 15–16 and 18 buy,
and it is why they cannot be replaced by pure cases however exhaustive.

Two write paths do **not** hold that invariant today, and both are reachable
through the public contract: `POST /transactions` (single `create` goes straight
to `TransactionRepo`, with no matching pass — only `bulkCreate` calls
`matchImported`), and `PATCH /transactions/:id`, whose payload accepts `issuerId`
and `manualIssuer` independently, so an issuer can be set without the manual flag.
The shipped web client reaches neither — it never calls single-`create` at all
(import goes through `bulkCreate`), and `use-assign-issuer` always pairs an issuer
with `manualIssuer: true` — so no user-visible defect follows, and this is out of
scope here. It belongs on its own ticket, and it is not a reason to hold anything.

## Reproducing

The package's vitest config runs coverage through the **v8 provider, which needs
the Node inspector**; under Bun's `node` shim it fails with "Coverage APIs are not
supported" and reports 0% for everything. A real Node binary is required. In a
sandbox seeded from a macOS host, `better-sqlite3`'s native binding is also a
Mach-O file and every DB-backed test dies with `ERR_DLOPEN_FAILED` /
"invalid ELF header" — replace `node_modules/better-sqlite3/build/Release/
better_sqlite3.node` with the matching `linux-arm64` prebuild first.

```bash
cd packages/api
node ../../node_modules/vitest/vitest.mjs run \
  --testTimeout=60000 --coverage --coverage.reportOnFailure=true \
  --coverage.include='src/matching/**' --coverage.all=false
# "before": add --exclude='**/src/matching/issuer-matcher.test.ts'
#           (and --exclude='**/node_modules/**', which the flag overrides)
```

`--testTimeout=60000` matters: under coverage instrumentation the default 5 s
times out five wire tests that pass otherwise, and vitest emits no coverage report
at all on failure unless `reportOnFailure` is set.
