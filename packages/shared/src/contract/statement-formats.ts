import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import { NotFound } from "./errors";
import { AccountId, numFromStr, StatementFormatId } from "./ids";
import { Paged, Pagination } from "./pagination";

/**
 * The **Statement Format** vocabulary (PRD #180) — a user-authored record of how
 * to read one bank's export, expressed as data rather than as code.
 *
 * Every rule below is a **closed union**, deliberately, and not an expression
 * language: each case is then a checked branch in the **Parser** that applies it
 * and a fixed choice in the mapping UI that authors it, instead of an
 * interpreter to secure and debug. Adding a bank is meant to be filling one of
 * these in, not writing a module.
 *
 * The vocabulary was proven against a real export first (issue #182, Green-Got
 * as a literal record) and only then given a table; this module is where it
 * becomes contract data, so the same closed sets reach the browser, the server
 * and the emitted OpenAPI document.
 */

/**
 * The closed set of transaction properties a column may become. Everything else
 * a file carries is archive (**raw source**, ADR 0012), and widening this set is
 * earned the way ADR 0012 says a column is earned.
 *
 * `accountId`, `importMonth` and `importBatchId` are never here: they are
 * derived at parse time from the import's own context and the row's date, and no
 * column of a statement decides them.
 */
export const MappedTarget = Schema.Literal("date", "amount", "rawIssuerString", "counterpartyIban");
export type MappedTarget = typeof MappedTarget.Type;

/**
 * What separates the values of a multi-column `rawIssuerString` once joined.
 *
 * A spaced hyphen rather than a bare one: the parts being joined are themselves
 * phrases with spaces in them, so a plain space would leave no visible seam
 * between "CARTE 12/04" and "SNCF CONNECT" — and an unspaced hyphen would run
 * the two together as one word. The joined string is read by a human in the
 * transactions table, not only matched against.
 *
 * Fixed rather than a {@link ValueRules} entry. It is a presentation choice that
 * applies to every bank alike, and the vocabulary is for the things banks
 * genuinely disagree about.
 */
export const RAW_ISSUER_JOINER = " - ";

/**
 * Which column becomes which property, for every target except `amount`: which
 * column(s) carry the amount is inseparable from **how the sign is written**, so
 * it is stated by {@link SignRule} instead — the debit-and-credit strategy reads
 * two columns and the other two read one.
 *
 * `counterpartyIban` is nullable rather than optional. A bank that writes no
 * counterparty account number has to *say* so, or "this export carries none" and
 * "nobody got round to it" would look alike in a stored row — and, in the
 * mapping UI that writes these, in the form too.
 *
 * `rawIssuerString` is a **list** and every other target a single column. That
 * asymmetry is the point rather than an inconsistency: it is the one target
 * assembled from parts, because banks split a label across columns and join
 * nothing else.
 *
 * A fifth mapped target adds a field here; `statement-formats.test.ts` holds the
 * two lists to each other so it cannot be promoted and left unfillable.
 */
export const ColumnMapping = Schema.Struct({
  date: Schema.String,
  /**
   * The columns whose values, joined, become the issuer string — **a list, and
   * the only mapped target that is one**.
   *
   * Banks routinely split what a human reads as one label across several
   * columns: a payee, a free-text memo, a reference. Each alone identifies
   * nothing, so a format that could name only one of them would have to throw
   * the rest away — and `rawIssuerString` is the string every downstream issuer
   * match is made against.
   *
   * Ordered, and the order is the user's: the columns are read in the order they
   * were assigned, which is the order the mapping UI records header clicks in.
   * Joined by {@link RAW_ISSUER_JOINER}, empties dropped.
   *
   * Never empty on a stored format. A format mapping no column here produces
   * rows with no identity, which is not a format that has been half-filled but
   * one that cannot be applied; the draft is what holds "not yet".
   */
  rawIssuerString: Schema.Array(Schema.String),
  /** `null` when this bank's export carries no counterparty IBAN to promote. */
  counterpartyIban: Schema.NullOr(Schema.String),
});
export type ColumnMapping = typeof ColumnMapping.Type;

/**
 * How a row says whether money came in or went out. Three strategies, which is
 * what real French exports do:
 *
 * - `signed-column` — one column, the sign taken as written.
 * - `direction-column` — a magnitude column plus a column naming the direction,
 *   of which one value means a debit (Green-Got's `Direction` / `DEBIT`).
 * - `debit-credit-columns` — two columns, at most one filled per row, folded
 *   into one signed amount.
 */
export const SignRule = Schema.Union(
  Schema.Struct({
    strategy: Schema.Literal("signed-column"),
    amountColumn: Schema.String,
  }),
  Schema.Struct({
    strategy: Schema.Literal("direction-column"),
    amountColumn: Schema.String,
    directionColumn: Schema.String,
    /** The value of `directionColumn` that means money left the account. */
    debitValue: Schema.String,
  }),
  Schema.Struct({
    strategy: Schema.Literal("debit-credit-columns"),
    debitColumn: Schema.String,
    creditColumn: Schema.String,
  }),
);
export type SignRule = typeof SignRule.Type;

