import type { Category } from "@mamen/shared/contract";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The row's icon picker windows ~1,600 candidates, and jsdom lays nothing out,
// so give the grid a real viewport or it measures 0 and renders no cells.
beforeAll(() => {
	Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
		configurable: true,
		value: 240,
	});
});

// Mock the SDK boundary (PRD "Seam 2"): the categories page reads the categories
// `list`, sums each folder through `transactionQueries.count`, and curates the
// tree through `categoryMutations` (create / update / remove). Failures surface
// as a `sonner` toast, mocked here so a refusal message can be asserted.
let categoriesList: Category[];
let listShouldFail: boolean;
let countTotal: number;

// Records the id set each per-folder total is summed over, so a test can assert
// the rollup descends the whole subtree rather than one hop.
const countCalls: unknown[] = [];

const createCategory = vi.fn();
const updateCategory = vi.fn();
const removeCategory = vi.fn();
const spillCategory = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
	toast: {
		error: (msg: string) => toastError(msg),
		success: vi.fn(),
	},
}));

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		categoryQueries: {
			list: () => ({
				queryKey: ["categories", "list", "test"],
				queryFn: async () => {
					if (listShouldFail) throw new Error("boom");
					return { items: categoriesList, total: categoriesList.length };
				},
			}),
		},
		transactionQueries: {
			count: (params: { categoryId?: unknown }) => {
				countCalls.push(params.categoryId);
				return {
					queryKey: ["transactions", "count", params.categoryId],
					queryFn: async () => ({ count: 1, total: countTotal }),
				};
			},
		},
		categoryMutations: {
			create: (payload: unknown) => createCategory(payload),
			update: (id: unknown, payload: unknown) => updateCategory(id, payload),
			spill: (id: unknown, payload: unknown) => spillCategory(id, payload),
			remove: (id: unknown) => removeCategory(id),
		},
	};
});

const { CategoriesView } = await import("./categories-view");

// The view's nodes are `Link`s (issue #25), so render inside a router that knows
// the `/categories` layout and the `/categories/$categoryId` target.
/**
 * Choose a parent in the move dialog. The target is picked from the same
 * searchable popover tree the create flow uses, not a native `select`, so this
 * opens it and clicks the row — a folder is a real option there, since any node
 * is a legal parent (ADR 0003).
 */
async function pickParent(user: UserEvent, name: string) {
	// Scoped to the dialog: the tree behind it carries the same category names,
	// and the trigger is labelled with the *current* parent (or "Top level"), so
	// it is found by its title rather than its text.
	const dialog = within(await screen.findByRole("dialog"));
	await user.click(dialog.getByTitle(/where this category sits/i));
	const listbox = within(await screen.findByRole("listbox"));
	await user.click(await listbox.findByText(name));
}

function renderView() {
	const rootRoute = createRootRoute();
	const categoriesRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/categories",
	});
	const indexRoute = createRoute({
		getParentRoute: () => categoriesRoute,
		path: "/",
		component: CategoriesView,
	});
	const categoryRoute = createRoute({
		getParentRoute: () => categoriesRoute,
		path: "/$categoryId",
		component: () => null,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([
			categoriesRoute.addChildren([indexRoute, categoryRoute]),
		]),
		history: createMemoryHistory({ initialEntries: ["/categories"] }),
	});
	return render(<RouterProvider router={router} />);
}

let nextId = 1;
function category(over: Partial<Category> = {}): Category {
	return {
		id: nextId++ as Category["id"],
		name: "Food",
		slug: "food",
		color: "#ef4444",
		icon: "utensils-crossed",
		parentId: null,
		sortOrder: 0,
		createdAt: new Date("2026-01-01"),
		...over,
	} as Category;
}

// A small two-level tree used by most cases: Food{Groceries, Restaurants} + Home.
function seedTree() {
	const food = category({ name: "Food", slug: "food", sortOrder: 0 });
	const home = category({ name: "Home", slug: "home", sortOrder: 1 });
	// The leaves **inherit**: `color: null` is a reference to Food's colour, which
	// is what the seed migration leaves behind (ADR 0006).
	const groceries = category({
		name: "Groceries",
		slug: "groceries",
		color: null,
		icon: "shopping-cart",
		parentId: food.id,
		sortOrder: 0,
	});
	const restaurants = category({
		name: "Restaurants",
		slug: "restaurants",
		color: null,
		icon: "utensils",
		parentId: food.id,
		sortOrder: 1,
	});
	categoriesList = [food, home, groceries, restaurants];
	return { food, home, groceries, restaurants };
}

