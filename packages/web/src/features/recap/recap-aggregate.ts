import type { Category, Issuer, Transaction } from "@mamen/shared/contract";
import { resolveCategoryColors } from "@/lib/category-tree";

/**
 * One row of a recap spend section (issue #35): a named bucket — an issuer or a
 * category — with the total money spent against it over the active filters.
 *
 * `spent` is a **positive** magnitude of expenses (see {@link aggregateSpend}),
 * so the sections rank naturally high→low and read as "money out". `count` is
 * how many spending transactions fell in the bucket, shown alongside the total.
 */
export interface SpendRow {
	/** Stable key for React lists and sort tiebreaks — the entity id, or `null`. */
	id: number | null;
	/** The bucket's display name (the issuer/category name, or an "Unassigned" label). */
	name: string;
	/** Total money spent in the bucket — a positive magnitude in euros. */
	spent: number;
	/** How many spending transactions fell in the bucket. */
	count: number;
	/** Issuer image URL (root-relative `/uploads/issuers/…`), for the by-issuer section. */
	imageUrl?: string;
	/**
	 * The issuer's **issuer default category** id, for the by-issuer section — the
	 * second rung of the **Avatar fallback chain** (issue #59). Carried as an *id*
	 * rather than a resolved icon/colour pair, unlike the category rows below: the
	 * avatar owns that resolution, so handing it a pre-resolved pair would put a
	 * second copy of the chain here.
	 */
	defaultCategoryId?: number;
	/** The category's **Icon name** (a Lucide id), for the by-category section. */
	icon?: string;
	/**
	 * The category's **Resolved colour** — resolved here, where the whole tree is
	 * in hand, because `color` may be null and mean *inherit* (ADR 0006). Carried
	 * on the row so the section renders a colour it is handed rather than
	 * re-deriving one from a lookup it does not have.
	 */
	color?: string;
}

/** The visual identity a bucket resolves to: its name plus an optional avatar. */
type BucketIdentity = {
	name: string;
	imageUrl?: string;
	defaultCategoryId?: number;
	icon?: string;
	color?: string;
};

/**
 * The internal-transfer movement excluded from the spend breakdowns (PRD #48).
 * `total` is the money that moved between the user's own accounts — the sum of
 * the magnitudes of the **debit** legs (see {@link aggregateSpend}), so a clean
 * -30/+30 pair reads as 30, not a net ~0 nor a doubled 60. `count` is how many
 * transfer legs fell in the current view.
 */
export interface TransferSummary {
	/** Money moved between accounts — sum of the debit legs' magnitudes, in euros. */
	total: number;
	/** How many transfer legs are present in the current view. */
	count: number;
}

/** The two spend breakdowns the recap page shows, each already summed per bucket. */
export interface RecapSpend {
	byIssuer: SpendRow[];
	byCategory: SpendRow[];
	/** The internal-transfer legs netted out of the breakdowns, summarised. */
	transfers: TransferSummary;
}

/** The label a spend row carries when a transaction has no issuer / category. */
export const UNASSIGNED_LABEL = "Unassigned";

/**
 * Is this transaction spending? Amounts are signed (debits negative, credits
 * positive — the app's convention). Spend is money **out**, so only negative
 * amounts count; income and zero-value rows are ignored. Refunds already net out
 * because a refund is a positive amount against the same buckets.
 */
function isSpend(txn: Transaction): boolean {
	return txn.amount < 0;
}

/**
 * Is this transaction a leg of an internal transfer (PRD #48)? Legs carry a
 * `transferGroupId` (set once the user groups them); they are money moving
 * between the user's own accounts, not spending, so the aggregation nets them
 * out **before** bucketing rather than muddying the pure {@link isSpend} sign
 * check. A lone leg (only one side of a pair present in the view) still matches.
 */
function isTransferLeg(txn: Transaction): boolean {
	return txn.transferGroupId != null;
}

/**
 * Is this transaction **excluded from recap** (issue #67)? An excluded row is a
 * real bank row that is not real spending — an internal movement the transfer
 * feature never caught, a correction, a row the user has decided is noise — so
 * it is dropped before bucketing and contributes to no total. Unlike a transfer
 * leg it is not summarised: there is no counterpart it nets against, and the
 * money did not move between the user's own accounts.
 *
 * The flag is read straight off the wire, where the server has already resolved
 * it (ADR 0008) — the client never re-derives exclusion.
 */
function isExcludedFromRecap(txn: Transaction): boolean {
	return txn.excludedFromRecap === true;
}

