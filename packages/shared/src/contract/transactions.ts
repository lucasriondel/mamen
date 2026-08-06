import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import { AnomalyFlag } from "./anomaly";
import {
	BooleanFromString,
	BundleInvalid,
	CategoryNotLeaf,
	NotFound,
	TransferInvalid,
} from "./errors";
import {
	AccountId,
	CategoryId,
	IssuerId,
	numFromStr,
	TransactionId,
} from "./ids";
import { Paged, Pagination } from "./pagination";

/**
 * The cap on a transaction's free-text `notes` (issue #38) — the one length
 * constraint on the entity, enforced in the schema below so an over-long note
 * fails decode (400) at the API boundary. Exported so the web editor can guide
 * the user to the same limit rather than restating the number and drifting.
 */
export const NOTES_MAX_LENGTH = 1000;

/**
 * The date window, in days, either side of a leg's date within which a
 * counterpart is considered "around the same time" for internal-transfer
 * suggestion (PRD #48). The **single source of truth** — the server's
 * `transfer-suggestions` self-join and the web suggestion util both read this
 * one constant, so their notions of "the surrounding days" can never drift.
 * Kept small so a suggestion reads as an obvious match rather than a
 * coincidence; the confirmed pairing is re-validated at `link-transfer`, so a
 * generous window would only dilute suggestions, never corrupt state.
 */
export const TRANSFER_DATE_WINDOW_DAYS = 5;

/**
 * What a transaction row **is** (issue #68) — the discriminator that tells a real
 * bank row from a synthetic one:
 *
 * - `bank` — a real row, imported from a statement. Every row before bundles
 *   existed is one, which is why it is the default.
 * - `bundle` — a **bundle parent**: the synthetic row that stands for two or more
 *   members, carrying their label and their summed amount. It lives in the same
 *   table precisely so it sorts, pages, filters, searches and is edited through
 *   every surface a transaction already has.
 */
export const TransactionKind = Schema.Literal("bank", "bundle");
export type TransactionKind = typeof TransactionKind.Type;

/** Transaction entity — the wire shape returned by every transactions endpoint. */
export class Transaction extends Schema.Class<Transaction>("Transaction")({
	id: TransactionId,
	accountId: AccountId,
	date: Schema.Date,
	amount: Schema.Number,
	rawIssuerString: Schema.String,
	issuerId: Schema.optional(IssuerId),
	categoryId: Schema.optional(CategoryId),
	manualCategory: Schema.optional(Schema.Boolean),
	manualIssuer: Schema.optional(Schema.Boolean),
	isRefund: Schema.optional(Schema.Boolean),
	linkedRefundId: Schema.optional(TransactionId),
	/**
	 * Transfer-group membership (Internal transfers, PRD #48). Optional; absent
	 * means the row belongs to no internal transfer. When set, it is the group's
	 * id — the smallest transaction id among the legs — so every leg of one
	 * transfer carries the same value (the anchor leg's own id equals it). A
	 * `TransactionId`-branded value because the id *is* one of the legs' ids.
	 * Stored flat and FK-free, mirroring `linkedRefundId`; the link/unlink logic
	 * lands in a later slice — this only persists and reads the membership.
	 */
	transferGroupId: Schema.optional(TransactionId),
	/**
	 * What this row **is** (issue #68) — see {@link TransactionKind}. Optional
	 * like every other added field: **absent means `bank`**, so a row written
	 * before bundles existed (or by a caller that doesn't know about them) reads
	 * as the real bank row it is. Only `kind === "bundle"` ever means anything, so
	 * no surface has to distinguish absent from `"bank"`.
	 */
	kind: Schema.optional(TransactionKind),
	/**
	 * **Bundle** membership (issue #68). Absent means the row belongs to no
	 * bundle; when set it is the id of the **bundle parent** that stands for this
	 * row — a `TransactionId` because the parent *is* a transaction. Stored flat
	 * and FK-free, mirroring `transferGroupId`/`linkedRefundId`, but pointing at a
	 * distinct row rather than at one of the members: a bundle nets to a non-zero
	 * amount, so unlike a transfer group it needs a row to *hold* that amount.
	 *
	 * A member never carries `kind: "bundle"`, and a parent never carries a
	 * `bundleId` — the two fields are the two halves of one relationship.
	 */
	bundleId: Schema.optional(TransactionId),
	/**
	 * Marks this row's `date` as the **user's**, not a derived default (issue
	 * #72) — `manualDate` stands to `date` exactly as `manualCategory` stands to
	 * `categoryId` and `manualExcluded` to `excludedFromRecap`.
	 *
	 * Only a **bundle parent** has a derivable date at all: it defaults to its
	 * earliest member's, because the cost belongs to when the money was spent
	 * rather than to when the last person settled up. That default is a starting
	 * point, not a constraint — a weekend away can be dated the Friday even when
	 * a member lands weeks later — so an overridden date is flagged here and
	 * every later membership change recomputes *around* it (#74). On a bank row
	 * the date is the bank's and nothing derives it, so the flag is simply absent.
	 *
	 * The amount deliberately has no counterpart flag: a bundle's cost is what
	 * its members sum to, and an editable total could drift from the very bank
	 * rows the app exists to reconcile against.
	 */
	manualDate: Schema.optional(Schema.Boolean),
	anomalyFlags: Schema.optional(Schema.Array(AnomalyFlag)),
	isDuplicateExcluded: Schema.optional(Schema.Boolean),
	duplicateNote: Schema.optional(Schema.String),
	/**
	 * **Excluded from recap** (issue #67, ADR 0008) — the row does not count
	 * toward spend totals: an internal movement the **transfer group** feature
	 * never caught, a correction, a row the user has decided is noise. Optional;
	 * absent means the row counts. Excluded rows stay fully visible in the list —
	 * exclusion is about arithmetic, not visibility.
	 *
	 * Distinct from `isDuplicateExcluded`, which claims *this row is a duplicate
	 * of another* (a provenance fact) rather than *this row is not spending*.
	 */
	excludedFromRecap: Schema.optional(Schema.Boolean),
	/**
	 * Marks this row's `excludedFromRecap` as a **deliberate** decision, so it
	 * wins over the default its issuer will carry once issuer-level exclusion
	 * lands (#69) — `manualExcluded` stands to `excludedFromRecap` exactly as
	 * `manualCategory` stands to `categoryId` (ADR 0008). Set in *both*
	 * directions: forcing a row out of the recap and forcing one back in are both
	 * decisions an issuer default must not clobber. Introduced with the flag it
	 * qualifies so no later migration has to invent the distinction retroactively.
	 */
	manualExcluded: Schema.optional(Schema.Boolean),
	/**
	 * Free-text note the user records against a single transaction (issue #38).
	 * Optional; absent means no note. Capped at 1000 chars at the contract
	 * boundary, so an over-long note fails decode (400) rather than reaching the
	 * DB — the one constrained string on the entity. Searching it is #40's job,
	 * not carried here as a filter.
	 */
	notes: Schema.optional(
		Schema.String.pipe(Schema.maxLength(NOTES_MAX_LENGTH)),
	),
	importedAt: Schema.Date,
	importMonth: Schema.String, // "YYYY-MM"
	importBatchId: Schema.optional(Schema.String),
}) {}

