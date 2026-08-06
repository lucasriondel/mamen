import { describe, expect, it } from "vitest";
import { toDetailSearch } from "./detail-link";

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
