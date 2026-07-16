import { describe, expect, it } from "vitest";
import { validateTransactionsSearch } from "./search";

describe("validateTransactionsSearch", () => {
	it("defaults to no filters, desc, offset 0 on empty input", () => {
		expect(validateTransactionsSearch({})).toEqual({
			direction: "desc",
			offset: 0,
		});
	});

	it("parses a numeric accountId filter", () => {
		expect(validateTransactionsSearch({ accountId: "7" }).accountId).toBe(7);
		expect(validateTransactionsSearch({ accountId: 7 }).accountId).toBe(7);
	});

	it("drops a blank or non-numeric accountId", () => {
		expect(
			validateTransactionsSearch({ accountId: "" }).accountId,
		).toBeUndefined();
		expect(
			validateTransactionsSearch({ accountId: "nope" }).accountId,
		).toBeUndefined();
	});

	it("keeps a non-empty importMonth string", () => {
		expect(
			validateTransactionsSearch({ importMonth: "2026-01" }).importMonth,
		).toBe("2026-01");
		expect(
			validateTransactionsSearch({ importMonth: "" }).importMonth,
		).toBeUndefined();
	});

	it("keeps a non-empty search string, trimmed", () => {
		expect(validateTransactionsSearch({ search: "netflix" }).search).toBe(
			"netflix",
		);
		expect(validateTransactionsSearch({ search: "  spar  " }).search).toBe(
			"spar",
		);
	});

	it("drops a blank/whitespace-only or non-string search", () => {
		expect(validateTransactionsSearch({ search: "" }).search).toBeUndefined();
		expect(validateTransactionsSearch({ search: "   " }).search).toBeUndefined();
		expect(validateTransactionsSearch({ search: 5 }).search).toBeUndefined();
	});

	it("only accepts asc/desc for direction", () => {
		expect(validateTransactionsSearch({ direction: "asc" }).direction).toBe(
			"asc",
		);
		expect(
			validateTransactionsSearch({ direction: "sideways" }).direction,
		).toBe("desc");
	});

	it("floors a positive offset and ignores non-positive/invalid", () => {
		expect(validateTransactionsSearch({ offset: "50" }).offset).toBe(50);
		expect(validateTransactionsSearch({ offset: 50.9 }).offset).toBe(50);
		expect(validateTransactionsSearch({ offset: -5 }).offset).toBe(0);
		expect(validateTransactionsSearch({ offset: "x" }).offset).toBe(0);
	});
});
