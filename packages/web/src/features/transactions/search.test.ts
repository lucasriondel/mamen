import { describe, expect, it } from "vitest";
import {
	offsetToPage,
	pageToOffset,
	validateTransactionsSearch,
} from "./search";

describe("validateTransactionsSearch", () => {
	it("defaults to no filters, desc, page 1 on empty input", () => {
		expect(validateTransactionsSearch({})).toEqual({
			direction: "desc",
			page: 1,
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
		expect(
			validateTransactionsSearch({ search: "   " }).search,
		).toBeUndefined();
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

	it("floors a page above 1 and falls back to page 1 for anything else", () => {
		expect(validateTransactionsSearch({ page: "3" }).page).toBe(3);
		expect(validateTransactionsSearch({ page: 3.9 }).page).toBe(3);
		expect(validateTransactionsSearch({ page: 1 }).page).toBe(1);
		expect(validateTransactionsSearch({ page: 0 }).page).toBe(1);
		expect(validateTransactionsSearch({ page: -5 }).page).toBe(1);
		expect(validateTransactionsSearch({ page: "x" }).page).toBe(1);
	});
});

describe("pageToOffset / offsetToPage", () => {
	it("maps a 1-based page to the row offset the SDK list takes", () => {
		expect(pageToOffset(1, 50)).toBe(0);
		expect(pageToOffset(2, 50)).toBe(50);
		expect(pageToOffset(7, 50)).toBe(300);
	});

	it("round-trips back to the page a row offset falls on", () => {
		expect(offsetToPage(0, 50)).toBe(1);
		expect(offsetToPage(50, 50)).toBe(2);
		expect(offsetToPage(300, 50)).toBe(7);
		// A mid-page offset still resolves to the page containing it.
		expect(offsetToPage(75, 50)).toBe(2);
	});
});
