import type { Category, Issuer, Transaction } from "@mamen/shared/contract";

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
	/** Category icon (an emoji), for the by-category section. */
	icon?: string;
}

/** The visual identity a bucket resolves to: its name plus an optional avatar. */
type BucketIdentity = {
	name: string;
	imageUrl?: string;
	icon?: string;
};

/** The two spend breakdowns the recap page shows, each already summed per bucket. */
export interface RecapSpend {
	byIssuer: SpendRow[];
	byCategory: SpendRow[];
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
			icon: identity.icon,
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
 */
export function aggregateSpend(
	transactions: readonly Transaction[],
	lookups: {
		issuersById: ReadonlyMap<number, Issuer>;
		categoriesById: ReadonlyMap<number, Category>;
	},
): RecapSpend {
	const { issuersById, categoriesById } = lookups;

	const byIssuer = bucketBy(
		transactions,
		(txn) => txn.issuerId ?? null,
		(key) => {
			const issuer = key == null ? undefined : issuersById.get(key);
			return {
				name: issuer?.name ?? UNASSIGNED_LABEL,
				imageUrl: issuer?.imageUrl,
			};
		},
	);

	const byCategory = bucketBy(
		transactions,
		(txn) => txn.categoryId ?? null,
		(key) => {
			const category = key == null ? undefined : categoriesById.get(key);
			return {
				name: category?.name ?? UNASSIGNED_LABEL,
				icon: category?.icon,
			};
		},
	);

	return { byIssuer, byCategory };
}
