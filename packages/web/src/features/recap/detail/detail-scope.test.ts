import { describe, expect, it } from "vitest";
import { toDetailScope } from "./detail-scope";

describe("toDetailScope", () => {
	it("scopes an issuer bucket over the period's inclusive date bounds", () => {
		const scope = toDetailScope(
			{ kind: "bucket", axis: "issuer", bucket: 10 },
			{ kind: "month", month: "2026-07" },
			[],
		);
		expect(scope.issuerId).toBe(10);
		expect(scope.categoryId).toBeUndefined();
		expect((scope.startDate as Date).toISOString()).toBe(
			"2026-07-01T00:00:00.000Z",
		);
		expect((scope.endDate as Date).toISOString()).toBe(
			"2026-07-31T23:59:59.999Z",
		);
	});

	it("scopes a category bucket, matching the derived category", () => {
		const scope = toDetailScope(
			{ kind: "bucket", axis: "category", bucket: 100 },
			{ kind: "year", year: "2026" },
			[],
		);
		expect(scope.categoryId).toBe(100);
		expect(scope.issuerId).toBeUndefined();
	});

	// The Unassigned bucket asks for the rows that HAVE none — the filter must be
	// present and say so. Dropping it would widen the page to the whole table.
	it("asks for the unassigned rows rather than dropping the filter", () => {
		expect(
			toDetailScope(
				{ kind: "bucket", axis: "issuer", bucket: null },
				{ kind: "all" },
				[],
			).issuerId,
		).toBe("none");
		expect(
			toDetailScope(
				{ kind: "bucket", axis: "category", bucket: null },
				{ kind: "all" },
				[],
			).categoryId,
		).toBe("none");
	});

	it("bounds nothing for the all-time period", () => {
		const scope = toDetailScope(
			{ kind: "bucket", axis: "issuer", bucket: 10 },
			{ kind: "all" },
			[],
		);
		expect(scope.startDate).toBeUndefined();
		expect(scope.endDate).toBeUndefined();
	});

	// The recap's picker is multi-select, so the whole selection rides as a set —
	// narrowing to one account here would show a total the row never claimed.
	it("carries a multi-account selection across as a set", () => {
		expect(
			toDetailScope(
				{ kind: "bucket", axis: "issuer", bucket: 10 },
				{ kind: "all" },
				[1, 2],
			).accountId,
		).toEqual([1, 2]);
	});

	// An empty selection is "every account", which is the absent filter — `[]` would
	// ask for the accounts in an empty set, i.e. nothing.
	it("omits the account filter for an empty selection", () => {
		expect(
			toDetailScope(
				{ kind: "bucket", axis: "issuer", bucket: 10 },
				{ kind: "all" },
				[],
			).accountId,
		).toBeUndefined();
	});

	// The recap-exclusion narrowing is a visible filter value in the URL, seeded by
	// the link — not folded into the scope, where the filter bar could not show it.
	it("leaves the recap-exclusion filter to the URL, not the scope", () => {
		expect(
			toDetailScope(
				{ kind: "bucket", axis: "issuer", bucket: 10 },
				{ kind: "all" },
				[],
			).excludedFromRecap,
		).toBeUndefined();
	});

	// The excluded rows are the complement of the spend, not a slice of it (#87), so
	// there is no identity filter to pin — only the period and the accounts.
	describe("the excluded target (issue #87)", () => {
		it("contributes no issuer or category filter", () => {
			const scope = toDetailScope(
				{ kind: "excluded" },
				{ kind: "month", month: "2026-07" },
				[],
			);
			expect(scope.issuerId).toBeUndefined();
			expect(scope.categoryId).toBeUndefined();
			// Its rows come from the URL's `excludedFromRecap=true`, not from here.
			expect(scope.excludedFromRecap).toBeUndefined();
		});

		it("still pins the period and the account selection", () => {
			const scope = toDetailScope(
				{ kind: "excluded" },
				{ kind: "month", month: "2026-07" },
				[1, 2],
			);
			expect((scope.startDate as Date).toISOString()).toBe(
				"2026-07-01T00:00:00.000Z",
			);
			expect((scope.endDate as Date).toISOString()).toBe(
				"2026-07-31T23:59:59.999Z",
			);
			expect(scope.accountId).toEqual([1, 2]);
		});
	});
});