// The icon and the swatch are the *editors* for what they show (issue #58), so
// each is a button on the row rather than a decoration inside the navigation
// link — which is also how a test reaches the glyph and the colour it paints.
const iconIn = async (name: string) =>
	(
		await screen.findByRole("button", { name: `Change ${name} icon` })
	).querySelector("[data-category-icon]");

const swatchIn = async (name: string) =>
	(
		await screen.findByRole("button", { name: `Change ${name} colour` })
	).querySelector("[data-color-swatch]");

describe("CategoriesView", () => {
	beforeEach(() => {
		nextId = 1;
		categoriesList = [];
		listShouldFail = false;
		countTotal = 0;
		countCalls.length = 0;
		createCategory.mockReset().mockResolvedValue(category());
		updateCategory.mockReset().mockResolvedValue(category());
		spillCategory.mockReset().mockResolvedValue(category());
		removeCategory.mockReset().mockResolvedValue(undefined);
		toastError.mockReset();
	});

	it("renders each folder with its leaves grouped beneath it", async () => {
		seedTree();
		renderView();

		const foodGroup = await screen.findByRole("group", { name: /food/i });

		expect(within(foodGroup).getByText("Groceries")).toBeInTheDocument();
		expect(within(foodGroup).getByText("Restaurants")).toBeInTheDocument();
		// Home is an empty root — under childlessness (ADR 0003 / issue #32) it is
		// a leaf, not a grouping folder, so it renders as a plain row, never a
		// group, and never holds Food's leaves.
		expect(
			screen.queryByRole("group", { name: /home/i }),
		).not.toBeInTheDocument();
		expect(screen.getByText("Home")).toBeInTheDocument();
	});

	it("renders a nested folder as a folder, to arbitrary depth", async () => {
		// Life > Subscriptions > Streaming: Subscriptions is a mid-tier folder and
		// must render as one (a group), nested inside Life — not flattened away.
		const life = category({ name: "Life", slug: "life", sortOrder: 0 });
		const subs = category({
			name: "Subscriptions",
			slug: "subscriptions",
			parentId: life.id,
			sortOrder: 0,
		});
		const streaming = category({
			name: "Streaming services",
			slug: "streaming-services",
			parentId: subs.id,
			sortOrder: 0,
		});
		categoriesList = [life, subs, streaming];
		renderView();

		const lifeGroup = await screen.findByRole("group", { name: /life/i });
		const subsGroup = within(lifeGroup).getByRole("group", {
			name: /subscriptions/i,
		});
		expect(
			within(subsGroup).getByText("Streaming services"),
		).toBeInTheDocument();
	});

	it("shows a signed Category total on each folder", async () => {
		seedTree();
		countTotal = -42.5;
		renderView();

		// The total comes from the `count` endpoint over the folder's leaf ids.
		const total = await screen.findByLabelText(/food total/i);
		await waitFor(() => expect(total).toHaveTextContent(/42/));
	});

	it("descends the whole subtree for a folder's total", async () => {
		// Home > Utilities > Electricity: the folder total must reach the depth-3
		// leaf, not stop one hop down, or the money below the second level vanishes
		// from the total silently (the hole #28 opened, closed here).
		const home = category({ name: "Home", slug: "home", sortOrder: 0 });
		const utilities = category({
			name: "Utilities",
			slug: "utilities",
			parentId: home.id,
			sortOrder: 0,
		});
		const electricity = category({
			name: "Electricity",
			slug: "electricity",
			parentId: utilities.id,
			sortOrder: 0,
		});
		categoriesList = [home, utilities, electricity];

		renderView();

		await screen.findByRole("group", { name: /home/i });
		// The root's total is summed over its deep leaf id, not the mid-tier
		// Utilities folder that holds no money of its own — the depth-3 money is
		// counted, not dropped.
		await waitFor(() => expect(countCalls).toContainEqual([electricity.id]));
	});

	it("shows an empty state when there are no categories", async () => {
		categoriesList = [];
		renderView();
		expect(await screen.findByText(/no categories/i)).toBeInTheDocument();
	});

	it("shows an error state when the list read fails", async () => {
		listShouldFail = true;
		renderView();
		expect(
			await screen.findByText(/couldn't load categories/i, undefined, {
				timeout: 4000,
			}),
		).toBeInTheDocument();
	});

	it("creates a root category from the header action, with no parent", async () => {
		const user = userEvent.setup();
		seedTree();
		renderView();

		// One create gesture: the header makes a category with no parent (a root),
		// not a distinct "folder" variant (issue #32).
		await user.click(
			await screen.findByRole("button", { name: /new category/i }),
		);
		await user.type(screen.getByLabelText(/category name/i), "Leisure");
		await user.click(screen.getByRole("button", { name: /create category/i }));

		await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
		expect(createCategory).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Leisure",
				slug: "leisure",
				parentId: null,
			}),
		);
	});

	// The hardcoded `#94a3b8` is gone (ADR 0006 / issue #55): a new category is
	// born **inheriting**, so creating one inside a folder picks up that folder's
	// colour and a later folder recolour keeps reaching it.
	it("creates a category with an inherited colour and a Lucide icon name", async () => {
		const user = userEvent.setup();
		const { food } = seedTree();
		renderView();

		const foodGroup = await screen.findByRole("group", { name: /food/i });
		await user.click(
			within(foodGroup).getByRole("button", { name: /add category in food/i }),
		);
		await user.type(screen.getByLabelText(/category name/i), "Cafés");
		await user.click(screen.getByRole("button", { name: /create category/i }));

		await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
		expect(createCategory).toHaveBeenCalledWith(
			expect.objectContaining({ color: null, icon: "tag", parentId: food.id }),
		);
	});

	// The **Resolved colour** on the surface that shows it. The page never reads
	// `color` — it resolves — which is what makes a folder recolour visible on
	// every descendant that never opted out (the walk itself is covered at the
	// `resolveCategoryColor` seam).
	it("paints an inheriting leaf in its folder's colour, and a leaf with its own colour in that", async () => {
		const { food, restaurants } = seedTree();
		// One leaf opts out; its sibling keeps inheriting.
		categoriesList = categoriesList.map((cat) =>
			cat.id === restaurants.id ? { ...cat, color: "#000000" } : cat,
		);
		renderView();

		// Groceries stores no colour, so it paints Food's — with its *own* icon:
		// depth adds navigation, not identity.
		await waitFor(async () => {
			const groceries = await iconIn("Groceries");
			expect(groceries).toHaveAttribute("stroke", food.color);
			expect(groceries).toHaveAttribute("data-category-icon", "shopping-cart");
		});
		expect(await iconIn("Restaurants")).toHaveAttribute("stroke", "#000000");
	});

	// The row's swatch is the **Resolved colour** made visible, which is what makes
	// a folder recolour demoable: the inheriting leaf tracks the folder above it
	// without storing anything of its own (ADR 0006 / issue #58).
	it("shows the resolved colour on each row's swatch, inherited or chosen", async () => {
		const { food, restaurants } = seedTree();
		categoriesList = categoriesList.map((cat) =>
			cat.id === restaurants.id ? { ...cat, color: "#000000" } : cat,
		);
		renderView();

		expect(await swatchIn("Food")).toHaveAttribute(
			"data-color-swatch",
			food.color,
		);
		// Groceries stores nothing, yet its swatch is Food's colour, not a blank.
		expect(await swatchIn("Groceries")).toHaveAttribute(
			"data-color-swatch",
			food.color,
		);
		expect(await swatchIn("Restaurants")).toHaveAttribute(
			"data-color-swatch",
			"#000000",
		);
	});

	// The whole reason the swatch shows the *resolved* colour rather than the
	// stored one (issue #58): recolour the folder and the leaf that never opted
	// out repaints with it. Every other case here asserts one row in isolation, so
	// none of them can tell inheritance apart from a colour copied onto each row —
	// only observing a descendant move on someone else's write can.
	it("propagates a folder recolour to its inheriting descendants", async () => {
		const user = userEvent.setup();
		const { food, restaurants } = seedTree();
		// Let the mocked write land in the list the refetch reads back, so this
		// watches the row repaint rather than re-asserting the request.
		updateCategory.mockImplementation((id: unknown, patch: object) => {
			categoriesList = categoriesList.map((cat) =>
				cat.id === id ? { ...cat, ...patch } : cat,
			);
			return Promise.resolve(categoriesList.find((cat) => cat.id === id));
		});
		// One sibling opts out, so the propagation has to be selective rather than
		// "repaint the subtree".
		categoriesList = categoriesList.map((cat) =>
			cat.id === restaurants.id ? { ...cat, color: "#000000" } : cat,
		);
		renderView();

		expect(await swatchIn("Groceries")).toHaveAttribute(
			"data-color-swatch",
			food.color,
		);

		await user.click(
			await screen.findByRole("button", { name: /change food colour/i }),
		);
		const field = screen.getByLabelText(/hex colour/i);
		await user.clear(field);
		await user.type(field, "#123abc");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		// One write, on Food alone — Groceries follows because it *refers* to its
		// ancestor, and nothing was written to it.
		await waitFor(async () =>
			expect(await swatchIn("Groceries")).toHaveAttribute(
				"data-color-swatch",
				"#123abc",
			),
		);
		expect(updateCategory).toHaveBeenCalledTimes(1);
		expect(updateCategory).toHaveBeenCalledWith(food.id, { color: "#123abc" });
		// The icon chip is tinted from the same resolution, so it moves too.
		expect(await iconIn("Groceries")).toHaveAttribute("stroke", "#123abc");
		// Restaurants chose its own colour, so the recolour stops at it.
		expect(await swatchIn("Restaurants")).toHaveAttribute(
			"data-color-swatch",
			"#000000",
		);
	});

	it("changes a category's icon from the tree row", async () => {
		const user = userEvent.setup();
		const { groceries } = seedTree();
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /change groceries icon/i }),
		);
		await user.type(screen.getByLabelText(/search icons/i), "shopping-bag");
		await user.click(
			await screen.findByRole("button", { name: "shopping-bag" }),
		);

		await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1));
		// Only the icon — the row's other fields are not rewritten in passing.
		expect(updateCategory).toHaveBeenCalledWith(groceries.id, {
			icon: "shopping-bag",
		});
	});

	it("stores a hex typed on the row's colour swatch", async () => {
		const user = userEvent.setup();
		const { groceries } = seedTree();
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /change groceries colour/i }),
		);
		await user.type(screen.getByLabelText(/hex colour/i), "#123abc");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1));
		expect(updateCategory).toHaveBeenCalledWith(groceries.id, {
			color: "#123abc",
		});
	});

	it("clears a leaf's own colour back to null, so it inherits again", async () => {
		const user = userEvent.setup();
		const { restaurants } = seedTree();
		categoriesList = categoriesList.map((cat) =>
			cat.id === restaurants.id ? { ...cat, color: "#000000" } : cat,
		);
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /change restaurants colour/i }),
		);
		await user.click(screen.getByRole("button", { name: /inherit/i }));

		// `null`, not a colour copied from the parent: the leaf resumes *referring*
		// to its ancestor, so a later folder recolour keeps reaching it.
		await waitFor(() =>
			expect(updateCategory).toHaveBeenCalledWith(restaurants.id, {
				color: null,
			}),
		);
	});

	it("refuses an invalid hex from the row without writing", async () => {
		const user = userEvent.setup();
		seedTree();
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /change groceries colour/i }),
		);
		await user.type(screen.getByLabelText(/hex colour/i), "nope");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(updateCategory).not.toHaveBeenCalled();
	});

	// The pickers are inline on the row precisely so the dialogs stay
	// single-purpose (issue #58) — a rename asks for a name and nothing else.
	it("leaves the rename dialog single-purpose", async () => {
		const user = userEvent.setup();
		seedTree();
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /rename groceries/i }),
		);
		const dialog = screen.getByRole("dialog");

		expect(within(dialog).getByLabelText(/category name/i)).toBeInTheDocument();
		expect(within(dialog).queryByLabelText(/hex colour/i)).toBeNull();
		expect(within(dialog).queryByLabelText(/search icons/i)).toBeNull();
	});

	it("creates a leaf inside a chosen folder", async () => {
		const user = userEvent.setup();
		const { food } = seedTree();
		renderView();

		const foodGroup = await screen.findByRole("group", { name: /food/i });
		await user.click(
			within(foodGroup).getByRole("button", { name: /add category in food/i }),
		);
		await user.type(screen.getByLabelText(/category name/i), "Cafés");
		await user.click(screen.getByRole("button", { name: /create category/i }));

		await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
		expect(createCategory).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Cafés", parentId: food.id }),
		);
	});

	it("renames a category without moving it", async () => {
		const user = userEvent.setup();
		const { groceries } = seedTree();
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /rename groceries/i }),
		);
		const field = screen.getByLabelText(/category name/i);
		await user.clear(field);
		await user.type(field, "Supermarket");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1));
		expect(updateCategory).toHaveBeenCalledWith(groceries.id, {
			name: "Supermarket",
		});
	});

	it("moves a leaf to a different parent", async () => {
		const user = userEvent.setup();
		const { home, groceries } = seedTree();
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /move groceries/i }),
		);
		await pickParent(user, home.name);
		await user.click(screen.getByRole("button", { name: /^move$/i }));

		await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1));
		expect(updateCategory).toHaveBeenCalledWith(groceries.id, {
			parentId: home.id,
		});
	});

	it("moves a whole folder under another — any node, not only a leaf", async () => {
		const user = userEvent.setup();
		const { food, home } = seedTree();
		renderView();

		// The Move gesture is offered on a folder (Food), and its target picker
		// lists every category path-labelled, the moved subtree excluded (#32).
		await user.click(await screen.findByRole("button", { name: /move food/i }));
		await pickParent(user, home.name);
		await user.click(screen.getByRole("button", { name: /^move$/i }));

		await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1));
		expect(updateCategory).toHaveBeenCalledWith(food.id, {
			parentId: home.id,
		});
	});

	it("surfaces the cycle refusal legibly, not as a raw error", async () => {
		const user = userEvent.setup();
		const { food, home } = seedTree();
		// The picker pre-empts the obvious cycle (a node's own subtree is not
		// offered), but the API is the real guard — for a seed, an import, or a
		// racing edit. When it refuses (`CategoryWouldCycle`) the move must read as
		// a sentence, never a raw tag (issue #31 surfaced here, #32).
		updateCategory.mockRejectedValue({
			_tag: "CategoryWouldCycle",
			categoryId: food.id,
			parentId: home.id,
		});
		renderView();

		await user.click(await screen.findByRole("button", { name: /move food/i }));
		await pickParent(user, home.name);
		await user.click(screen.getByRole("button", { name: /^move$/i }));

		await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
		expect(toastError.mock.calls[0][0]).toMatch(/under itself|sub-categor/i);
	});

	it("deletes a category when nothing depends on it", async () => {
		const user = userEvent.setup();
		const { groceries } = seedTree();
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /delete groceries/i }),
		);
		await waitFor(() =>
			expect(removeCategory).toHaveBeenCalledWith(groceries.id),
		);
		expect(toastError).not.toHaveBeenCalled();
	});

	it("nests a category under a childless leaf with no ceremony", async () => {
		const user = userEvent.setup();
		const { groceries } = seedTree();
		renderView();

		// Groceries is a childless leaf; adding a child simply turns it into a
		// folder — no refusal, no spill.
		await user.click(
			await screen.findByRole("button", {
				name: /add category in groceries/i,
			}),
		);
		await user.type(screen.getByLabelText(/category name/i), "Organic");
		await user.click(screen.getByRole("button", { name: /create category/i }));

		await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
		expect(createCategory).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Organic", parentId: groceries.id }),
		);
		expect(spillCategory).not.toHaveBeenCalled();
	});

	it("offers spill when nesting under a money-holding leaf, then moves the money", async () => {
		const user = userEvent.setup();
		const { groceries } = seedTree();
		// The API refuses the Kind flip: Groceries still holds money.
		createCategory.mockRejectedValue({
			_tag: "CategoryHoldsMoney",
			categoryId: groceries.id,
			transactions: 40,
			issuers: 1,
		});
		renderView();

		await user.click(
			await screen.findByRole("button", {
				name: /add category in groceries/i,
			}),
		);
		await user.type(screen.getByLabelText(/category name/i), "Organic");
		await user.click(screen.getByRole("button", { name: /create category/i }));

		// The refusal is not a toast dead-end: the spill step appears, naming what
		// depends on the node.
		const spillField = await screen.findByLabelText(/spill category name/i);
		expect(
			screen.getByText(/40 transactions and 1 issuer default/i),
		).toBeInTheDocument();
		expect(toastError).not.toHaveBeenCalled();

		// The user names the destination — never auto-filled — and the money moves.
		await user.type(spillField, "Streaming services");
		await user.click(screen.getByRole("button", { name: /^spill$/i }));

		await waitFor(() => expect(spillCategory).toHaveBeenCalledTimes(1));
		expect(spillCategory).toHaveBeenCalledWith(
			groceries.id,
			expect.objectContaining({
				name: "Streaming services",
				slug: "streaming-services",
			}),
		);
	});

	it("builds Life > Subscriptions > Streaming services through the UI alone", async () => {
		// The issue's demo: a three-deep branch, created end-to-end with the one
		// create gesture — a root, then a child, then a grandchild — no folder
		// variant, no depth ceiling (#32). The mock echoes each created node back so
		// the tree deepens between steps.
		const user = userEvent.setup();
		categoriesList = [];

		const life = category({ name: "Life", slug: "life", sortOrder: 0 });
		const subs = category({
			name: "Subscriptions",
			slug: "subscriptions",
			parentId: life.id,
			sortOrder: 0,
		});
		const streaming = category({
			name: "Streaming services",
			slug: "streaming-services",
			parentId: subs.id,
			sortOrder: 0,
		});

		// Each create echoes its node back *and* lands it in the list, so the
		// post-create refetch (the mutation invalidates) deepens the tree — exactly
		// as the server would.
		createCategory
			.mockImplementationOnce(() => {
				categoriesList = [life];
				return Promise.resolve(life);
			})
			.mockImplementationOnce(() => {
				categoriesList = [life, subs];
				return Promise.resolve(subs);
			})
			.mockImplementationOnce(() => {
				categoriesList = [life, subs, streaming];
				return Promise.resolve(streaming);
			});

		// Step 1: a root category from the header, no parent.
		renderView();
		await user.click(
			await screen.findByRole("button", { name: /new category/i }),
		);
		await user.type(screen.getByLabelText(/category name/i), "Life");
		await user.click(screen.getByRole("button", { name: /create category/i }));
		await waitFor(() =>
			expect(createCategory).toHaveBeenLastCalledWith(
				expect.objectContaining({ name: "Life", parentId: null }),
			),
		);

		// Step 2: nest Subscriptions under Life via its Add category action.
		await user.click(
			await screen.findByRole("button", { name: /add category in life/i }),
		);
		await user.type(screen.getByLabelText(/category name/i), "Subscriptions");
		await user.click(screen.getByRole("button", { name: /create category/i }));
		await waitFor(() =>
			expect(createCategory).toHaveBeenLastCalledWith(
				expect.objectContaining({ name: "Subscriptions", parentId: life.id }),
			),
		);

		// Step 3: nest Streaming services under Subscriptions — depth 3.
		await user.click(
			await screen.findByRole("button", {
				name: /add category in subscriptions/i,
			}),
		);
		await user.type(
			screen.getByLabelText(/category name/i),
			"Streaming services",
		);
		await user.click(screen.getByRole("button", { name: /create category/i }));
		await waitFor(() =>
			expect(createCategory).toHaveBeenLastCalledWith(
				expect.objectContaining({
					name: "Streaming services",
					parentId: subs.id,
				}),
			),
		);

		// End state: the three-deep branch renders, folders nested to depth 3.
		const lifeGroup = await screen.findByRole("group", { name: /life/i });
		const subsGroup = within(lifeGroup).getByRole("group", {
			name: /subscriptions/i,
		});
		expect(
			within(subsGroup).getByText("Streaming services"),
		).toBeInTheDocument();
	});

	it("surfaces the guarded-delete refusal, naming what depends on it", async () => {
		const user = userEvent.setup();
		const { food } = seedTree();
		// The API refuses to delete a folder with children — CategoryInUse names them.
		removeCategory.mockRejectedValue({
			_tag: "CategoryInUse",
			categoryId: food.id,
			children: 2,
			transactions: 0,
			issuers: 0,
		});
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /delete food/i }),
		);

		await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
		expect(toastError.mock.calls[0][0]).toMatch(/2 categories inside/i);
	});
});
