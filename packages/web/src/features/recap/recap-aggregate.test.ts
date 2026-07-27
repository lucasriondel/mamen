import type { Category, Issuer, Transaction } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { NEUTRAL_CATEGORY_COLOR } from "@/lib/category-tree";
import {
	aggregateSpend,
	type SpendRow,
	UNASSIGNED_LABEL,
} from "./recap-aggregate";

let nextId = 1;

/** A minimal transaction carrying only the fields the aggregation reads. */
function txn(partial: {
	amount: number;
	issuerId?: number;
	categoryId?: number;
	transferGroupId?: number;
}): Transaction {
	return {
		id: nextId++,
		accountId: 1,
		date: new Date("2026-07-01"),
		amount: partial.amount,
		rawIssuerString: "raw",
		issuerId: partial.issuerId,
		categoryId: partial.categoryId,
		transferGroupId: partial.transferGroupId,
		importedAt: new Date("2026-07-01"),
		importMonth: "2026-07",
	} as unknown as Transaction;
}

function issuer(
	id: number,
	name: string,
	imageUrl?: string,
	defaultCategoryId?: number,
): Issuer {
	return { id, name, imageUrl, defaultCategoryId } as unknown as Issuer;
}

function category(
	id: number,
	name: string,
	icon?: string,
	over: Partial<Category> = {},
): Category {
	return {
		id,
		name,
		icon,
		color: null,
		parentId: null,
		...over,
	} as unknown as Category;
}

// Food is a folder that stored a colour; Groceries is a leaf that **inherits** it
// (ADR 0006). Streaming stores neither icon nor colour and inherits nothing, so
// it exercises the neutral terminator.
const lookups = {
	issuersById: new Map([
		[1, issuer(1, "Amazon", "/uploads/issuers/amazon.png")],
		[2, issuer(2, "Netflix", undefined, 20)],
	]),
	categoriesById: new Map([
		[1, category(1, "Food", "utensils-crossed", { color: "#ef4444" })],
		[10, category(10, "Groceries", "shopping-cart", { parentId: 1 })],
		[20, category(20, "Streaming")],
	]),
};

const byName = (rows: readonly SpendRow[]) =>
	Object.fromEntries(rows.map((r) => [r.name, r]));