/**
 * Create payload — the server assigns `id`. Every other field is caller-provided
 * (faithful port: the old adapter accepted `importedAt` on the record, so it is
 * kept here rather than server-stamped; contract §5 permits either).
 */
export const TransactionCreate = Schema.Struct({
	accountId: Transaction.fields.accountId,
	date: Transaction.fields.date,
	amount: Transaction.fields.amount,
	rawIssuerString: Transaction.fields.rawIssuerString,
	issuerId: Transaction.fields.issuerId,
	categoryId: Transaction.fields.categoryId,
	manualCategory: Transaction.fields.manualCategory,
	manualIssuer: Transaction.fields.manualIssuer,
	isRefund: Transaction.fields.isRefund,
	linkedRefundId: Transaction.fields.linkedRefundId,
	transferGroupId: Transaction.fields.transferGroupId,
	// Accepted for a faithful round-trip (a DB restore replays whole rows), but
	// never stated by an ordinary caller: the only writer of a `bundle` row is
	// `createBundle`, which builds the parent itself.
	kind: Transaction.fields.kind,
	bundleId: Transaction.fields.bundleId,
	// Written through `update` when a bundle parent's date is overridden (#72);
	// on a create it is only ever a faithful round-trip of a stored row.
	manualDate: Transaction.fields.manualDate,
	anomalyFlags: Transaction.fields.anomalyFlags,
	isDuplicateExcluded: Transaction.fields.isDuplicateExcluded,
	duplicateNote: Transaction.fields.duplicateNote,
	excludedFromRecap: Transaction.fields.excludedFromRecap,
	manualExcluded: Transaction.fields.manualExcluded,
	notes: Transaction.fields.notes,
	importedAt: Transaction.fields.importedAt,
	importMonth: Transaction.fields.importMonth,
	importBatchId: Transaction.fields.importBatchId,
});
export type TransactionCreate = typeof TransactionCreate.Type;

/** Update payload — every field optional (partial update). */
export const TransactionUpdate = Schema.partial(TransactionCreate);
export type TransactionUpdate = typeof TransactionUpdate.Type;

/**
 * The **unassigned** filter value — the one id filters accept that is not an id.
 * `?issuerId=none` narrows to the rows with no issuer, `?categoryId=none` to
 * those with no *derived* category: the two buckets the recap reports as
 * *Unassigned* rather than dropping, since unattributed spend is still spend
 * (issue #86). Absent means "any", which is why the empty string cannot carry
 * this: absent and unassigned are different questions, and an omitted filter
 * already means the first.
 *
 * A literal rather than a `null`/empty encoding so the sentinel survives the
 * round trip through a URL, where every value is a string and `?issuerId=` is
 * indistinguishable from a cleared control.
 */
export const UNASSIGNED_FILTER = "none" as const;

/**
 * The `categoryId` filter — a single id, **a set** (ADR 0002), or
 * {@link UNASSIGNED_FILTER}. A folder's category page lists all of its leaves'
 * transactions in one query, so the filter accepts several category ids at once
 * (repeated `?categoryId=`), while a leaf page still passes a lone id. A single
 * query value decodes to one branded id; a repeated one to an array — the
 * repository normalises both to a set. `none` matches the rows with no derived
 * category at all — the recap's *Unassigned* bucket, drilled into (issue #86).
 * The filter matches the **derived** category, not the stored column (ADR 0002).
 */
export const CategoryIdFilter = Schema.Union(
	Schema.Literal(UNASSIGNED_FILTER),
	numFromStr(CategoryId),
	Schema.Array(numFromStr(CategoryId)),
);

/**
 * The `issuerId` filter — one id or {@link UNASSIGNED_FILTER}. Unlike the
 * category filter there is no set form: an issuer has no hierarchy to merge, so
 * no page ever asks about several at once. `none` narrows to the rows no issuer
 * has been matched to — the recap's *Unassigned* by-issuer bucket (issue #86).
 */
export const IssuerIdFilter = Schema.Union(
	Schema.Literal(UNASSIGNED_FILTER),
	numFromStr(IssuerId),
);

/**
 * The `accountId` filter — one account id, or a repeated set of them. The recap
 * page's account picker is multi-select and the aggregation runs in ONE query
 * over the whole selection: fanning out one query per account and merging
 * client-side is what forced the old scan-and-reduce. The **recap detail** page
 * (issue #86) carries that same selection into `list`/`count`, which is why the
 * set form belongs on {@link TransactionFilters} too, not only on
 * {@link RecapFilters} — a drill-down whose account scope silently widened to
 * every account would show rows the recap row it came from never counted.
 * Absent means every account.
 */
