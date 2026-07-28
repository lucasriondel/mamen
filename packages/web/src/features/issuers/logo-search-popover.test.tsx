import type { Issuer } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock the SDK seam (as every other feature test does): the popover reads
 * `issuerQueries.logoSearch` and writes through `issuerMutations.setImageFromUrl`.
 * The mocked read options carry the *real* ones' caching policy — `staleTime`
 * Infinity — because that policy is what makes "re-opening for the same issuer
 * is free" true, and a mock that dropped it would test a different component.
 */
const searchLogos = vi.fn();
const setImageFromUrl = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerQueries: {
			...actual.issuerQueries,
			logoSearch: (q: string) => ({
				queryKey: ["logo-search", q],
				queryFn: () => searchLogos(q),
				staleTime: Number.POSITIVE_INFINITY,
				retry: false,
			}),
		},
		issuerMutations: {
			...actual.issuerMutations,
			setImageFromUrl: (id: unknown, url: unknown) => setImageFromUrl(id, url),
		},
	};
});

const { LogoSearchPopover } = await import("./logo-search-popover");

function issuer(overrides: Partial<Issuer> = {}): Issuer {
	return {
		id: 1 as Issuer["id"],
		name: "Spotify",
		createdAt: new Date("2026-01-01"),
		firstSeen: new Date("2026-01-01"),
		...overrides,
	} as Issuer;
}

/** Two hits, shaped like the contract's `LogoSearchResult`. */
const HITS = {
	results: [
		{
			title: "Spotify logo",
			imageUrl: "https://cdn.example.com/spotify.png",
			thumbnailUrl: "https://thumbs.example.com/spotify.png",
			contextUrl: "https://example.com/brand",
			width: 512,
			height: 512,
		},
		{
			title: "Spotify icon",
			imageUrl: "https://cdn.example.com/spotify-icon.png",
			thumbnailUrl: "https://thumbs.example.com/spotify-icon.png",
		},
	],
};

/** A tagged SDK error, as the runtime unwraps them (`_tag` + fields). */
function tagged(tag: string, fields: Record<string, unknown> = {}) {
	return Object.assign(new Error(tag), { _tag: tag, ...fields });
}

async function open(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Search logo" }));
	return screen.findByRole("button", { name: "Search" });
}

beforeEach(() => {
	searchLogos.mockReset().mockResolvedValue(HITS);
	setImageFromUrl.mockReset().mockResolvedValue(issuer());
});

