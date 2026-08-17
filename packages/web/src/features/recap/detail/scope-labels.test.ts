import type { Account } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { accountsLabel, periodLabel, targetLabel } from "./scope-labels";

const account = (id: number, name: string) =>
	({ id, name, type: "checking" }) as unknown as Account;

// It joined the other two here when the page's header became a `PageLayout`
// (issue #129) — the three are one sentence, so they are built in one place.
describe("targetLabel", () => {
	it("names which breakdown the page drilled into", () => {
		expect(targetLabel({ kind: "bucket", axis: "issuer", bucket: 10 })).toBe(
			"Issuer",
		);
		expect(
			targetLabel({ kind: "bucket", axis: "category", bucket: null }),
		).toBe("Category");
	});
});

describe("periodLabel", () => {
	it("names a month, a year, and the unbounded window", () => {
		expect(periodLabel({ kind: "month", month: "2026-07" })).toMatch(/2026/);
		expect(periodLabel({ kind: "year", year: "2026" })).toBe("2026");
		expect(periodLabel({ kind: "all" })).toBe("All time");
	});
});

describe("accountsLabel", () => {
	const accounts = [account(1, "Checking"), account(2, "Savings")];

	it("reads an empty selection as every account", () => {
		expect(accountsLabel([], accounts)).toBe("All accounts");
	});

	it("names the selected accounts", () => {
		expect(accountsLabel([1, 2], accounts)).toBe("Checking, Savings");
	});

	// Only reachable from a hand-edited URL, and the rows it selects are none — so
	// the header says nothing rather than rendering a bare id.
	it("falls back to every account when no id resolves", () => {
		expect(accountsLabel([99], accounts)).toBe("All accounts");
	});
});