export const AccountIdFilter = Schema.Union(
	numFromStr(AccountId),
	Schema.Array(numFromStr(AccountId)),
);

/**
 * The composable filter set (contract §2.5) — the core redesign. Every field is
 * optional and `AND`-combined; the old 9-branch either/or fan-out (where
 * `accountId` dominated and every other filter was unreachable) is gone. `count`
 * reuses the identical set; `list` adds `Pagination` + `orderBy`/`direction`.
 * Branded-id filters decode a query string via `numFromStr`; the two boolean
 * filters via `BooleanFromString`; `startDate`/`endDate` are inclusive bounds on
 * the entity's `date` (encoded to ISO strings in the URL). `accountId` and
 * `categoryId` accept a **set** (see {@link AccountIdFilter} /
 * {@link CategoryIdFilter}), the latter matching the derived category; the two
 * id filters also accept {@link UNASSIGNED_FILTER} for the rows that have none.
 */
export const TransactionFilters = {
	accountId: Schema.optional(AccountIdFilter),
	issuerId: Schema.optional(IssuerIdFilter),
	categoryId: Schema.optional(CategoryIdFilter),
	linkedRefundId: Schema.optional(numFromStr(TransactionId)),
	// Transfer-group membership (PRD #48): returns only the legs of one internal
	// transfer, so the detail page can list a group's other legs and the table
	// can badge legs without client-side scanning. Mirrors `linkedRefundId`.
	transferGroupId: Schema.optional(numFromStr(TransactionId)),
	// **Is a transfer leg** — the bulk counterpart of `transferGroupId` above:
	// that one names ONE group, this one asks the yes/no question about every row
	// ("is this money moving between the user's own accounts?"). `true` returns
	// only legs, `false` only non-legs, absent both. It is what lets the recap's
	// *Internal transfers* line open the rows it summed, which `transferGroupId`
	// could not express — a line spans many groups.
	//
	// Matched against the same `isTransferLeg` fragment `countsTowardRecap` is
	// built from, never a second copy of `transferGroupId IS NOT NULL`: the recap
	// nets a set of rows out of the totals and this filter lists that same set, so
	// the two coming to mean different things is the ADR 0002 drift on a third
	// field. Unlike `bundleId`, asking for legs does not invert a default —
	// `list` has never hidden them.
	isTransferLeg: Schema.optional(BooleanFromString),
	// **Bundle** membership (issue #68) — returns the members of one bundle, so a
	// parent can list what it stands for. It is also the ONLY way to reach a
	// member through `list`: absent, the list hides every bundled row, because the
	// parent already accounts for it and showing both double-counts (in the rows
	// and in the signed `total` beneath them). Mirrors `transferGroupId`.
	bundleId: Schema.optional(numFromStr(TransactionId)),
	// The row's **kind** (issue #74) — `bundle` lists the **bundle parents** and
	// nothing else, which is how the detail page offers the bundles a row may
	// join. Orthogonal to `bundleId`: that one asks "whose members?", this one
	// asks "which rows are parents?". Absent returns every kind.
	kind: Schema.optional(TransactionKind),
	// The **month filter** (issue #87) — a `"YYYY-MM"` key matched against the
	// month the transaction's own **`date`** falls in, NOT against the
	// `importMonth` column of the same name. The two diverge whenever a date moves
	// after import (a **bundle parent** dated by hand, a date corrected across a
	// month boundary), and the row then answered for a month its date contradicted
	// while the month it belonged to did not list it. The recap made the same
	// correction at issue #71; `importMonth` is provenance, and provenance only.
	//
	// The name is kept **deliberately** so bookmarked and shared URLs keep
	// working: a naming inconsistency traded for not breaking them. The one place
	// the param still means the column is `bundleImpact` below — it asks about a
	// *statement*, not about a month of spending.
	importMonth: Schema.optional(Schema.String), // "YYYY-MM"
	importBatchId: Schema.optional(Schema.String),
	startDate: Schema.optional(Schema.Date), // inclusive lower bound on `date`
	endDate: Schema.optional(Schema.Date), // inclusive upper bound on `date`
	isRefund: Schema.optional(BooleanFromString),
	isDuplicateExcluded: Schema.optional(BooleanFromString),
	// Recap exclusion (issue #67): `true` returns only the rows held out of spend
	// totals, `false` only those that count, absent both. Matched against the same
	// expression the projection reads (ADR 0008) — the guard against the ADR 0002
	// drift, where a filter on the stored column silently dropped every row
	// excluded by inheritance once #69 makes exclusion derivable through the issuer.
	//
	// "Held out" means the recap's `isRecapExcluded` — the derived
	// `excludedFromRecap` flag **OR** `isDuplicateExcluded` — not the flag alone.
	// The two are one question to the user ("why isn't this in my total?") and the
	// recap's *Excluded from recap* line already sums both, so a filter matching
	// only the flag opened that line onto fewer rows than it counted. Widened when
	// the line became a link into `list`. The consequence on the `false` side is
	// deliberate too: "counted" now also drops duplicate-excluded rows, which is
	// what `countsTowardRecap` has always meant by it.
	//
	// `isDuplicateExcluded` above stays reachable on its own for the narrower
	// question — this is the union, that is one of its halves.
	excludedFromRecap: Schema.optional(BooleanFromString),
	// A free-text substring (case-insensitive) matched against the raw issuer
	// string, the assigned issuer's name, the notes, and the amount as displayed
	// (2 decimals, unsigned) — the union, so one box searches every human-readable
	// field of a row. AND-combined with the rest, like every sibling filter (#40).
	search: Schema.optional(Schema.String),
	// Curation state: `true` returns only rows nothing has been reviewed on —
	// no issuer, no *derived* category, no note. Derived, not stored: a row
	// categorised through its issuer counts as curated, exactly like the tint the
	// table paints those rows with. `false` returns only the complement (rows
	// with at least one of the three), absent returns both.
	// A row **excluded from recap** — by either route — is exempt from the whole
	// question (issue #70): curating it moves no total, so neither value returns
	// it. Unlike `excludedFromRecap` the two halves are therefore NOT exhaustive;
	// absent is how you ask for the whole table.
	uncurated: Schema.optional(BooleanFromString),
} as const;

