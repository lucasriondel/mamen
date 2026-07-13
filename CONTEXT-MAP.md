# Context map

Multi-context monorepo. Each package owns its own domain vocabulary in a
`CONTEXT.md`. This map points at them. System-wide decisions live in
`docs/adr/`.

| Context | Path | Role |
|---|---|---|
| shared | `packages/shared/CONTEXT.md` | The HTTP API contract + shared schemas/types. Source of truth for domain entities. |
| api | `packages/api/CONTEXT.md` | Effect `HttpApi` server implementing the contract. |
| sdk | `packages/sdk/CONTEXT.md` | Typed client derived from the contract, wired to TanStack Query. |
| web | `packages/web/CONTEXT.md` | React frontend. Uploads CSV bank statements, displays transactions, manages issuers. |

The legacy `server` (Fastify API) and `web-api-legacy` (old web client) packages were deleted at
the Effect API rework cutover (`docs/issues/0020-cutover.md`).

## Cross-context terms

These terms mean the same thing in every context — defined once here, not
repeated per package.

- **Issuer** — an entity describing a place money goes **to or from** (a payee
  *or* an income source; bidirectional by design). Supersedes the earlier term
  **Merchant**, which was payee-flavoured and a poor fit for income (salary,
  rent received). The rename is total: contract, DB, SDK, and web all say
  *issuer* / `IssuerId`.

- **Matching Rule** — a single regex `pattern` owned by one Issuer that
  auto-assigns that Issuer to any transaction whose **raw issuer string**
  matches. An Issuer may own several (one regex each); together they are the
  Issuer's rule set. *In code the entity is `Rule` / `RuleId` / `rules` — the
  "Matching Rule" name is UI/glossary-only, chosen so users don't confuse it
  with other kinds of rule.* A rule assigns **only an issuer**, never a category
  (category is derived — see **Derived category**).

- **Manual assignment** — a human directly choosing a transaction's issuer or
  category, recorded by the `manualIssuer` / `manualCategory` flags. Manual
  assignments are **sticky**: Matching Rules never overwrite them. The issuer
  flag mirrors the pre-existing category flag.

- **Issuer invariant** — a transaction's issuer is, in priority order: its
  **manual assignment** if `manualIssuer` is set; else the **specificity-winner**
  among all Matching Rules whose pattern matches its raw issuer string; else
  **unmatched** (no issuer). Specificity = longest literal (regex metachars
  stripped), tiebreak newest rule. This invariant holds after every operation —
  import, and rule create / edit / delete — each of which re-derives the affected
  rows and (except manual) makes the table reflect the best current rule.

- **Derived category** — a transaction's category is read *through* its issuer
  (`issuer.defaultCategoryId`) at query time, not copied onto the transaction —
  so re-categorising an issuer reclassifies all its history for free. The
  exception is a **manual category** on a single transaction
  (`categoryOverride` / `manualCategory`), which wins over the issuer's default.
  This is what powers the category-spend recap graphs.
