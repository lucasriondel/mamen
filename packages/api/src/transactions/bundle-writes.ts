import type { SqlClient } from "@effect/sql";
import type { Fragment } from "@effect/sql/Statement";
import {
	type AnomalyFlag,
	BundleInvalid,
	type Transaction,
	TransactionId,
	type TransactionKind,
} from "@mamen/shared/contract";
import { Clock, Effect, Option } from "effect";
import { orDieSql } from "../db/errors";
import { bundleAnomalyFlags, deriveBundleParent } from "./bundle-derivation";
import type { WriteRow } from "./repository";

/**
 * What the eligibility cascade reads off a candidate **bundle member**.
 * Structural rather than the whole `Transaction`, for the same reason
 * {@link ./bundle-derivation.BundleMemberFacts} is: a stored row, a wire entity
 * or a test fixture can be asked without any of them having to be the others.
 */
export type BundleCandidate = {
	kind?: TransactionKind;
	bundleId?: number;
	transferGroupId?: number;
};

/**
 * Whether a set of rows may become **bundle members** — the ONE statement of the
 * three rules (issue #83), returning the {@link BundleInvalid} reason the set
 * earns, or `undefined` when every row is eligible.
 *
 * - **already-bundled** — a row already carries a `bundleId`. A member belongs to
 *   at most one bundle: two parents each summing it would each be right about a
 *   different number.
 * - **nested-bundle** — a row is itself a **bundle parent** (issue #74). The
 *   outer parent only recomputes when its OWN membership changes, so editing the
 *   inner one would leave the outer total stale — a second place a bundle's
 *   number could drift, which the single shared recompute exists to prevent. For
 *   `addBundleMember` this also covers adding a bundle to itself, which is the
 *   same rule.
 * - **is-transfer-leg** — a row already belongs to a **transfer group** (issue
 *   #75). A row is claimed by at most ONE grouping: a transfer leg contributes
 *   nothing to the recap (its group nets to zero) while a member contributes
 *   through its parent at a non-zero sum, so a row holding both would be netted
 *   out by the transfer partition while its parent still displayed its share.
 *
 * Stated in **set** form only. `createBundle` validates a set and
 * `addBundleMember` a single row, but that is a difference in how many rows are
 * in hand, not in what is asked of them — so adding one member is this cascade
 * over a set of one, and the two paths cannot come to disagree about what a
 * member is.
 *
 * Each reason is asked of the whole set before the next one is, which is
 * `createBundle`'s existing order kept exactly: a mixed set earns the same
 * refusal it earned before the two copies were collapsed.
 *
 * Deliberately NOT here: `unknown-id` and `not-a-bundle`. Those are about the
 * *read* — an id that named no row, or a target that is not a parent — and are
 * answered by the caller that did the reading, before any candidate exists.
 * Neither is `too-few-members`, which is a count of the set rather than a fact
 * about any row in it.
 */
export const bundleMemberRefusal = (
	candidates: ReadonlyArray<BundleCandidate>,
): BundleInvalid["reason"] | undefined => {
	if (candidates.some((c) => c.bundleId !== undefined))
		return "already-bundled";
	if (candidates.some((c) => c.kind === "bundle")) return "nested-bundle";
	if (candidates.some((c) => c.transferGroupId !== undefined))
		return "is-transfer-leg";
	return undefined;
};

/**
 * The table reads and writes the bundle rules are expressed over, handed in by
 * the repository rather than built here.
 *
 * The split is deliberate: this module owns what a **bundle** is — the rules, the
 * cascade, when a parent is recomputed or dissolved — while the repository owns
 * how a transaction is *stored*: the row shape, the flag encoding, the derived
 * read projection, the `issuers` join. Every dep below is one of those storage
 * concerns, already stripped of its `SqlError` ({@link orDieSql}) by the
 * repository, so nothing here has to know how a row becomes an entity.
 */