/**
 * The **recap**'s filter set (issue #71) — deliberately narrow next to
 * {@link TransactionFilters}: a recap is a **period** and an account selection,
 * nothing else. Which rows *count* is not a filter the caller composes but the
 * server's `countsTowardRecap` predicate, defined once (in the API's
 * `recap-predicate` module) beside the derived-exclusion and bundle-membership
 * expressions it is built from.
 *
 * `startDate`/`endDate` are inclusive bounds on the transaction's **`date`** —
 * the day the money moved. Every period (month, year, all time) is expressed as
 * a bound on that one field: `importMonth` is provenance (the statement a row
 * arrived on, per-account-per-statement), so bucketing a month by it made the
 * same row land in different buckets depending on which period you were looking
 * at.
 */
export const RecapFilters = {
	accountId: Schema.optional(AccountIdFilter),
	startDate: Schema.optional(Schema.Date), // inclusive lower bound on `date`
	endDate: Schema.optional(Schema.Date), // inclusive upper bound on `date`
} as const;

/**
 * One row of the by-issuer breakdown: the issuer, the money spent against it over
 * the period, and how many spending rows fell in the bucket. `id` is `null` for
 * the rows with no issuer — the **Unassigned** bucket, reported rather than
 * dropped, since unattributed spend is still spend. `spent` is a **positive**
 * magnitude in euros (debits only), summed in integer cents server-side so a
 * period of small amounts does not accumulate float dust.
 */
export const RecapIssuerBucket = Schema.Struct({
	id: Schema.NullOr(IssuerId),
	spent: Schema.Number,
	count: Schema.Number,
});

/**
 * One row of the by-category breakdown. Keyed by the **derived** category (ADR
 * 0002) — a row categorised through its issuer counts under that category, not
 * under Unassigned. `id` is `null` for the uncategorised bucket.
 */
export const RecapCategoryBucket = Schema.Struct({
	id: Schema.NullOr(CategoryId),
	spent: Schema.Number,
	count: Schema.Number,
});

/**
 * The internal-transfer legs netted out of the breakdowns, summarised (PRD #48).
 * `total` is the money that moved between the user's own accounts — the sum of
 * the **debit** legs' magnitudes, so a clean -30/+30 pair reads as 30, not a net
 * ~0 nor a doubled 60. `count` is every leg in the period, both sides.
 */
export const RecapTransfers = Schema.Struct({
	total: Schema.Number,
	count: Schema.Number,
});

/**
 * The spend **held out of the recap** by an exclusion decision (issue #87) —
 * reported rather than silently absent, exactly as the transfer legs are.
 *
 * Money the user (or an issuer default) deliberately kept out of their totals is
 * still money they may want to look at: a shared account, a reimbursed expense, a
 * row marked as a duplicate. Left unreported, the only evidence of it was the
 * absence of a number, so a bad exclusion rule was invisible until the totals
 * looked wrong for no visible reason.
 *
 * `total` sums the **debit** magnitudes, matching {@link RecapTransfers}, so the
 * line reads as "money out that isn't in the total above" rather than a net that a
 * refund could quietly cancel. `count` is every excluded row in the period. The
 * two reasons — the derived `excludedFromRecap` flag and `isDuplicateExcluded` —
 * are summed together, because they answer the same user question ("what did I
 * hold out?") and the detail page lists them under one filter.
 *
 * A row that is BOTH excluded and a transfer leg is reported here, and only here:
 * the transfer line holds excluded legs out, so this is the one line that can
 * account for it — reporting it on neither would leave its money absent from the
 * page with nothing to say where it went. Exclusion is the stronger statement,
 * being one the user made deliberately. Bundle members are held out — their
 * **bundle parent** stands for them, so counting both would show the same money
 * twice.
 */
export const RecapExcluded = Schema.Struct({
	total: Schema.Number,
	count: Schema.Number,
});

/**
 * `recap` success body (issue #71) — spend for a period, aggregated **over the
 * whole filtered set** rather than a page. There is no row cap and no partial
 * answer: the sums are computed in SQL, through the one `countsTowardRecap`
 * predicate, so the client never re-expresses "counts toward spend" in a second
 * reducer that has to be kept in sync by hand.
 *
 * Buckets carry ids, not names: the recap page already resolves the issuers and
 * categories it is showing (by id — issue #62), and duplicating those names into
 * this payload would make the aggregation own a second copy of the display
 * identity it resolves nowhere else.
 */
export const RecapSummary = Schema.Struct({
	byIssuer: Schema.Array(RecapIssuerBucket),
	byCategory: Schema.Array(RecapCategoryBucket),
	transfers: RecapTransfers,
	excluded: RecapExcluded,
});
export type RecapSummary = typeof RecapSummary.Type;
export type RecapIssuerBucket = typeof RecapIssuerBucket.Type;
export type RecapCategoryBucket = typeof RecapCategoryBucket.Type;
export type RecapTransfers = typeof RecapTransfers.Type;
export type RecapExcluded = typeof RecapExcluded.Type;

/**
 * `recap-periods` success body — every `"YYYY-MM"` month the data covers,
 * newest first, derived from the transaction **`date`** like every recap bound.
 * The period picker offers these; the years it offers are their distinct
 * prefixes. Unscoped by period (that is what it is *for*: switching away from a
 * period must never drop the option of switching back) and unfiltered by
 * `countsTowardRecap` — a month exists because rows are dated in it, not because
 * its money counts.
 */
export const RecapPeriods = Schema.Struct({
	months: Schema.Array(Schema.String),
});

