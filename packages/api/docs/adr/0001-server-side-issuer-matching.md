# Server-side issuer matching

Matching a transaction's raw issuer string to an **Issuer** via **Matching
Rules** (regex patterns) runs on the **server**, in a new Effect service —
`IssuerMatcher` (`packages/api/src/matching/issuer-matcher.ts`) — depending only
on the `SqlClient`. It is deliberately **not** client-side.

This sits alongside web ADR 0001 (client-side CSV parsing) and refines it: CSV
**ingest** stays in the browser (the client parses statements and POSTs clean
`TransactionCreate[]` via `bulkCreate`, unchanged), but **matching over stored
transactions** runs where the data lives. The client never sees the rule set.

## Why server-side

- Matching is retroactive: adding, editing, or deleting a rule re-derives issuers
  across the *whole* history, not just one import. That derivation reads the full
  transactions + rules tables — it belongs next to the data, not shipped to every
  browser.
- One authoritative rule set. A shared server engine can't drift from what a
  given client version believes the rules are.
- Atomicity. A rule commit (every `issuerId` write + every `matchCount` bump)
  runs in a single SQLite transaction — all-or-nothing — which the
  client-orchestrated, non-atomic import path (web ADR 0001) cannot offer.

## The Issuer invariant

A transaction's issuer is, in priority order: (a) its **manual assignment** if
`manualIssuer` is set (manual always wins); else (b) the **specificity-winner**
among all rules whose pattern matches its raw issuer string; else (c)
**unmatched**. Specificity = longest literal after stripping regex metacharacters;
ties break to the newest rule (`createdAt`). One pure routine (`derive`) computes
this for any row-scope, in dry-run or commit mode.

## Regex in JS, not SQL

Patterns compile with `new RegExp(pattern, "i")` inside the service, each wrapped
in try/catch. Matching is case-insensitive. An invalid pattern becomes a
*skipped rule* surfaced to the user — never a 500. SQLite has no native regex; a
registered function would risk divergent semantics and lose the skipped-rule
path.

## Consequences

- Import matching happens inside `bulkCreate`: freshly inserted rows get their
  `issuerId` set to reflect the current rule set the moment they enter the DB,
  and each winning rule's `matchCount` is bumped.
- The engine is **stateless**: a row records *that* a rule set its issuer
  (`manualIssuer = false`), not *which* rule (no `assignedByRuleId`).
  Re-derivation always re-runs the current rule set.
- Tested exclusively through the API boundary (per the PRD's single-seam bias) —
  there is no isolated engine seam.