/**
 * The order a bank writes its dates in. **Never auto-detected**: `03/04/2026` is
 * unresolvable without knowing the bank, and a guess corrupts data invisibly —
 * the row still parses, still previews, and is simply the wrong day.
 */
export const DateOrder = Schema.Literal("iso", "day-first", "month-first");
export type DateOrder = typeof DateOrder.Type;

/**
 * Which mark separates the decimals. Same reasoning as {@link DateOrder}:
 * unguessable in general, catastrophic when wrong — read `1 929,71` with a dot
 * and it is `1`.
 *
 * Thousands separators are not part of this choice; they are always stripped.
 */
export const DecimalSeparator = Schema.Literal("dot", "comma");
export type DecimalSeparator = typeof DecimalSeparator.Type;

/**
 * Keep only the rows whose `column` reads exactly `equals`. One column, one
 * value — this is how "settled operations only" is said, and it is deliberately
 * not a predicate language.
 */
export const RowFilter = Schema.Struct({
  column: Schema.String,
  equals: Schema.String,
});
export type RowFilter = typeof RowFilter.Type;

/** How the values in a mapped column are written. */
export const ValueRules = Schema.Struct({
  sign: SignRule,
  dateOrder: DateOrder,
  decimalSeparator: DecimalSeparator,
  /** `null` when every row of the file is imported. */
  filter: Schema.NullOr(RowFilter),
});
export type ValueRules = typeof ValueRules.Type;

/** The fields both halves of the discriminant carry, in the order they are read. */
const formatFields = {
  id: StatementFormatId,
  /**
   * The account this format reads statements for. A format belongs to one
   * account (PRD #180) — no DB-level foreign key, like everywhere else in this
   * project, so the brand is the whole guard.
   */
  accountId: AccountId,
  /** Required and user-entered: a list of untitled records is not a list. */
  name: Schema.String,
} as const;

const formatRuleFields = {
  mapping: ColumnMapping,
  rules: ValueRules,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
} as const;

/**
 * A format for a bank's **CSV** export. Its `headers` are the **fingerprint**:
 * the columns a file must carry for this format to recognise it — not the whole
 * column set the bank ships, which the **raw source** keeps anyway.
 */
export class CsvStatementFormat extends Schema.Class<CsvStatementFormat>("CsvStatementFormat")({
  ...formatFields,
  kind: Schema.Literal("csv"),
  headers: Schema.Array(Schema.String),
  ...formatRuleFields,
}) {}

/**
 * A format for a bank's **PDF** export. A PDF has no header row to fingerprint,
 * so `columns` says something different in kind: the columns the extraction
 * prompt should ask the model to return, and against which it reports whether
 * the statement matched.
 */
export class PdfStatementFormat extends Schema.Class<PdfStatementFormat>("PdfStatementFormat")({
  ...formatFields,
  kind: Schema.Literal("pdf"),
  columns: Schema.Array(Schema.String),
  ...formatRuleFields,
}) {}

/**
 * Statement Format entity — the wire shape every statement-formats endpoint
 * returns.
 *
 * A **union on `kind`**, not one class with a flag: the two halves declare
 * genuinely different data (a header fingerprint vs. the columns to ask a model
 * for), and the PRD's rule is that the CSV/PDF split stays visible rather than
 * being hidden behind a shared abstraction. Reading `format.headers` on a PDF
 * format is then a type error rather than an `undefined` at runtime.
 */
export const StatementFormat = Schema.Union(CsvStatementFormat, PdfStatementFormat);
export type StatementFormat = typeof StatementFormat.Type;

/**
 * The same entity, annotated `201` — the shape `create` answers with.
 *
 * It exists because a union success schema cannot take its status from
 * `.addSuccess(schema, { status })` the way every other resource's `create`
 * does: the framework splits a union into its members and caches each member
 * schema **by AST identity**, so the first endpoint to use `StatementFormat`
 * fixes its members' status for every other one — and `getById`, at the default
 * `200`, gets there first. Annotating the members produces distinct ASTs, which
 * is what keeps the created-status where it belongs instead of quietly
 * answering `200` to a create.
 */
const StatementFormatCreated = Schema.Union(
  CsvStatementFormat.annotations(HttpApiSchema.annotations({ status: 201 })),
  PdfStatementFormat.annotations(HttpApiSchema.annotations({ status: 201 })),
);

/** The create-payload fields shared by both halves — the server assigns the rest. */
const createFields = {
  accountId: CsvStatementFormat.fields.accountId,
  name: CsvStatementFormat.fields.name,
  mapping: CsvStatementFormat.fields.mapping,
  rules: CsvStatementFormat.fields.rules,
} as const;