/**
 * `list` success body — the paged envelope `{ items, total }` **plus** the
 * **bundle members** of whatever **bundle parents** the page happens to contain
 * (issue #73), so a parent can be expanded in place without a fetch per row.
 *
 * They ride in their own field rather than in `items` on purpose. `items` is the
 * top-level set — the one the signed `total` sums and the one pagination counts —
 * and a member listed there would be counted twice, which is the very thing the
 * `bundleId IS NULL` default exists to prevent. Here they are *reference data for
 * the rows on this page*: shown for reading, counted nowhere.
 *
 * Scoped to the page, not the query: only the parents in `items` contribute, so
 * the field grows with what is on screen rather than with the table. Empty for
 * every page that holds no parent (the overwhelming majority), and empty when
 * `bundleId` is the filter — that page's `items` *are* the members.
 */
export const PagedTransactions = Schema.Struct({
	...Paged(Transaction).fields,
	bundleMembers: Schema.Array(Transaction),
});
export type PagedTransactions = typeof PagedTransactions.Type;

/**
 * The `list` ordering params: `orderBy: "date"` orders by `date`, `direction`
 * defaults `desc` (faithful to the old `getAllOrderedByDate` default). Separate
 * from {@link TransactionFilters} because `count` — which takes the identical
 * filter set — has no meaningful ordering.
 */
export const TransactionListOrder = {
	orderBy: Schema.optional(Schema.Literal("date")),
	direction: Schema.optionalWith(Schema.Literal("asc", "desc"), {
		default: () => "desc" as const,
	}),
} as const;

/**
 * `count` success body — the full filtered row `count` plus a signed, net
 * `total` (ADR 0002). The total covers the **whole filtered set**, not a page,
 * and follows the same filter object as the count, so a category page's number
 * can never disagree with its list. Signed per the amount sign convention: a
 * refunded purchase nets to zero, an income category totals positive.
 */
export const TransactionCount = Schema.Struct({
	count: Schema.Number,
	total: Schema.Number,
});

/** Bulk-create payload — `{ records }`, one row created per element (201, ids generated). */
export const TransactionBulkCreate = Schema.Struct({
	records: Schema.Array(TransactionCreate),
});
export type TransactionBulkCreate = typeof TransactionBulkCreate.Type;

/**
 * Bulk-put payload — `{ records }` of **full** `Transaction`s (id-carrying); each
 * is upserted by id (faithful port of the old `INSERT OR REPLACE`). Returns
 * `{ count }` per taxonomy §5, not the rows (the client already holds them).
 */
export const TransactionBulkPut = Schema.Struct({
	records: Schema.Array(Transaction),
});
export type TransactionBulkPut = typeof TransactionBulkPut.Type;

/**
 * Bulk id-list payload — `{ ids }`, shared by `bulkDelete` and `bulkGet`. Both
 * stay `POST` (the id list rides in the body, not a long `?ids=` query;
 * taxonomy §5 flags bulk-get's POST-as-read exception).
 */
export const TransactionBulkIds = Schema.Struct({
	ids: Schema.Array(TransactionId),
});
export type TransactionBulkIds = typeof TransactionBulkIds.Type;

/**
 * `bulkDelete` / `bulkPut` / `deleteBy*` success body — rows affected. A bulk
 * delete deliberately breaks the "delete → 204" rule (taxonomy §5): the deleted
 * count is useful information (some ids may not exist).
 */
export const TransactionAffected = Schema.Struct({ count: Schema.Number });

/**
 * `link-transfer` payload — the set of transaction ids to group as one internal
 * transfer (PRD #48). Reuses the `{ ids }` shape of {@link TransactionBulkIds},
 * but is its own type so the two surfaces can evolve independently: the server
 * validates this set atomically (≥2 legs, all ids real, none already grouped,
 * none a refund, amounts summing to zero in cents), computes `min(ids)` as the
 * group id, and stamps every leg — the multi-row operation the generic
 * single-row update cannot express.
 */
export const TransferLink = Schema.Struct({
	ids: Schema.Array(TransactionId),
});
export type TransferLink = typeof TransferLink.Type;

/**
 * `unlink-transfer` payload — the group id (one of the legs' ids, the smallest)
 * whose membership is being dissolved. Clearing `transferGroupId` on every leg
 * of the group reverts them to normal transactions (they count as spend again).
 */
export const TransferUnlink = Schema.Struct({
	transferGroupId: TransactionId,
});
export type TransferUnlink = typeof TransferUnlink.Type;

/**
 * `bundle` payload (issue #68) — the set of transaction ids to treat as **one**,
 * plus the `label` the resulting **bundle parent** carries. The server validates
 * the set atomically (≥2 distinct members, all ids real, none already bundled),
 * then writes one synthetic row whose amount is the members' sum and whose date
 * is the earliest member's, and stamps `bundleId` on each member — the multi-row
 * operation the generic single-row `create` cannot express.
 *
 * `label` is `minLength(1)`, so an empty one fails decode (400) at the boundary
 * rather than producing a nameless row; the server trims it before storing it in
 * the parent's `rawIssuerString`, which already means *the human-readable name of
 * this row* and is already what the UI falls back to when there is no issuer.
 * Issuer and category are deliberately NOT accepted here: a fresh bundle is
 * uncurated like any other row, and every existing edit surface can set them.
 */
export const BundleCreate = Schema.Struct({
	ids: Schema.Array(TransactionId),
	label: Schema.String.pipe(Schema.minLength(1)),
});
export type BundleCreate = typeof BundleCreate.Type;

/**
 * `bundle/add-member` payload (issue #74) — one existing transaction joining one
 * existing **bundle**. A bundle is not finished at creation: the refund lands a
 * week later, or someone pays back in two instalments. One row at a time rather
 * than a set, because this is also the escape hatch for the table's page-scoped
 * selection — a member hundreds of rows away from the rest is reached from its
 * own detail page, not by scrolling the two into the same page.
 *
 * Refused (422) when either id is unknown, when `bundleId` is not a **bundle
 * parent**, when the row already belongs to a bundle, or when the row is itself
 * a parent. On success the parent's amount and default date are recomputed.
 */