export type BundleWriteDeps = {
	readonly sql: SqlClient.SqlClient;
	/** The raw stored row by id — no derivation, the recompute's input. */
	readonly storedById: (
		id: typeof TransactionId.Type,
	) => Effect.Effect<Option.Option<Transaction>>;
	/** The raw stored rows of ONE parent's members. */
	readonly storedMembersOf: (
		parentId: typeof TransactionId.Type,
	) => Effect.Effect<ReadonlyArray<Transaction>>;
	/** A set of ids, read through the list's projection (partial existence). */
	readonly readByIds: (
		ids: ReadonlyArray<typeof TransactionId.Type>,
	) => Effect.Effect<ReadonlyArray<Transaction>>;
	/** The projected single read, for returning a row the caller just changed. */
	readonly readById: (
		id: typeof TransactionId.Type,
	) => Effect.Effect<Transaction>;
	/** Insert a row, returning it as the entity. */
	readonly insertRow: (row: WriteRow) => Effect.Effect<Transaction>;
	/** The `anomalyFlags` column's codec: an empty list is stored as `NULL`. */
	readonly encodeFlags: (flags: ReadonlyArray<AnomalyFlag>) => string | null;
};

/**
 * The **bundle write paths** (issue #83): create, add member, remove member,
 * dissolve, and the parent recompute every membership change ends in — in a
 * module of their own rather than inside the transactions repository's service
 * closure, which had grown to ~1900 lines and changed for listing, recap,
 * transfer and import reasons as well as these.
 *
 * The same shape {@link ./bundle-derivation} already showed for the pure part of
 * the domain, extended to the writes: the rules live here, the storage stays in
 * the repository and is handed in as {@link BundleWriteDeps}. The repository
 * delegates — including the delete routes, which reach `releaseBundleMembers`,
 * `recomputeBundleParent` and `dissolveBundlesTouching` through the same object
 * every endpoint does, so there is still exactly one recompute and one dissolve
 * in the system.
 *
 * No behaviour change: every rule below is the one that shipped, moved.
 */
