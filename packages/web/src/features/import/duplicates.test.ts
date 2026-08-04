import type { AccountId } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import {
	type DuplicateCandidate,
	flagDuplicates,
	normaliseIssuerString,
} from "./duplicates";

const ACCOUNT_ID = 7 as AccountId;
const OTHER_ACCOUNT_ID = 8 as AccountId;

function row(overrides: Partial<DuplicateCandidate> = {}): DuplicateCandidate {
	return {
		accountId: ACCOUNT_ID,
		date: new Date("2026-01-15T10:00:00Z"),
		amount: -10.5,
		rawIssuerString: "SHOP A",
		...overrides,
	};
}

describe("normaliseIssuerString", () => {
	// Collapse runs of whitespace, trim, uppercase — and nothing further. No
	// punctuation stripping, no accent folding: every extra normalisation step
	// widens what counts as "the same row" (issue #89).
	it("collapses whitespace, trims and uppercases", () => {
		expect(normaliseIssuerString("  carte   Shop\tA \n")).toBe("CARTE SHOP A");
	});

	it("leaves punctuation and accents alone", () => {
		expect(normaliseIssuerString("Café-Crème 12/01")).toBe("CAFÉ-CRÈME 12/01");
	});
});

describe("flagDuplicates", () => {
	it("flags a parsed row matching a stored row on date, amount and issuer", () => {
		expect(flagDuplicates([row()], [row()])).toEqual([true]);
	});

	// The only normalisation the comparison does — so a re-extraction that spaced
	// or cased the counterparty text differently still reads as the same row.
	it("matches across issuer whitespace and letter case", () => {
		expect(
			flagDuplicates([row({ rawIssuerString: "  shop   a " })], [row()]),
		).toEqual([true]);
	});

	// Strict on the two fields that carry the money: a false positive risks the
	// user deleting a real transaction on the app's say-so.
	it("does not match on a different date or a different amount", () => {
		const stored = [row()];
		expect(
			flagDuplicates([row({ date: new Date("2026-01-16T10:00:00Z") })], stored),
		).toEqual([false]);
		expect(flagDuplicates([row({ amount: -10.51 })], stored)).toEqual([false]);
	});

	// Amounts are money: compared in integer cents, never as floats.
	it("matches an amount that only differs by float noise", () => {
		expect(
			flagDuplicates([row({ amount: 0.1 + 0.2 })], [row({ amount: 0.3 })]),
		).toEqual([true]);
	});

	// The same transaction on another account is not a duplicate — it is a
	// different account's row that happens to look alike.
	it("does not match a stored row on another account", () => {
		expect(
			flagDuplicates([row()], [row({ accountId: OTHER_ACCOUNT_ID })]),
		).toEqual([false]);
	});

	it("flags nothing when no stored row matches", () => {
		expect(
			flagDuplicates(
				[row(), row({ rawIssuerString: "SHOP B" })],
				[row({ amount: -99 }), row({ date: new Date("2026-01-02T10:00:00Z") })],
			),
		).toEqual([false, false]);
	});

	// Same-day / same-amount / same-issuer rows are genuinely real (epic #85), so
	// the match is by multiplicity: one stored row accounts for one parsed row.
	it("lets one stored row account for only one of two identical parsed rows", () => {
		expect(flagDuplicates([row(), row()], [row()])).toEqual([true, false]);
	});

	// A bundle parent is a synthetic row the user made, standing for its members:
	// its amount is their sum and its issuer text the label typed for it. Nothing
	// off a statement is a duplicate *of that*.
	it("ignores bundle parents among the stored rows", () => {
		expect(flagDuplicates([row()], [row({ kind: "bundle" })])).toEqual([false]);
	});
});
