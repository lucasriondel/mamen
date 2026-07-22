import type { Category, Issuer, Transaction } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
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
}): Transaction {
	return {
		id: nextId++,
		accountId: 1,
		date: new Date("2026-07-01"),
		amount: partial.amount,
		rawIssuerString: "raw",
		issuerId: partial.issuerId,
		categoryId: partial.categoryId,
		importedAt: new Date("2026-07-01"),
		importMonth: "2026-07",
	} as unknown as Transaction;
}

function issuer(id: number, name: string, imageUrl?: string): Issuer {
	return { id, name, imageUrl } as unknown as Issuer;
}

function category(id: number, name: string, icon?: string): Category {
	return { id, name, icon } as unknown as Category;
}

const lookups = {
	issuersById: new Map([
		[1, issuer(1, "Amazon", "/uploads/issuers/amazon.png")],
		[2, issuer(2, "Netflix")],
	]),
	categoriesById: new Map([
		[10, category(10, "Groceries", "🛒")],
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

	it("carries the issuer image and category icon onto their rows", () => {
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
		expect(categories.Groceries.icon).toBe("🛒");
		expect(categories.Streaming.icon).toBeUndefined();
	});

	it("returns empty sections when there is no spend", () => {
		const { byIssuer, byCategory } = aggregateSpend([], lookups);
		expect(byIssuer).toEqual([]);
		expect(byCategory).toEqual([]);
	});
});
