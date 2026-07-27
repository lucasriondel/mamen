import type { Category, CategoryId } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readableInk } from "@/lib/color";

/**
 * The **Avatar fallback chain** (issue #59, ADR 0007): `imageUrl` → the **issuer
 * default category**'s icon on its **Resolved colour** → a neutral grey `?`.
 *
 * The avatar owns the whole chain, so it owns the category read too — the SDK
 * boundary is mocked here rather than the categories being threaded in from six
 * different call sites, each of which would have had to get the inheritance walk
 * right on its own.
 */
let categories: Category[];
const listCategories = vi.fn(async () => ({
	items: categories,
	total: categories.length,
}));

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		categoryQueries: {
			list: () => ({
				queryKey: ["categories", "list", "test"],
				queryFn: listCategories,
			}),
		},
	};
});

const { IssuerAvatar } = await import("./issuer-avatar");

function category(overrides: Partial<Category> & { id: number }): Category {
	return {
		name: "Groceries",
		slug: "groceries",
		color: null,
		icon: "shopping-cart",
		parentId: null,
		sortOrder: 0,
		createdAt: new Date("2026-01-01"),
		...overrides,
		id: overrides.id as CategoryId,
	} as Category;
}

/** Food & Drink (chose red) › Groceries + Restaurants (both inherit it). */
const FOLDER = category({
	id: 1,
	name: "Food & Drink",
	slug: "food-drink",
	icon: "utensils",
	color: "#ef4444",
});
const GROCERIES = category({
	id: 2,
	parentId: 1 as CategoryId,
	icon: "shopping-cart",
});
const RESTAURANTS = category({
	id: 3,
	name: "Restaurants",
	slug: "restaurants",
	parentId: 1 as CategoryId,
	icon: "utensils-crossed",
});

const avatar = () => screen.getByTestId("issuer-avatar");
const glyph = () => document.querySelector("[data-category-icon]");

beforeEach(() => {
	categories = [FOLDER, GROCERIES, RESTAURANTS];
	listCategories.mockClear();
});

describe("IssuerAvatar", () => {
	it("paints the issuer's image when it has one", () => {
		render(<IssuerAvatar imageUrl="/uploads/issuers/7.webp" />);
		expect(document.querySelector("img")).toHaveAttribute(
			"src",
			"/uploads/issuers/7.webp",
		);
		expect(avatar()).toHaveAttribute("data-avatar", "image");
	});

	it("does not read the category tree when an image already wins the chain", async () => {
		render(
			<IssuerAvatar imageUrl="/uploads/issuers/7.webp" defaultCategoryId={2} />,
		);
		await waitFor(() =>
			expect(avatar()).toHaveAttribute("data-avatar", "image"),
		);
		expect(listCategories).not.toHaveBeenCalled();
	});

	it("falls back to the default category's icon on its resolved colour", async () => {
		render(<IssuerAvatar defaultCategoryId={2} />);
		await waitFor(() => {
			expect(glyph()).toHaveAttribute("data-category-icon", "shopping-cart");
		});
		// Red is the *folder*'s: the leaf stores null, meaning inherit (ADR 0006).
		expect(avatar()).toHaveStyle({ backgroundColor: "#ef4444" });
		expect(avatar()).toHaveAttribute("data-avatar", "category");
	});

	it("draws the glyph in an ink that contrasts with the chip, not in the chip's colour", async () => {
		render(<IssuerAvatar defaultCategoryId={2} />);
		await waitFor(() => {
			expect(glyph()).toHaveAttribute("stroke", readableInk("#ef4444"));
		});
		expect(glyph()).not.toHaveAttribute("stroke", "#ef4444");
	});

	it("takes the assigned leaf's icon, so two issuers in one folder stay apart", async () => {
		const { unmount } = render(<IssuerAvatar defaultCategoryId={2} />);
		await waitFor(() => {
			expect(glyph()).toHaveAttribute("data-category-icon", "shopping-cart");
		});
		unmount();

		render(<IssuerAvatar defaultCategoryId={3} />);
		await waitFor(() => {
			expect(glyph()).toHaveAttribute("data-category-icon", "utensils-crossed");
		});
		// Same chip colour (one folder), different glyph — the whole point.
		expect(avatar()).toHaveStyle({ backgroundColor: "#ef4444" });
	});

	/**
	 * The AC's third rung. The assertion that matters is the second one: the grey
	 * state is presentational, so it must not be reached *through* a category —
	 * the seeded *Uncategorised* leaf sits under *Income & Other* and would paint
	 * that folder's violet.
	 */
	it("renders a neutral grey ? for an issuer with no image and no category, without a lookup", async () => {
		render(<IssuerAvatar />);
		expect(screen.getByText("?")).toBeInTheDocument();
		expect(avatar()).toHaveAttribute("data-avatar", "none");
		expect(avatar()).toHaveClass("bg-gousse-bg", "text-gousse-muted");
		// Let any query this render might have started actually fire.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(listCategories).not.toHaveBeenCalled();
		expect(glyph()).toBeNull();
	});

	/**
	 * The grey `?` is an *answer* — "nothing is known about this issuer". An
	 * issuer that does have a category must not be given that answer for a tick
	 * and then contradicted: a grid of imageless issuers would pop from a wall of
	 * `?` to a wall of colour on every load, and the `?` would have been wrong
	 * every time. Same call {@link CategoryIcon} already makes for a chunk still
	 * in flight — reserve the box, draw nothing, let the real answer land.
	 */
	it("draws nothing while the category read is in flight, rather than flashing the grey ?", async () => {
		let release!: (page: { items: Category[]; total: number }) => void;
		listCategories.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);

		render(<IssuerAvatar defaultCategoryId={2} />);
		await waitFor(() => expect(listCategories).toHaveBeenCalled());

		expect(screen.queryByText("?")).not.toBeInTheDocument();
		expect(avatar()).toHaveAttribute("data-avatar", "pending");

		release({ items: categories, total: categories.length });
		await waitFor(() =>
			expect(avatar()).toHaveAttribute("data-avatar", "category"),
		);
		// The chip settles straight onto the real answer — no `?` on either side.
		expect(screen.queryByText("?")).not.toBeInTheDocument();
	});

	it("keeps the grey ? when the issuer's category has been deleted under it", async () => {
		render(<IssuerAvatar defaultCategoryId={404} />);
		await waitFor(() => expect(listCategories).toHaveBeenCalled());
		await waitFor(() => {
			expect(avatar()).toHaveAttribute("data-avatar", "none");
		});
		expect(screen.getByText("?")).toBeInTheDocument();
	});

	it("never paints a name initial — the letter fallback is gone", async () => {
		// `name` is not a prop any more, so no call site can reintroduce it; this
		// pins the rendered output too, for both fallback rungs.
		render(<IssuerAvatar defaultCategoryId={2} />);
		await waitFor(() => expect(glyph()).not.toBeNull());
		expect(avatar().textContent).toBe("");
	});

	it("supports both call-site sizes", async () => {
		const { unmount } = render(<IssuerAvatar />);
		expect(avatar()).toHaveClass("size-6");
		unmount();

		render(<IssuerAvatar size="lg" />);
		expect(avatar()).toHaveClass("size-12");
	});
});