describe("aggregateSpend", () => {
	it("sums spend per issuer as a positive magnitude", () => {
		const { byIssuer } = aggregateSpend(
			[
				txn({ amount: -10, issuerId: 1 }),
				txn({ amount: -5, issuerId: 1 }),
				txn({ amount: -8, issuerId: 2 }),
			],
			lookups,
		);
		const rows = byName(byIssuer);
		expect(rows.Amazon).toMatchObject({ id: 1, spent: 15, count: 2 });
		expect(rows.Netflix).toMatchObject({ id: 2, spent: 8, count: 1 });
	});

	it("sums spend per category as a positive magnitude", () => {
		const { byCategory } = aggregateSpend(
			[
				txn({ amount: -10, categoryId: 10 }),
				txn({ amount: -8, categoryId: 20 }),
				txn({ amount: -2, categoryId: 20 }),
			],
			lookups,
		);
		const rows = byName(byCategory);
		expect(rows.Groceries).toMatchObject({ id: 10, spent: 10, count: 1 });
		expect(rows.Streaming).toMatchObject({ id: 20, spent: 10, count: 2 });
	});

	it("ignores income and zero-value rows (only debits are spend)", () => {
		const { byIssuer } = aggregateSpend(
			[
				txn({ amount: -10, issuerId: 1 }),
				txn({ amount: 100, issuerId: 1 }), // salary — not spend
				txn({ amount: 0, issuerId: 1 }), // zero — not spend
			],
			lookups,
		);
		expect(byName(byIssuer).Amazon).toMatchObject({ spent: 10, count: 1 });
	});

	it("nets a refund back out of its bucket", () => {
		// A -30 charge and a +30 refund against the same issuer net to 0 spend,
		// because the +30 is income (positive) and never counted, while the -30 is.
		// The expected behaviour: a full refund leaves the charge visible as spend.
		const { byIssuer } = aggregateSpend(
			[txn({ amount: -30, issuerId: 1 }), txn({ amount: 30, issuerId: 1 })],
			lookups,
		);
		expect(byName(byIssuer).Amazon).toMatchObject({ spent: 30, count: 1 });
	});

	it("buckets rows with no issuer / category under Unassigned", () => {
		const { byIssuer, byCategory } = aggregateSpend(
			[txn({ amount: -10 }), txn({ amount: -4 })],
			lookups,
		);
		expect(byName(byIssuer)[UNASSIGNED_LABEL]).toMatchObject({
			id: null,
			spent: 14,
			count: 2,
		});
		expect(byName(byCategory)[UNASSIGNED_LABEL]).toMatchObject({
			id: null,
			spent: 14,
			count: 2,
		});
	});

	it("labels a bucket Unassigned when its id has no lookup entry", () => {
		const { byIssuer } = aggregateSpend(
			[txn({ amount: -10, issuerId: 999 })],
			lookups,
		);
		expect(byIssuer).toHaveLength(1);
		expect(byIssuer[0]).toMatchObject({ id: 999, name: UNASSIGNED_LABEL });
	});

	it("carries the issuer image, category icon and resolved colour onto their rows", () => {
		const { byIssuer, byCategory } = aggregateSpend(
			[
				txn({ amount: -10, issuerId: 1 }),
				txn({ amount: -5, issuerId: 2 }),
				txn({ amount: -8, categoryId: 10 }),
				txn({ amount: -3, categoryId: 20 }),
			],
			lookups,
		);
		const issuers = byName(byIssuer);
		expect(issuers.Amazon.imageUrl).toBe("/uploads/issuers/amazon.png");
		expect(issuers.Netflix.imageUrl).toBeUndefined();

		const categories = byName(byCategory);
		expect(categories.Groceries.icon).toBe("shopping-cart");
		expect(categories.Streaming.icon).toBeUndefined();
		// The colour is *resolved* here, where the whole lookup is in hand: an
		// inheriting leaf carries its folder's, and a row inheriting from nobody
		// carries the neutral constant (ADR 0006).
		expect(categories.Groceries.color).toBe("#ef4444");
		expect(categories.Streaming.color).toBe(NEUTRAL_CATEGORY_COLOR);
		// The Unassigned bucket has no category at all, so there is nothing to
		// resolve — it must not borrow the neutral constant and read as a category.
		expect(categories.Unassigned.color).toBeUndefined();
	});

	it("carries the issuer's default category onto its row, for the avatar fallback", () => {
		// The **Avatar fallback chain** (issue #59) needs the issuer's default
		// category id to paint its second rung, and the row is all the section
		// hands the avatar. Resolving the icon and colour stays in the avatar; this
		// only has to not drop the id on the way through.
		const { byIssuer } = aggregateSpend(
			[
				txn({ amount: -10, issuerId: 1 }),
				txn({ amount: -5, issuerId: 2 }),
				txn({ amount: -2 }),
			],
			lookups,
		);
		const issuers = byName(byIssuer);
		expect(issuers.Netflix.defaultCategoryId).toBe(20);
		expect(issuers.Amazon.defaultCategoryId).toBeUndefined();
		// The Unassigned bucket has no issuer, so it has no category to fall back
		// to and must reach the avatar's neutral grey rung.
		expect(issuers.Unassigned.defaultCategoryId).toBeUndefined();
	});

	it("returns empty sections when there is no spend", () => {
		const { byIssuer, byCategory } = aggregateSpend([], lookups);
		expect(byIssuer).toEqual([]);
		expect(byCategory).toEqual([]);
	});

	it("reports no transfers when nothing is grouped", () => {
		const { transfers } = aggregateSpend(
			[txn({ amount: -10, issuerId: 1 })],
			lookups,
		);
		expect(transfers).toEqual({ total: 0, count: 0 });
	});

	it("excludes transfer legs from both breakdowns and the grand total", () => {
		// A -30 debit leg and a +30 credit leg of the same transfer group, plus a
		// real -10 spend. Only the -10 should reach the buckets.
		const { byIssuer, byCategory, transfers } = aggregateSpend(
			[
				txn({ amount: -30, issuerId: 1, categoryId: 10, transferGroupId: 1 }),
				txn({ amount: 30, issuerId: 1, categoryId: 10, transferGroupId: 1 }),
				txn({ amount: -10, issuerId: 2, categoryId: 20 }),
			],
			lookups,
		);
		// The transfer issuer/category never appear; only the real spend does.
		expect(byName(byIssuer).Amazon).toBeUndefined();
		expect(byName(byCategory).Groceries).toBeUndefined();
		expect(byName(byIssuer).Netflix).toMatchObject({ spent: 10, count: 1 });

		// Grand total = sum of the (transfer-free) breakdown rows.
		const grand = byIssuer.reduce((s, r) => s + r.spent, 0);
		expect(grand).toBe(10);

		// The transfers figure = the debit leg's magnitude, not the net (~0) nor
		// the doubled all-legs sum (60). Count is both legs present in the view.
		expect(transfers).toEqual({ total: 30, count: 2 });
	});

	it("still excludes and summarises a lone leg (only one side in view)", () => {
		// Under a single-account filter only the debit side may be present; it is
		// still netted out of spend and still counted as a transfer.
		const { byIssuer, transfers } = aggregateSpend(
			[txn({ amount: -30, issuerId: 1, transferGroupId: 1 })],
			lookups,
		);
		expect(byIssuer).toEqual([]);
		expect(transfers).toEqual({ total: 30, count: 1 });
	});

	it("summarises only the debit legs' magnitudes across multiple groups", () => {
		// Two groups: a clean -30/+30 pair and a lone +20 credit leg. Only the -30
		// debit contributes to the moved total; all three legs are counted.
		const { transfers } = aggregateSpend(
			[
				txn({ amount: -30, transferGroupId: 1 }),
				txn({ amount: 30, transferGroupId: 1 }),
				txn({ amount: 20, transferGroupId: 5 }),
			],
			lookups,
		);
		expect(transfers).toEqual({ total: 30, count: 3 });
	});
});