/**
 * Create payload — the server assigns `id`, `createdAt`, `updatedAt`. Still a
 * union on `kind`, so a payload cannot name both a header fingerprint and a
 * column list, and cannot name neither.
 *
 * The **mapping is immutable**: there is no payload that rewrites one. A bank
 * that changes its export gets a *new* format, so statements downloaded before
 * the change keep one that reads them — and a mapping edited after an import
 * would silently stop describing the rows it produced, since nothing re-parses
 * them. {@link StatementFormatUpdate} renames, and that is all it does.
 */
export const StatementFormatCreate = Schema.Union(
  Schema.Struct({
    ...createFields,
    kind: CsvStatementFormat.fields.kind,
    headers: CsvStatementFormat.fields.headers,
  }),
  Schema.Struct({
    ...createFields,
    kind: PdfStatementFormat.fields.kind,
    columns: PdfStatementFormat.fields.columns,
  }),
);
export type StatementFormatCreate = typeof StatementFormatCreate.Type;

/**
 * Update payload — the **name, and nothing else**.
 *
 * Not a partial of the entity: `mapping`, `rules` and the declared columns are
 * what a format *is*, and they are fixed at authoring time for the reason
 * {@link StatementFormatCreate} gives. What is left is the label, which is
 * user-entered and therefore wrong sometimes — a format auto-named from the file
 * it was built with is exactly the kind of name someone wants to fix later.
 *
 * A rename is also what finally gives `updatedAt` a job: until this endpoint
 * existed it was stamped once and equalled `createdAt` for the row's whole life.
 *
 * Still no uniqueness constraint, so a rename declares no `Conflict` — two
 * formats on one account may share a name, and the mapped columns are what tell
 * them apart.
 */
export const StatementFormatUpdate = Schema.Struct({
  name: CsvStatementFormat.fields.name,
});
export type StatementFormatUpdate = typeof StatementFormatUpdate.Type;

/**
 * `list` filter set: `accountId?`. Formats are account-scoped, and this is the
 * only way the picker ever wants them — an unfiltered list exists because every
 * list endpoint in this contract does, not because a surface asks for one.
 */
export const StatementFormatListFilters = {
  accountId: Schema.optional(numFromStr(AccountId)),
} as const;

/**
 * Statement formats group, prefix `/statement-formats`. `list` (account-scoped),
 * `getById` (404 on a missing id), `create` (201), `update` (a rename) and
 * `remove` (204). No uniqueness constraint — two formats may share a name, since
 * a user who wants two called "Green-Got" has said something about their own
 * bank rather than made a mistake — so neither write declares a `Conflict`.
 *
 * `remove` is a **hard delete with no cascade**, and that is safe for a reason
 * worth stating: a format is a parse-time recipe. Transactions imported under
 * one are already parsed and store no reference back to it (they carry an
 * `importBatchId`, never a `statementFormatId`), so deleting a format cannot
 * orphan a row or change a figure. What it does end is the ability to recognise
 * *the next* file of that shape, which is the user's call to make.
 *
 * The one live read of a stored format is the PDF extraction path, which takes a
 * `formatId` mid-import — so a format deleted while an import is open makes that
 * extraction 404. That race is accepted rather than locked against: the wizard
 * reports it, and tracking in-flight imports to forbid it would cost more than
 * the window is worth.
 */
export class StatementFormatsGroup extends HttpApiGroup.make("statementFormats")
  .add(
    HttpApiEndpoint.get("list")`/statement-formats`
      .setUrlParams(Schema.Struct({ ...Pagination, ...StatementFormatListFilters }))
      .addSuccess(Paged(StatementFormat)),
  )
  .add(
    HttpApiEndpoint.get(
      "getById",
    )`/statement-formats/${HttpApiSchema.param("id", numFromStr(StatementFormatId))}`
      .addSuccess(StatementFormat)
      .addError(NotFound),
  )
  .add(
    HttpApiEndpoint.post("create")`/statement-formats`
      .setPayload(StatementFormatCreate)
      .addSuccess(StatementFormatCreated),
  )
  .add(
    HttpApiEndpoint.patch(
      "update",
    )`/statement-formats/${HttpApiSchema.param("id", numFromStr(StatementFormatId))}`
      .setPayload(StatementFormatUpdate)
      .addSuccess(StatementFormat)
      .addError(NotFound),
  )
  .add(
    HttpApiEndpoint.del(
      "remove",
    )`/statement-formats/${HttpApiSchema.param("id", numFromStr(StatementFormatId))}`
      .addSuccess(HttpApiSchema.NoContent)
      .addError(NotFound),
  )
  .annotateContext(OpenApi.annotations({ title: "Statement formats" })) {}