describe("LogoSearchPopover", () => {
	it("pre-fills the query with the issuer's name and focuses the search button", async () => {
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);

		const searchButton = await open(user);

		// The bare name, no "logo" suffix: logo.dev resolves brand names.
		expect(screen.getByLabelText("Logo search query")).toHaveValue("Spotify");
		await waitFor(() => expect(searchButton).toHaveFocus());
	});

	it("leaves the query field editable", async () => {
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		await open(user);

		const field = screen.getByLabelText("Logo search query");
		await user.clear(field);
		await user.type(field, "spotify brand mark");

		expect(field).toHaveValue("spotify brand mark");
	});

	it("searches only on explicit submit — never on a keystroke", async () => {
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		const searchButton = await open(user);

		const field = screen.getByLabelText("Logo search query");
		await user.clear(field);
		await user.type(field, "monoprix logo");
		expect(searchLogos).not.toHaveBeenCalled();

		await user.click(searchButton);
		await waitFor(() =>
			expect(searchLogos).toHaveBeenCalledWith("monoprix logo"),
		);
		expect(searchLogos).toHaveBeenCalledTimes(1);
	});

	it("spends no second upstream call on an identical query", async () => {
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		const searchButton = await open(user);

		await user.click(searchButton);
		expect(await screen.findByAltText("Spotify logo")).toBeInTheDocument();

		// Same text, submitted again — and again after a close/re-open, which is
		// the "re-opening the popover for the same issuer is free" case.
		await user.click(searchButton);
		await user.keyboard("{Escape}");
		await open(user);
		await user.click(screen.getByRole("button", { name: "Search" }));
		expect(await screen.findByAltText("Spotify logo")).toBeInTheDocument();

		expect(searchLogos).toHaveBeenCalledTimes(1);
	});

	it("renders the results as a mosaic of thumbnails", async () => {
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		await user.click(await open(user));

		const thumbs = await screen.findAllByRole("img");
		expect(thumbs.map((img) => img.getAttribute("src"))).toEqual([
			"https://thumbs.example.com/spotify.png",
			"https://thumbs.example.com/spotify-icon.png",
		]);
		// Each thumbnail is its own control, so the grid is walkable by Tab.
		expect(screen.getAllByRole("button", { name: /Spotify/ })).toHaveLength(2);
	});

	it("stores a picked result and closes the popover", async () => {
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		await user.click(await open(user));

		await user.click(
			await screen.findByRole("button", { name: "Spotify logo" }),
		);

		await waitFor(() =>
			expect(setImageFromUrl).toHaveBeenCalledWith(
				1,
				"https://cdn.example.com/spotify.png",
			),
		);
		await waitFor(() =>
			expect(
				screen.queryByLabelText("Logo search query"),
			).not.toBeInTheDocument(),
		);
	});

	it("explains the unconfigured state and names what to set", async () => {
		searchLogos.mockRejectedValue(
			tagged("LogoSearchUnconfigured", { missing: ["LOGODEV_TOKEN"] }),
		);
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		await user.click(await open(user));

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(/isn't set up/i);
		expect(alert).toHaveTextContent("LOGODEV_TOKEN");
		expect(alert).toHaveTextContent("docs/operations/logo-search-setup.md");
		// Nothing to retry: a key is missing, and no button in this app adds one.
		expect(
			screen.queryByRole("button", { name: /try again/i }),
		).not.toBeInTheDocument();
	});

	it("reports a spent quota as itself and offers no retry", async () => {
		searchLogos.mockRejectedValue(tagged("LogoSearchQuotaExceeded"));
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		await user.click(await open(user));

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(/rate limit reached/i);
		expect(
			screen.queryByRole("button", { name: /try again/i }),
		).not.toBeInTheDocument();
	});

	it("offers a retry for a transport failure — the one state where it can help", async () => {
		searchLogos.mockRejectedValue(
			tagged("LogoSearchFailed", { message: "upstream 502" }),
		);
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		await user.click(await open(user));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			/couldn't reach logo search/i,
		);

		searchLogos.mockResolvedValue(HITS);
		await user.click(screen.getByRole("button", { name: /try again/i }));

		expect(await screen.findByAltText("Spotify logo")).toBeInTheDocument();
		expect(searchLogos).toHaveBeenCalledTimes(2);
	});

	it("leaves the results up when the download is refused, so another can be picked", async () => {
		setImageFromUrl.mockRejectedValue(
			tagged("ImageFetchRefused", { reason: "private-address" }),
		);
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		await user.click(await open(user));

		await user.click(
			await screen.findByRole("button", { name: "Spotify logo" }),
		);

		expect(await screen.findByRole("alert")).toHaveTextContent(
			/couldn't be fetched/i,
		);
		// Still open, still showing both hits — the recovery is picking another.
		expect(screen.getByAltText("Spotify icon")).toBeInTheDocument();

		setImageFromUrl.mockResolvedValue(issuer());
		await user.click(screen.getByRole("button", { name: "Spotify icon" }));
		await waitFor(() =>
			expect(setImageFromUrl).toHaveBeenLastCalledWith(
				1,
				"https://cdn.example.com/spotify-icon.png",
			),
		);
	});

	it("is walkable by keyboard alone — Tab into the mosaic, Enter to pick", async () => {
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		await open(user);

		// Focus opens on the search button, so submitting is one keypress…
		await user.keyboard("{Enter}");
		await screen.findByAltText("Spotify logo");

		// …and the results are ordinary tab stops after the form.
		await user.tab();
		expect(screen.getByRole("button", { name: "Spotify logo" })).toHaveFocus();
		await user.keyboard("{Enter}");

		await waitFor(() =>
			expect(setImageFromUrl).toHaveBeenCalledWith(
				1,
				"https://cdn.example.com/spotify.png",
			),
		);
	});

	it("dismisses on Escape without searching", async () => {
		const user = userEvent.setup();
		render(<LogoSearchPopover issuer={issuer()} />);
		await open(user);

		await user.keyboard("{Escape}");

		await waitFor(() =>
			expect(
				screen.queryByLabelText("Logo search query"),
			).not.toBeInTheDocument(),
		);
		expect(searchLogos).not.toHaveBeenCalled();
		// Focus returns to the trigger (Radix), so the keyboard never gets stranded.
		expect(screen.getByRole("button", { name: "Search logo" })).toHaveFocus();
	});
});
