import type { Issuer } from "@mamen/shared/contract";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK boundary (PRD "Seam 2"): this hook only *reads*, through the
// issuers name search. The stub stands in for the server — it matches a
// case-insensitive name substring over the whole set and returns one page.
const searchTerms: string[] = [];
/** The terms actually *sent* — a built query that never runs isn't one. */
const fetched: string[] = [];
/** The terms whose answer has come back. */
const resolved: string[] = [];
let issuersList: Array<{ id: number; name: string }> = [];
/** How long the stub takes to answer. Comfortably longer than the debounce. */
const FETCH_MS = 400;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerQueries: {
			searchByName: (term: string) => {
				searchTerms.push(term);
				return {
					queryKey: ["issuers", "search", term.trim()],
					queryFn: async () => {
						fetched.push(term.trim());
						// A request that takes long enough to observe in flight — the
						// window the previous term's matches have to survive.
						await new Promise((resolve) => setTimeout(resolve, FETCH_MS));
						resolved.push(term.trim());
						const items = issuersList.filter((issuer) =>
							issuer.name.toLowerCase().includes(term.trim().toLowerCase()),
						);
						return { items, total: items.length };
					},
				};
			},
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { useIssuerSearch } = await import("./use-issuer-search");

const issuer = (id: number, name: string) => ({ id, name }) as Issuer;

beforeEach(() => {
	searchTerms.length = 0;
	fetched.length = 0;
	resolved.length = 0;
	issuersList = [
		{ id: 1, name: "MINT ENERGIE" },
		{ id: 2, name: "Mintaka" },
		{ id: 3, name: "Spotify" },
	];
});

describe("useIssuerSearch", () => {
	it("returns the issuers whose name matches the query", async () => {
		const { result } = renderHook(() =>
			useIssuerSearch({ query: "mint", enabled: true }),
		);

		await waitFor(() => expect(result.current).toHaveLength(2));
		expect(result.current.map((i) => i.name)).toEqual([
			"MINT ENERGIE",
			"Mintaka",
		]);
	});

	it("asks for nothing while the surface is closed", async () => {
		const { result } = renderHook(() =>
			useIssuerSearch({ query: "mint", enabled: false }),
		);

		// A shut picker costs no request — the term may be built, never sent.
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(fetched).toEqual([]);
		expect(result.current).toEqual([]);
	});

	it("sends one request per settled term, not one per keystroke", async () => {
		const { rerender } = renderHook(
			({ query }) => useIssuerSearch({ query, enabled: true }),
			{ initialProps: { query: "" } },
		);

		rerender({ query: "m" });
		rerender({ query: "mi" });
		rerender({ query: "min" });
		rerender({ query: "mint" });

		await waitFor(() => expect(fetched).toContain("mint"));
		// The half-typed prefixes never left the client.
		expect(fetched).not.toContain("mi");
		expect(fetched).not.toContain("min");
	});

	it("offers a pinned issuer the search page never returned", async () => {
		// The row's own issuer is on screen already; it must be offered whether or
		// not it is among the matches — that is what keeps the current assignment
		// visible in a table no page could hold (#79).
		const { result } = renderHook(() =>
			useIssuerSearch({
				query: "",
				enabled: true,
				pinned: [issuer(999, "Off-page Co")],
			}),
		);

		await waitFor(() => expect(result.current.length).toBeGreaterThan(1));
		expect(result.current[0]?.name).toBe("Off-page Co");
		expect(result.current.map((i) => i.name)).toContain("Spotify");
	});

	it("lists a pinned issuer once when it also matches the search", async () => {
		const { result } = renderHook(() =>
			useIssuerSearch({
				query: "spot",
				enabled: true,
				pinned: [issuer(3, "Spotify")],
			}),
		);

		await waitFor(() => expect(searchTerms).toContain("spot"));
		// Same issuer under two rows would be two answers to one question.
		expect(result.current.map((i) => i.id)).toEqual([3]);
	});

	it("keeps the previous matches on screen while the next term is in flight", async () => {
		const { result, rerender } = renderHook(
			({ query }) => useIssuerSearch({ query, enabled: true }),
			{ initialProps: { query: "mint" } },
		);
		await waitFor(() => expect(result.current).toHaveLength(2));

		rerender({ query: "mintak" });

		// Observed mid-flight: the debounce (150ms) has sent the new term and the
		// answer (400ms) has not arrived. The list is already narrowed to the live
		// query over the *previous* term's matches — it never blinks empty, and it
		// never shows a name that doesn't match what is typed.
		await waitFor(() => expect(fetched).toContain("mintak"));
		expect(result.current.map((i) => i.name)).toEqual(["Mintaka"]);

		// …and the answer changes nothing on screen when it lands.
		await waitFor(() => expect(resolved).toContain("mintak"));
		expect(result.current.map((i) => i.name)).toEqual(["Mintaka"]);
	});
});