export const BundleMemberAdd = Schema.Struct({
	bundleId: TransactionId,
	transactionId: TransactionId,
});
export type BundleMemberAdd = typeof BundleMemberAdd.Type;

/**
 * `bundle/remove-member` payload (issue #74) — the member leaving. Its bundle is
 * implied: a row belongs to at most one, so naming it as well would let a caller
 * state a pair that disagrees. The member returns to the list as an ordinary
 * row, keeping the issuer, category and notes bundling never touched; the parent
 * it left is recomputed, and **dissolved** if fewer than two members remain.
 */
export const BundleMemberRemove = Schema.Struct({
	transactionId: TransactionId,
});
export type BundleMemberRemove = typeof BundleMemberRemove.Type;

/**
 * `bundle/dissolve` payload (issue #74) — the **bundle parent** to dissolve. The
 * parent row is deleted and every member released; the members are bank rows and
 * are never deleted with it. Idempotent, like `unlink-transfer`: an unknown id
 * (or one that is not a parent) releases nothing and is not an error.
 */
export const BundleDissolve = Schema.Struct({
	bundleId: TransactionId,
});
export type BundleDissolve = typeof BundleDissolve.Type;

/**
 * One candidate counterpart of a debit leg (issue #91): the credit row itself
 * plus `daysApart`, the whole number of days between the two dates — the signal
 * that ranks one candidate above another ("same day" beats "4 days apart") and
 * the reason the list is ordered the way it is.
 */
export class TransferCounterpart extends Schema.Class<TransferCounterpart>(
	"TransferCounterpart",
)({
	transaction: Transaction,
	daysApart: Schema.Number,
}) {}

/**
 * One **detected** (not yet confirmed) internal transfer (PRD #48, reshaped by
 * issue #91): a debit `leg` together with every credit that might be its
 * counterpart, closest-date first.
 *
 * It used to be a flat pair (`from`/`to`/`daysApart`), one entry per pair. A
 * debit matching three credits then read as three near-identical rows, when it
 * is **one decision** — the user picks at most one of the three, and picking one
 * settles the other two. Grouping is therefore the shape both surfaces want, and
 * deriving it client-side in two places is duplication that drifts.
 *
 * `leg` is **always the debit** (a negative amount): the server orients by sign
 * so each real pair is surfaced exactly once, never both A→B and B→A. A credit
 * consequently never appears as a `leg` — the client indexes the same payload
 * both ways to mark credit rows too. Every row here is eligible and ungrouped by
 * construction; confirming a pair calls `link-transfer`, which re-validates it,
 * and a **dismissed pair** ({@link TransferDismiss}) is never offered again.
 */
export class TransferCandidate extends Schema.Class<TransferCandidate>(
	"TransferCandidate",
)({
	leg: Transaction,
	counterparts: Schema.Array(TransferCounterpart),
}) {}

/**
 * One **dismissed pair** (issue #91) — a (debit, credit) pairing the user has
 * refused as a transfer. Ordered debit-first, matching the stored orientation:
 * the client normalises before sending, so the server never has to guess which
 * id is which side.
 */
export const TransferPair = Schema.Struct({
	debitId: TransactionId,
	creditId: TransactionId,
});
export type TransferPair = typeof TransferPair.Type;

/**
 * `dismiss-transfer-pairs` payload (issue #91) — the pairs the user has just
 * refused. Detection itself stays live (a fresh server-side query on every
 * read); what becomes persistent is the **refusal**, so a coincidence cleared
 * once stays cleared instead of being re-derived forever.
 *
 * An **array**, not a single leg id, for two reasons. Dismissal is a group-level
 * action — the panel showed N counterparts, so one gesture writes N pairs in one
 * request — and the client sends the exact pairs it **displayed**: expanding a
 * "group" server-side from one leg id would let the server's idea of the group
 * differ from what was on screen if the data moved between the read and the
 * write. An empty array writes nothing and is not an error.
 *
 * Idempotent: re-dismissing a stored pair is a no-op, so the returned `count` is
 * the number of pairs **newly** stored.
 */
export const TransferDismiss = Schema.Struct({
	pairs: Schema.Array(TransferPair),
});
export type TransferDismiss = typeof TransferDismiss.Type;

/**
 * `bundleImpact` query params — both **required** (a targeted question about one
 * statement, not a filtered list): `accountId` decodes a branded id from the
 * query string, `importMonth` is the `"YYYY-MM"` string. A missing param fails
 * decode → `HttpApiDecodeError (400)`.
 *
 * Here — unlike the list/count filter of the same name (issue #87) —
 * `importMonth` really is the **column**: what this route asks about is a
 * *statement*, the set of rows one import produced, so the stamp is exactly the
 * right key and a row dated outside it is still part of that statement.
 */
export const TransactionByAccountMonth = Schema.Struct({
	accountId: numFromStr(AccountId),
	importMonth: Schema.String,
});

/**
 * `bundle-impact` success body (issue #77) — how many **bundles** hold a row of
 * one account + month, i.e. how many would be **dissolved** by deleting that
 * statement's rows.
 *
 * A **bundle parent** is a row in the transactions table like any other, so a
 * delete that takes its members takes the bundling with it — and a bundle
 * spanning two months or two accounts is only *partly* inside the target, which
 * is why this is a server-side count and not something a client can infer from
 * the page it happens to have fetched. Re-attaching members afterwards is manual
 * (there is no dedup key on a transaction to re-match them by), so the number is
 * meant to be shown *before* the rows go.
 *
 * It is no longer an import pre-flight: committing an import deletes nothing
 * (issue #88), so nothing about a commit dissolves a bundle. It stays as the
 * pre-flight of a **deliberate** delete of a statement's rows.
 */
