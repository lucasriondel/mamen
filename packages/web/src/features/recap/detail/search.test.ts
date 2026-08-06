import { describe, expect, it } from "vitest";
import { toDetailTarget, validateRecapDetailSearch } from "./search";

describe("validateRecapDetailSearch", () => {
	it("fills the transactions defaults, so the schema is a superset of that view's", () => {
		expect(validateRecapDetailSearch({})).toMatchObject({
			direction: "desc",
			page: 1,
		});
	});

	it("keeps a valid target", () => {
		const search = validateRecapDetailSearch({ by: "issuer", bucket: "10" });
		expect(search.by).toBe("issuer");
		expect(search.bucket).toBe(10);
	});

	it("keeps the Unassigned sentinel as its own value, distinct from absent", () => {
		expect(
			validateRecapDetailSearch({ by: "category", bucket: "none" }).bucket,
		).toBe("none");
		expect(
			validateRecapDetailSearch({ by: "category" }).bucket,
		).toBeUndefined();
	});

	it("drops an unknown axis or an unparseable bucket rather than guessing", () => {
		const search = validateRecapDetailSearch({ by: "vendor", bucket: "abc" });
		expect(search.by).toBeUndefined();
		expect(search.bucket).toBeUndefined();
	});

	it("carries the recap's period across, keeping month/year only when used", () => {
		const month = validateRecapDetailSearch({
			period: "month",
			month: "2026-07",
			year: "2026",
		});
		expect(month.period).toBe("month");
		expect(month.month).toBe("2026-07");
		expect(month.year).toBeUndefined();

		const year = validateRecapDetailSearch({
			period: "year",
			month: "2026-07",
			year: "2026",
		});
		expect(year.period).toBe("year");
		expect(year.year).toBe("2026");
		expect(year.month).toBeUndefined();

		const all = validateRecapDetailSearch({ period: "all", month: "2026-07" });
		expect(all.period).toBe("all");
		expect(all.month).toBeUndefined();
	});

	it("carries the account selection as an id list, single value or repeated", () => {
		expect(validateRecapDetailSearch({ accountIds: "2" }).accountIds).toEqual([
			2,
		]);
		expect(
			validateRecapDetailSearch({ accountIds: ["1", "2"] }).accountIds,
		).toEqual([1, 2]);
		expect(validateRecapDetailSearch({}).accountIds).toBeUndefined();
	});

	it("keeps the transactions filters, including both halves of the recap filter", () => {
		expect(
			validateRecapDetailSearch({
				excludedFromRecap: "false",
				search: " amazon ",
			}),
		).toMatchObject({ excludedFromRecap: false, search: "amazon" });
	});
});

describe("toDetailTarget", () => {
	it("resolves an id target", () => {
		expect(toDetailTarget({ by: "issuer", bucket: 10 })).toEqual({
			kind: "bucket",
			axis: "issuer",
			bucket: 10,
		});
	});

	// `null` is a real target — the rows with no issuer / no derived category — and
	// must not read as "no target", which would leave the page unscoped.
	it("resolves the sentinel to a null bucket, not to no target", () => {
		expect(toDetailTarget({ by: "category", bucket: "none" })).toEqual({
			kind: "bucket",
			axis: "category",
			bucket: null,
		});
	});

	// The excluded summary used to open this page on an `excluded=true` target; it
	// now links to `/transactions`. An old bookmark therefore names no bucket and
	// must report no target, so the view offers its way back to the recap rather
	// than querying unscoped under a header claiming to be one line's rows.
	it("reports no target for an old excluded link", () => {
		expect(toDetailTarget({ excluded: true } as never)).toBeUndefined();
	});

	it("reports no target when the axis or the bucket is missing", () => {
		expect(toDetailTarget({ by: "issuer" })).toBeUndefined();
		expect(toDetailTarget({ bucket: 10 })).toBeUndefined();
		expect(toDetailTarget({})).toBeUndefined();
	});
});