export const bundleWrites = ({
	sql,
	storedById,
	storedMembersOf,
	readByIds,
	readById,
	insertRow,
	encodeFlags,
}: BundleWriteDeps) => {
	/**
	 * Release every member of the given **bundle parents** — clear `bundleId`,
	 * returning the rows to the top level of the list as ordinary transactions.
	 * Bundling never touched a member's own issuer, category or notes, so a
	 * released row comes back exactly as it went in. Returns how many were
	 * released; an empty set touches no DB (`sql.in([])` renders an invalid
	 * `IN ()`).
	 */
	const releaseBundleMembers = (
		parentIds: ReadonlyArray<number>,
	): Effect.Effect<number> =>
		parentIds.length === 0
			? Effect.succeed(0)
			: sql<{
					id: number;
				}>`UPDATE transactions SET bundleId = NULL WHERE ${sql.in("bundleId", parentIds)} RETURNING id`.pipe(
					orDieSql,
					Effect.map((rows) => rows.length),
				);

	/**
	 * Dissolve a **bundle** (issue #74): release every member and delete the
	 * **bundle parent**. The members are real bank rows — the parent stands for
	 * them, it does not own them — so they are never deleted with it, and they
	 * keep the identity bundling never touched.
	 *
	 * Idempotent, like `unlinkTransfer`: an id that is unknown, or that names a
	 * row which is not a parent, releases nothing and is not an error. The
	 * `kind` check is also what keeps a bank row's id from deleting that row.
	 */
	const dissolveBundle = (
		parentId: typeof TransactionId.Type,
	): Effect.Effect<{ count: number }> =>
		Effect.gen(function* () {
			const found = yield* storedById(parentId);
			if (Option.isNone(found) || found.value.kind !== "bundle")
				return { count: 0 };

			const count = yield* releaseBundleMembers([parentId]);
			yield* sql`DELETE FROM transactions WHERE id = ${parentId}`.pipe(
				orDieSql,
			);
			return { count };
		});

	/**
	 * The **bundle parents** whose bundle touches a set of rows (issue #77) —
	 * the ONE answer to "which bundles does this delete destroy", asked by the
	 * pre-flight count the import wizard shows AND by the delete that acts on
	 * it, so the warning and the action can never name different bundles.
	 *
	 * A bundle touches the scope when its **parent** sits in it (a bundle
	 * wholly inside the statement being replaced) *or* when any **member**
	 * does (a bundle spanning two months or two accounts, whose parent is
	 * stamped with the earliest member's and therefore lives elsewhere). Both
	 * cases fall out of one `COALESCE(t.bundleId, t.id)`: a matching member
	 * names its parent, a matching parent names itself — and a parent never
	 * carries a `bundleId`, since nesting is refused, so the choice is never
	 * ambiguous. `DISTINCT` is what makes this a count of **bundles**, not of
	 * the rows that reach them.
	 *
	 * `scope` is the same predicate the delete runs, handed in as a fragment
	 * rather than re-stated per caller.
	 */
	const bundlesTouching = (
		scope: Fragment,
	): Effect.Effect<ReadonlyArray<number>> =>
		sql<{
			parentId: number;
		}>`SELECT DISTINCT COALESCE(t.bundleId, t.id) AS parentId FROM transactions t
				WHERE ${scope} AND (t.kind = 'bundle' OR t.bundleId IS NOT NULL)`.pipe(
			orDieSql,
			Effect.map((rows) => rows.map((r) => r.parentId)),
		);

	/**
	 * Dissolve every bundle touching `scope`, through the shared
	 * {@link dissolveBundle} — so a re-import leaves no parent standing for a
	 * set that silently shrank, and no member pointing at a parent that is
	 * gone. Run BEFORE the delete: afterwards the rows in scope are ordinary,
	 * and what the statement removes is exactly the bank rows it replaces.
	 *
	 * Dissolving is the honest option of the three (issue #77). Exempting
	 * parents from the delete would leave them summing member ids that no
	 * longer exist; re-attaching members by fingerprint would invent an
	 * identity transactions do not have, and would silently mis-match a
	 * statement that genuinely changed. Re-bundling is manual, which is
	 * acceptable because re-importing an already-curated month is rare — but
	 * only because the repository's `bundleImpact` says so first.
	 */
	const dissolveBundlesTouching = (scope: Fragment): Effect.Effect<void> =>
		bundlesTouching(scope).pipe(
			Effect.flatMap((parentIds) =>
				Effect.forEach(
					parentIds,
					(id) => dissolveBundle(TransactionId.make(id)),
					{
						discard: true,
					},
				),
			),
		);

	/**
	 * Recompute a **bundle parent** from its members — the SINGLE point where a
	 * bundle's number can go stale (issue #74), so every path that changes
	 * membership goes through it: adding a member, removing one, and deleting a
	 * member by any of the delete routes.
	 *
	 * The arithmetic itself is not restated here: it is
	 * {@link deriveBundleParent}, the same pure routine `createBundle` writes
	 * its first parent with, handed the parent's own row so a `manualDate`
	 * override survives (#72 — the derived date is a starting point, not a
	 * constraint).
	 *
	 * **Under two members the bundle dissolves** rather than being recomputed:
	 * a parent standing for a single transaction is that transaction with extra
	 * steps, and one standing for none has no number to hold at all. That is
	 * the same rule the repository's `dissolveUndersizedGroups` applies to
	 * transfer legs, on the grouping this module's neighbour owns.
	 *
	 * Returns whether the parent **survived** — `false` when it dissolved, and
	 * also when the id names no parent at all (already deleted, or never one),
	 * which is what makes calling this after a bulk delete safe.
	 */
	const recomputeBundleParent = (
		parentId: typeof TransactionId.Type,
	): Effect.Effect<boolean> =>
		Effect.gen(function* () {
			const found = yield* storedById(parentId);
			if (Option.isNone(found) || found.value.kind !== "bundle") return false;

			const members = yield* storedMembersOf(parentId);
			if (members.length < 2) {
				yield* dissolveBundle(parentId);
				return false;
			}

			// Unreachable with ≥2 members in hand, and it means what the check
			// above means: a bundle standing for nothing has nothing to derive.
			const derived = deriveBundleParent(members, found.value);
			if (derived === undefined) return false;

			// The **non-negative bundle** flag (issue #76) moves with the amount,
			// and is written in the same statement: a bundle is a cost told in
			// several rows, so a sum that is zero or a credit is worth warning
			// about — and it is *this* recompute that just made it one, or just
			// stopped it being one. Through the same shared routine every writer
			// uses, over the parent's own flags so an unrelated one is untouched.
			const flags = bundleAnomalyFlags(
				derived.amount,
				found.value.anomalyFlags,
				new Date(yield* Clock.currentTimeMillis),
			);
			yield* sql`UPDATE transactions SET amount = ${derived.amount}, date = ${derived.date.toISOString()}, accountId = ${derived.accountId}, importMonth = ${derived.importMonth}, anomalyFlags = ${encodeFlags(flags)} WHERE id = ${parentId}`.pipe(
				orDieSql,
			);
			return true;
		});

	/** The cascade as a refusal: eligible rows pass, the first reason fails. */
	const requireEligible = (
		candidates: ReadonlyArray<BundleCandidate>,
	): Effect.Effect<void, BundleInvalid> => {
		const reason = bundleMemberRefusal(candidates);
		return reason === undefined
			? Effect.void
			: Effect.fail(new BundleInvalid({ reason }));
	};

	/**
	 * Create a **bundle** from a set of rows (issue #68): several transactions
	 * treated as ONE for the recap — 200 € of groceries and the 150 € friends
	 * paid back is one 50 € weekend, not a large debit filed apart from an
	 * unexplained credit. Writes the **bundle parent**, a synthetic row in this
	 * same table (`kind = 'bundle'`), and stamps `bundleId` on every member.
	 *
	 * The parent is *derived from* its members, never independent of them:
	 *
	 * - **amount** — their sum, computed in integer cents (amounts are float
	 *   euros, never added as floats — the discipline `linkTransfer` and the
	 *   value-matcher use). Recomputed, not accumulated: when a later slice adds
	 *   a member, the number simply changes.
	 * - **date** — the earliest member's (ties broken by the smaller id, so the
	 *   choice is deterministic), because the cost belongs to when the money was
	 *   spent, not to when the last person settled up.
	 * - **accountId / importMonth** — taken from that same earliest member, so
	 *   the parent sits where the row it takes its date from sits, rather than
	 *   inventing an account or a statement month that no import produced.
	 *
	 * `rawIssuerString` holds the (trimmed) label — that field already means
	 * *the human-readable name of this row* and is already the display fallback
	 * when there is no issuer. Issuer, category and notes are left unset: a
	 * fresh bundle is uncurated like any other row, and every edit surface that
	 * works on a transaction already works on this one.
	 *
	 * Fails {@link BundleInvalid} — never a partial write — on fewer than 2
	 * **distinct** members, an unknown id, or any row the shared
	 * {@link bundleMemberRefusal} cascade turns away.
	 */
	const createBundle = (
		rawIds: ReadonlyArray<typeof TransactionId.Type>,
		label: string,
	): Effect.Effect<Transaction, BundleInvalid> =>
		Effect.gen(function* () {
			const ids = [...new Set(rawIds)];
			if (ids.length < 2)
				return yield* Effect.fail(
					new BundleInvalid({ reason: "too-few-members" }),
				);

			const members = yield* readByIds(ids);
			if (members.length !== ids.length)
				return yield* Effect.fail(new BundleInvalid({ reason: "unknown-id" }));
			yield* requireEligible(members);

			// The parent's number and its date come from the ONE derivation
			// routine (issue #72), never a copy of it here: every later
			// membership change recomputes through the same function, so a
			// bundle's total cannot go stale on one path and not another. A
			// fresh bundle carries no date override, so nothing is passed.
			// `undefined` is unreachable (the ≥2 check above already ran), and
			// it means the same thing the check does: a bundle standing for
			// nothing has no number to hold.
			const derived = deriveBundleParent(members);
			if (derived === undefined)
				return yield* Effect.fail(
					new BundleInvalid({ reason: "too-few-members" }),
				);

			const now = new Date(yield* Clock.currentTimeMillis);
			const parent = yield* insertRow({
				accountId: derived.accountId,
				date: derived.date.toISOString(),
				amount: derived.amount,
				rawIssuerString: label.trim(),
				issuerId: null,
				categoryId: null,
				manualCategory: 0,
				manualIssuer: 0,
				isRefund: 0,
				linkedRefundId: null,
				transferGroupId: null,
				kind: "bundle",
				bundleId: null,
				// A fresh parent is dated by its members, not by hand (issue #72):
				// the derived date is the starting point the user may later override.
				manualDate: 0,
				// A bundle can be born non-negative — the whole selection may have
				// been the wrong rows — so the flag is derived here too (issue #76),
				// through the same routine every recompute uses.
				anomalyFlags: encodeFlags(bundleAnomalyFlags(derived.amount, [], now)),
				isDuplicateExcluded: 0,
				duplicateNote: null,
				excludedFromRecap: 0,
				manualExcluded: 0,
				notes: null,
				// The synthetic row entered the system now; its *date* is the
				// members' business, its import stamp is this write's.
				importedAt: now.toISOString(),
				importMonth: derived.importMonth,
				importBatchId: null,
			});

			yield* sql`UPDATE transactions SET bundleId = ${parent.id} WHERE ${sql.in("id", ids)}`.pipe(
				orDieSql,
			);
			return parent;
		});

	/**
	 * Add an existing transaction to an existing **bundle** (issue #74). A
	 * bundle is not finished at creation: the refund lands a week later, or
	 * someone pays back in two instalments. One row at a time — this is also
	 * the way past the table's page-scoped selection, so a member hundreds of
	 * rows from the rest is reached from its own detail page.
	 *
	 * Refuses, writing nothing, when either id is unknown, when the target is
	 * not a **bundle parent**, or when the row itself fails the shared
	 * {@link bundleMemberRefusal} cascade — the same three rules `createBundle`
	 * asks, over a set of one.
	 *
	 * On success the parent is recomputed through the ONE routine and returned
	 * as the list projects it, so the caller sees the number that moved.
	 */
	const addBundleMember = (
		bundleId: typeof TransactionId.Type,
		transactionId: typeof TransactionId.Type,
	): Effect.Effect<Transaction, BundleInvalid> =>
		Effect.gen(function* () {
			const parent = yield* storedById(bundleId);
			if (Option.isNone(parent))
				return yield* Effect.fail(new BundleInvalid({ reason: "unknown-id" }));
			if (parent.value.kind !== "bundle")
				return yield* Effect.fail(
					new BundleInvalid({ reason: "not-a-bundle" }),
				);

			const member = yield* storedById(transactionId);
			if (Option.isNone(member))
				return yield* Effect.fail(new BundleInvalid({ reason: "unknown-id" }));
			// `nested-bundle` covers adding a bundle to itself, which is the same
			// rule: the row named is a parent, whichever parent it is.
			yield* requireEligible([member.value]);

			yield* sql`UPDATE transactions SET bundleId = ${bundleId} WHERE id = ${transactionId}`.pipe(
				orDieSql,
			);
			// The set just grew, so it holds at least this row: a parent that does
			// NOT survive the recompute had none before, which is a bundle there
			// was nothing to join. The dissolve has already released this row.
			const survived = yield* recomputeBundleParent(bundleId);
			if (!survived)
				return yield* Effect.fail(
					new BundleInvalid({ reason: "too-few-members" }),
				);
			return yield* readById(bundleId);
		});

	/**
	 * Remove a **bundle member** from its bundle (issue #74), returning it to
	 * the list as an ordinary row — with the issuer, category and notes
	 * bundling never touched, so it comes back exactly as it went in.
	 *
	 * The bundle is implied rather than named: a row belongs to at most one, so
	 * a caller stating both could state a pair that disagrees. The parent is
	 * recomputed through the ONE routine, which **dissolves** it if fewer than
	 * two members are left — a bundle standing for a single transaction is that
	 * transaction with extra steps.
	 */
	const removeBundleMember = (
		transactionId: typeof TransactionId.Type,
	): Effect.Effect<Transaction, BundleInvalid> =>
		Effect.gen(function* () {
			const member = yield* storedById(transactionId);
			if (Option.isNone(member))
				return yield* Effect.fail(new BundleInvalid({ reason: "unknown-id" }));
			const parentId = member.value.bundleId;
			if (parentId === undefined)
				return yield* Effect.fail(
					new BundleInvalid({ reason: "not-a-member" }),
				);

			yield* sql`UPDATE transactions SET bundleId = NULL WHERE id = ${transactionId}`.pipe(
				orDieSql,
			);
			yield* recomputeBundleParent(parentId);
			return yield* readById(transactionId);
		});

	return {
		releaseBundleMembers,
		dissolveBundle,
		bundlesTouching,
		dissolveBundlesTouching,
		recomputeBundleParent,
		createBundle,
		addBundleMember,
		removeBundleMember,
	} as const;
};