export const BundleImpact = Schema.Struct({ count: Schema.Number });

/**
 * Transactions group (contract §2.5), prefix `/transactions` — the **core**:
 * composable `list`/`count`, `getById`, `create`, `update`, `remove`. The bulk +
 * targeted-delete endpoints (bulkCreate/bulkPut/bulkDelete/bulkGet,
 * deleteByImportBatch) are added to this same group by the follow-up "Port
 * transactions bulk" ticket, which builds on this handler layer.
 *
 * No transaction field has a DB uniqueness constraint, so writes declare no
 * `Conflict`. `getById`/`update`/`remove` 404 on a missing id; `remove` → 204.
 * `count` shares `list`'s filter set minus pagination/order.
 *
 * `create`/`bulkCreate`/`update` declare `CategoryNotLeaf`: a transaction's
 * `categoryId` must be an assignable **leaf** (a category with no children),
 * never a **folder** — the **Leaf-assignable invariant** (ADR 0003), at any
 * depth, the same one the issuer door enforces. A folder-categorised row hangs
 * money off a node the category rollup visits but never counts, understating the
 * total with no error on screen.
 */
export class TransactionsGroup extends HttpApiGroup.make("transactions")
	.add(
		HttpApiEndpoint.get("list")`/transactions`
			.setUrlParams(
				Schema.Struct({
					...Pagination,
					...TransactionFilters,
					...TransactionListOrder,
				}),
			)
			.addSuccess(PagedTransactions),
	)
	.add(
		HttpApiEndpoint.get("count")`/transactions/count`
			.setUrlParams(Schema.Struct(TransactionFilters))
			.addSuccess(TransactionCount),
	)
	// Every DETECTED (not yet confirmed) internal transfer across the whole
	// dataset (PRD #48) — read once and shared by the Transfers page, the
	// transactions table's row indicator and the detail page (issue #91). One SQL
	// self-join pairs each ungrouped, non-refund debit with its ungrouped,
	// non-refund credit of equal magnitude (to the cent), a different account, and
	// a date within `TRANSFER_DATE_WINDOW_DAYS`, then groups the pairs under their
	// debit leg. Oriented by sign (`leg` = debit) so each real pair is returned
	// exactly once, never both ways. **Dismissed pairs are excluded** — that is
	// what makes a refusal permanent rather than a per-session filter. Legs
	// ordered by their closest counterpart, counterparts closest-date first. A
	// literal sub-path, declared before the `:id` route so it is never shadowed.
	.add(
		HttpApiEndpoint.get(
			"transferCandidates",
		)`/transactions/transfer-candidates`.addSuccess(
			Schema.Array(TransferCandidate),
		),
	)
	// The **recap** (issue #71): spend for one period and account selection,
	// aggregated by issuer and by category over the WHOLE filtered set — no page,
	// no row cap, no `truncated` caveat. Which rows count is the server's single
	// `countsTowardRecap` predicate (not a transfer leg, not excluded, not
	// duplicate-excluded, not a bundle member), defined once beside the
	// derived-category and derived-exclusion expressions, so the recap and the
	// list can never disagree about what "counts toward spend" means. Another
	// literal sub-path, declared before the `:id` route.
	.add(
		HttpApiEndpoint.get("recap")`/transactions/recap`
			.setUrlParams(Schema.Struct(RecapFilters))
			.addSuccess(RecapSummary),
	)
	// The months the recap can be asked about — the period picker's options,
	// derived from the transaction `date` exactly as the period bounds are.
	.add(
		HttpApiEndpoint.get("recapPeriods")`/transactions/recap-periods`.addSuccess(
			RecapPeriods,
		),
	)
	// The pre-flight of deleting a statement's rows (issue #77): how many
	// **bundles** hold a row of that account + month, asked before the rows go so
	// the bundling is never destroyed silently. A read, so `GET` — and another
	// literal sub-path, declared before the `:id` route.
	.add(
		HttpApiEndpoint.get("bundleImpact")`/transactions/bundle-impact`
			.setUrlParams(TransactionByAccountMonth)
			.addSuccess(BundleImpact),
	)
	.add(
		HttpApiEndpoint.get(
			"getById",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}`
			.addSuccess(Transaction)
			.addError(NotFound),
	)
	// Suggest the counterpart legs of an internal transfer for one row (PRD
	// #48): the server scans the DB for rows with the opposite sign, an equal
	// magnitude to the cent, a different account, no existing transfer group, no
	// refund involvement, and a date within `TRANSFER_DATE_WINDOW_DAYS` of this
	// row's — run in SQL so it sees the whole dataset (not just a loaded page).
	// 404s an unknown id; an **ineligible** row (already grouped, or a refund)
	// yields an empty array — there is nothing to suggest, which is not an error.
	// Nearest-date first, and **dismissed pairs** are excluded here exactly as
	// they are from `transferCandidates`: a refusal is about the pairing, not
	// about which endpoint asked.
	//
	// No web caller since issue #91 — every surface reads the grouped
	// `transferCandidates` instead, so the three of them cannot disagree. Kept as
	// the single-row form of the same question, and kept honest about dismissals
	// so it stays safe to pick up.
	.add(
		HttpApiEndpoint.get(
			"transferSuggestions",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}/transfer-suggestions`
			.addSuccess(Schema.Array(Transaction))
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.post("create")`/transactions`
			.setPayload(TransactionCreate)
			.addSuccess(Transaction, { status: 201 })
			.addError(CategoryNotLeaf),
	)
	.add(
		HttpApiEndpoint.post("bulkCreate")`/transactions/bulk`
			.setPayload(TransactionBulkCreate)
			.addSuccess(Schema.Array(Transaction), { status: 201 })
			.addError(CategoryNotLeaf),
	)
	.add(
		HttpApiEndpoint.put(
			"update",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}`
			.setPayload(TransactionUpdate)
			.addSuccess(Transaction)
			.addError(NotFound)
			.addError(CategoryNotLeaf),
	)
	.add(
		HttpApiEndpoint.put("bulkPut")`/transactions/bulk-put`
			.setPayload(TransactionBulkPut)
			.addSuccess(TransactionAffected),
	)
	.add(
		HttpApiEndpoint.del(
			"remove",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}`
			.addSuccess(HttpApiSchema.NoContent)
			.addError(NotFound),
	)
	// The Matching Rule preview's per-row "remove manual issuer" action
	// (PRD #8 story 10): clears the row's manual issuer, then re-derives it
	// against the current rule set — it becomes unmatched (or claimed by an
	// existing rule) and, crucially, rule-eligible again. Returns the updated row.
	.add(
		HttpApiEndpoint.post(
			"removeManualIssuer",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}/remove-manual-issuer`
			.addSuccess(Transaction)
			.addError(NotFound),
	)
	// `bulkDelete` / `bulkGet` stay POST — the id list rides in the body.
	.add(
		HttpApiEndpoint.post("bulkDelete")`/transactions/bulk-delete`
			.setPayload(TransactionBulkIds)
			.addSuccess(TransactionAffected),
	)
	.add(
		HttpApiEndpoint.post("bulkGet")`/transactions/bulk-get`
			.setPayload(TransactionBulkIds)
			.addSuccess(Schema.Array(Transaction)),
	)
	// Drop a whole **import batch** — the one targeted delete left, and the one
	// undo an import has. There is deliberately no delete-an-account-month route
	// (issue #88): it existed only for the import commit, which now deletes
	// nothing, and keeping it would leave the data loss it caused one caller away.
	.add(
		HttpApiEndpoint.del(
			"deleteByImportBatch",
		)`/transactions/by-import-batch/${HttpApiSchema.param("batchId", Schema.String)}`.addSuccess(
			TransactionAffected,
		),
	)
	// Link/unlink internal transfers (PRD #48), the atomic multi-row operations
	// the generic single-row `update` cannot express. `linkTransfer` validates
	// the set server-side and fails `TransferInvalid` (422) — a dedicated error,
	// not an overloaded `NotFound` — on any of: <2 legs, a non-zero cent sum, an
	// unknown id, a leg already grouped, a refund leg, or a leg that is bundled
	// (`is-bundled`, either bundle role — the transfer side of the exclusivity,
	// issue #75). Both return the count of legs stamped/cleared.
	.add(
		HttpApiEndpoint.post("linkTransfer")`/transactions/link-transfer`
			.setPayload(TransferLink)
			.addSuccess(TransactionAffected)
			.addError(TransferInvalid),
	)
	.add(
		HttpApiEndpoint.post("unlinkTransfer")`/transactions/unlink-transfer`
			.setPayload(TransferUnlink)
			.addSuccess(TransactionAffected),
	)
	// Refuse a set of detected pairs (issue #91) → `{ count }` newly stored. The
	// only *write* the suggestion path has that is not a link: detection is
	// recomputed on every read, so the sole thing worth persisting is the user's
	// refusal. A dismissed pair drops out of `transferCandidates` for good.
	//
	// A POST rather than a DELETE: it *creates* **dismissed pair** rows. Nothing
	// is validated beyond the ids being ids — a pair naming a row that has since
	// gone simply never matches anything, and an unknown id is not worth a 422 for
	// an action whose whole job is to make suggestions go away.
	.add(
		HttpApiEndpoint.post(
			"dismissTransferPairs",
		)`/transactions/dismiss-transfer-pairs`
			.setPayload(TransferDismiss)
			.addSuccess(TransactionAffected),
	)
	// Create a **bundle** from a set of rows (issue #68) — the other atomic
	// multi-row operation. Unlike `link-transfer` it *creates* a row: the
	// **bundle parent** it returns (201, like every other create) is the whole
	// point, since a bundle nets to a non-zero amount that needs somewhere to
	// live. Fails `BundleInvalid` (422) — its own error, not `TransferInvalid`:
	// none of the transfer's balance rules apply — on <2 distinct members, an
	// unknown id, a row already bundled, a row that is itself a parent, or a row
	// that is a transfer leg (`is-transfer-leg`, the bundling side of the same
	// exclusivity — the two directions keep their own error type by the decision
	// on issue #81, recorded on `BundleInvalid`).
	.add(
		HttpApiEndpoint.post("createBundle")`/transactions/bundle`
			.setPayload(BundleCreate)
			.addSuccess(Transaction, { status: 201 })
			.addError(BundleInvalid),
	)
	// Membership is mutable (issue #74): a bundle is not finished at creation, so
	// a row can join one, leave one, and the whole bundle can be dissolved. All
	// three recompute the parent through the ONE derivation routine — the single
	// point where a bundle's number could go stale — and a bundle left with fewer
	// than two members is dissolved rather than kept as a parent standing for a
	// single transaction.
	//
	// `add-member` returns the **recomputed parent** (the row whose number moved);
	// `remove-member` returns the **released row**, now ordinary again. Both fail
	// `BundleInvalid` (422). `dissolve` returns the count of members released and
	// is idempotent, like `unlink-transfer`.
	.add(
		HttpApiEndpoint.post("addBundleMember")`/transactions/bundle/add-member`
			.setPayload(BundleMemberAdd)
			.addSuccess(Transaction)
			.addError(BundleInvalid),
	)
	.add(
		HttpApiEndpoint.post(
			"removeBundleMember",
		)`/transactions/bundle/remove-member`
			.setPayload(BundleMemberRemove)
			.addSuccess(Transaction)
			.addError(BundleInvalid),
	)
	.add(
		HttpApiEndpoint.post("dissolveBundle")`/transactions/bundle/dissolve`
			.setPayload(BundleDissolve)
			.addSuccess(TransactionAffected),
	)
	.annotateContext(OpenApi.annotations({ title: "Transactions" })) {}
