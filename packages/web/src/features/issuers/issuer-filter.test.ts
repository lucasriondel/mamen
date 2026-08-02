import type { Issuer } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { filterIssuers } from "./issuer-filter";
import type { IssuerMetrics } from "./issuer-sort";

function metrics(name: string): IssuerMetrics {
	return {
		issuer: { id: 1, name } as Issuer,
		count: 0,
		net: 0,
		value: 0,
	};
}

const ROWS = [
	metrics("Netflix"),
	metrics("Amazon"),
	metrics("Crèche du Parc"),
].map((m) => m);

const names = (rows: readonly IssuerMetrics[]) =>
	rows.map((r) => r.issuer.name);

describe("filterIssuers", () => {
	it("keeps everything for a blank or whitespace-only term", () => {
		expect(names(filterIssuers(ROWS, ""))).toEqual(names(ROWS));
		expect(names(filterIssuers(ROWS, "   "))).toEqual(names(ROWS));
	});

	it("matches a substring anywhere in the name", () => {
		expect(names(filterIssuers(ROWS, "fli"))).toEqual(["Netflix"]);
	});

	it("ignores case", () => {
		expect(names(filterIssuers(ROWS, "AMAZON"))).toEqual(["Amazon"]);
	});

	it("ignores accents in both the term and the name", () => {
		expect(names(filterIssuers(ROWS, "creche"))).toEqual(["Crèche du Parc"]);
		expect(names(filterIssuers(ROWS, "crèche"))).toEqual(["Crèche du Parc"]);
	});

	it("returns an empty list when nothing matches", () => {
		expect(filterIssuers(ROWS, "zzz")).toEqual([]);
	});

	it("does not mutate the input", () => {
		const input = [...ROWS];
		filterIssuers(input, "net");
		expect(input).toHaveLength(ROWS.length);
	});
});