/**
 * A running per-bucket accumulator: the total spent and the row count, keyed by
 * entity id (or `null` for the unassigned bucket).
 */
type Bucket = { id: number | null; spent: number; count: number };

/**
 * Fold spending transactions into buckets keyed by `keyOf`, resolving each
 * bucket's visual identity once via `identityOf`. Debits are summed as positive
 * magnitudes so the rows read as "money out". A `Map` preserves nothing about
 * order — the caller sorts — but dedupes ids in one pass.
 */
function bucketBy(
	transactions: readonly Transaction[],
	keyOf: (txn: Transaction) => number | null,
	identityOf: (key: number | null) => BucketIdentity,
): SpendRow[] {
	const buckets = new Map<number | null, Bucket>();

	for (const txn of transactions) {
		if (!isSpend(txn)) continue;
		const key = keyOf(txn);
		const bucket = buckets.get(key) ?? { id: key, spent: 0, count: 0 };
		bucket.spent += Math.abs(txn.amount);
		bucket.count += 1;
		buckets.set(key, bucket);
	}

	return [...buckets.values()].map((bucket) => {
		const identity = identityOf(bucket.id);
		return {
			id: bucket.id,
			name: identity.name,
			imageUrl: identity.imageUrl,
			defaultCategoryId: identity.defaultCategoryId,
			icon: identity.icon,
			color: identity.color,
			spent: bucket.spent,
			count: bucket.count,
		};
	});
}

/**
 * Aggregate transactions into per-issuer and per-category spend totals (issue
 * #35), the recap page's two sections. Pure over its inputs — the view fetches
 * the filtered transactions plus the issuer/category lookups and hands them here,
 * so the aggregation is unit-testable without a query.
 *
 * Both breakdowns key off the transaction's **derived** fields: `issuerId` and
 * `categoryId` on the wire already carry the effective issuer/category (a rule's
 * or override's, resolved server-side), so grouping by them needs no re-
 * derivation. A row with no issuer / no category lands in a single `Unassigned`
 * bucket keyed by `null`. Amounts are summed as positive magnitudes; only
 * spending (negative) rows are counted.
 *
 * Internal-transfer legs (PRD #48) are partitioned out **before** bucketing, so
 * they never enter either breakdown nor the grand total (which only ever sums
 * the breakdowns). The netted-out legs are summarised separately as
 * {@link RecapSpend.transfers}. Rows **excluded from recap** (issue #67) are
 * dropped in the same pass, ahead of the transfer check, and are summarised
 * nowhere — they are simply not part of the arithmetic.
 */
export function aggregateSpend(
	transactions: readonly Transaction[],
	lookups: {
		issuersById: ReadonlyMap<number, Issuer>;
		categoriesById: ReadonlyMap<number, Category>;
	},
): RecapSpend {
	const { issuersById, categoriesById } = lookups;

	const spendRows: Transaction[] = [];
	const transfers: TransferSummary = { total: 0, count: 0 };
	for (const txn of transactions) {
		// Held out of every total, and out of the transfer summary too — the two
		// exclusions answer different questions (issue #67).
		if (isExcludedFromRecap(txn)) continue;
		if (isTransferLeg(txn)) {
			transfers.count += 1;
			// The moved amount = the debit legs' magnitudes; a clean pair's credit
			// leg is skipped so the figure reads as "money moved", not doubled.
			if (txn.amount < 0) transfers.total += Math.abs(txn.amount);
			continue;
		}
		spendRows.push(txn);
	}

	const byIssuer = bucketBy(
		spendRows,
		(txn) => txn.issuerId ?? null,
		(key) => {
			const issuer = key == null ? undefined : issuersById.get(key);
			return {
				name: issuer?.name ?? UNASSIGNED_LABEL,
				imageUrl: issuer?.imageUrl,
				defaultCategoryId: issuer?.defaultCategoryId,
			};
		},
	);

	// The **Resolved colour** walk takes the whole tree, so resolve every category
	// once up front rather than re-walking it per bucket.
	const colorById = resolveCategoryColors([...categoriesById.values()]);
	const byCategory = bucketBy(
		spendRows,
		(txn) => txn.categoryId ?? null,
		(key) => {
			const category = key == null ? undefined : categoriesById.get(key);
			return {
				name: category?.name ?? UNASSIGNED_LABEL,
				icon: category?.icon,
				// Resolved against the whole tree, not read off the row: an inheriting
				// leaf's colour lives on an ancestor (ADR 0006).
				color: category === undefined ? undefined : colorById.get(category.id),
			};
		},
	);

	return { byIssuer, byCategory, transfers };
}
