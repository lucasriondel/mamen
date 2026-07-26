import type { Category, Issuer } from "@mamen/shared/contract";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK seam: the create form reads the issuer `list` (for the local
// duplicate-name guard) and the category `list` (for the leaf picker), and
// writes through `issuerMutations.create`. Real key factories are kept so the
// mutation's invalidation resolves.
const createIssuer = vi.fn();

let issuersList: Issuer[];

// A tiny two-level tree: one folder with a leaf, so the picker offers exactly
// one selectable category.
const CATEGORIES = [
	{
		id: 1,
		name: "Food",
		slug: "food",
		icon: "utensils-crossed",
		parentId: null,
		sortOrder: 0,
	},
	{
		id: 5,
		name: "Groceries",
		slug: "groceries",
		icon: "shopping-cart",
		parentId: 1,
		sortOrder: 0,
	},
] as unknown as Category[];

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerQueries: {
			list: () => ({
				queryKey: ["issuers", "list"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
		},
		categoryQueries: {
			list: () => ({
				queryKey: ["categories", "list"],
				queryFn: async () => ({
					items: CATEGORIES,
					total: CATEGORIES.length,
				}),
			}),
		},
		issuerMutations: {
			create: (payload: unknown) => createIssuer(payload),
		},
	};
});

const { CreateIssuerPage } = await import("./create-issuer-page");

function issuer(overrides: Partial<Issuer> = {}): Issuer {
	return {
		id: 1 as Issuer["id"],
		name: "Spotify",
		createdAt: new Date("2026-01-01"),
		firstSeen: new Date("2026-01-01"),
		...overrides,
	} as Issuer;
}

// Router harness: the real create page at /issuers/new + a stub detail route so
// the post-create navigation target resolves.
function renderPage() {
	const rootRoute = createRootRoute();
	const newRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/new",
		component: CreateIssuerPage,
	});
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId",
		component: () => {
			const { issuerId } = detailRoute.useParams();
			return <p>Detail for issuer {issuerId}</p>;
		},
	});
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/",
		component: () => <p>Issuers grid</p>,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([newRoute, detailRoute, indexRoute]),
		history: createMemoryHistory({ initialEntries: ["/issuers/new"] }),
	});
	render(<RouterProvider router={router} />);
}

beforeEach(() => {
	createIssuer
		.mockReset()
		.mockResolvedValue(issuer({ id: 42 as Issuer["id"] }));
	issuersList = [issuer()];
});

describe("CreateIssuerPage", () => {
	it("disables Save while the name is empty", async () => {
		renderPage();
		const save = await screen.findByRole("button", { name: "Create issuer" });
		expect(save).toBeDisabled();
	});

	it("disables Save when the name duplicates an existing issuer (case-insensitive)", async () => {
		const user = userEvent.setup();
		renderPage();

		const input = await screen.findByLabelText("Issuer name");
		await user.type(input, "  spotify ");

		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Create issuer" }),
			).toBeDisabled(),
		);
	});

	it("creates an issuer with name only, then lands on its detail page", async () => {
		const user = userEvent.setup();
		renderPage();

		const input = await screen.findByLabelText("Issuer name");
		await user.type(input, "  Disney ");
		await user.click(screen.getByRole("button", { name: "Create issuer" }));

		await waitFor(() =>
			expect(createIssuer).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Disney",
					firstSeen: expect.any(Date),
				}),
			),
		);
		// No category chosen -> no defaultCategoryId in the payload.
		expect(createIssuer.mock.calls[0][0]).not.toHaveProperty(
			"defaultCategoryId",
		);

		// Navigated to the new issuer's detail page.
		expect(await screen.findByText("Detail for issuer 42")).toBeInTheDocument();
	});

	it("creates an issuer pre-seeded with a default category", async () => {
		const user = userEvent.setup();
		renderPage();

		const input = await screen.findByLabelText("Issuer name");
		await user.type(input, "Disney");

		// Open the leaf picker and choose the one leaf.
		await user.click(screen.getByRole("button", { name: /No category/ }));
		await screen.findByLabelText("Search categories");
		await user.click(screen.getByText("Groceries"));

		await user.click(screen.getByRole("button", { name: "Create issuer" }));

		await waitFor(() =>
			expect(createIssuer).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Disney",
					defaultCategoryId: 5,
					firstSeen: expect.any(Date),
				}),
			),
		);
		expect(await screen.findByText("Detail for issuer 42")).toBeInTheDocument();
	});

	it("has a back link to the issuers grid", async () => {
		renderPage();
		const back = await screen.findByRole("link", { name: /Issuers/ });
		expect(back).toHaveAttribute("href", "/issuers");
	});
});
