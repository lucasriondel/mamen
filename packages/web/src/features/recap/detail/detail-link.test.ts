import { describe, expect, it } from "vitest";
import { toDetailSearch, toExcludedDetailSearch } from "./detail-link";

describe("toDetailSearch", () => {
	it("carries the axis, the bucket, the period and the accounts", () => {
		const search = toDetailSearch(
			"issuer",
			10,
			{ kind: "month", month: "2026-07" },
			[1, 2],
		);
		expect(search.by).toBe("issuer");
		expect(search.bucket).toBe(10);
		expect(search.period).toBe("month");
		expect(search.month).toBe("2026-07");
		expect(search.year).toBeUndefined();
		expect(search.accountIds).toEqual([1, 2]);
	});

	it("sends the Unassigned bucket as the sentinel a URL can carry", () => {
		expect(toDetailSearch("category", null, { kind: "all" }, []).bucket).toBe(
			"none",
		);
	});

	it("omits the month/year the period does not use, and an empty selection", () => {
		const search = toDetailSearch(
			"issuer",
			10,
			{ kind: "year", year: "2026" },
			[],
		);
		expect(search.period).toBe("year");
		expect(search.year).toBe("2026");
		expect(search.month).toBeUndefined();
		expect(search.accountIds).toBeUndefined();
	});

	// The recap counts only rows that pass its predicate; `excludedFromRecap=false`
	// is the half of that the transactions list can state, seeded as a visible
	// filter so the detail's filter bar shows the narrowing it applies.
	it("seeds the counted-only recap filter", () => {
		expect(
			toDetailSearch("issuer", 10, { kind: "all" }, []).excludedFromRecap,
		).toBe(false);
	});
});

describe("toExcludedDetailSearch", () => {
	it("names the excluded view and carries the period and accounts", () => {
		const search = toExcludedDetailSearch(
			{ kind: "month", month: "2026-07" },
			[2],
		);
		expect(search.excluded).toBe(true);
		expect(search.period).toBe("month");
		expect(search.month).toBe("2026-07");
		expect(search.accountIds).toEqual([2]);
	});

	// The other side of the same filter, so the detail's filter bar shows *Excluded
	// only* and the control spells the page's subject out instead of contradicting it.
	it("seeds the excluded-only recap filter, not the counted-only one", () => {
		expect(toExcludedDetailSearch({ kind: "all" }, []).excludedFromRecap).toBe(
			true,
		);
	});

	// No bucket: the excluded rows are the complement of the breakdowns.
	it("carries no axis or bucket", () => {
		const search = toExcludedDetailSearch({ kind: "all" }, []);
		expect(search.by).toBeUndefined();
		expect(search.bucket).toBeUndefined();
	});
});
