import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Creating a category **from wherever you are** (the leaf picker's "Create …"
 * row), now through the merged **appearance editor** (issue #130).
 *
 * The dialog used to offer an icon picker and deliberately no colour control: a
 * new category inherits, so there was nothing to choose. With one editor there is
 * no reason for the two paths to disagree — the same control, meaning the same
 * thing, whether the category is being created or edited. What must not change is
 * the default: touch nothing and the row is still born `color: null`.
 */

// The icon half windows ~1,600 candidates and jsdom lays nothing out, so the grid
// measures 0 and renders no cells without a viewport to stand in.
beforeAll(() => {
	Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
		configurable: true,
		value: 240,
	});
});

const createCategory = vi.fn();
const toastError = vi.fn();

// Food (folder, red) › Groceries (leaf, inheriting).
const CATEGORIES = [
	{
		id: 1,
		name: "Food",
		slug: "food",
		color: "#ef4444",
		icon: "utensils-crossed",
		parentId: null,
		sortOrder: 0,
	},
	{
		id: 2,
		name: "Groceries",
		slug: "groceries",
		color: null,
		icon: "shopping-cart",
		parentId: 1,
		sortOrder: 0,
	},
];

vi.mock("sonner", () => ({
	toast: { error: (msg: string) => toastError(msg), success: vi.fn() },
}));

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		categoryQueries: {
			list: () => ({
				queryKey: ["categories", "list", "test"],
				queryFn: async () => ({ items: CATEGORIES, total: CATEGORIES.length }),
			}),
		},
		categoryMutations: {
			create: (payload: unknown) => createCategory(payload),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { CategoryCreateDialog } = await import("./category-create-dialog");

beforeEach(() => {
	createCategory.mockReset().mockResolvedValue({
		id: 42,
		name: "Coffee gear",
		slug: "coffee-gear",
		color: null,
		icon: "tag",
		parentId: null,
		sortOrder: 0,
	});
	toastError.mockReset();
});

function renderDialog() {
	render(
		<CategoryCreateDialog
			open
			onOpenChange={vi.fn()}
			initialName="Coffee gear"
		/>,
	);
	return userEvent.setup();
}

/** The dialog's own subtree — the appearance popover portals *into* it. */
const panel = async () => within(await screen.findByRole("dialog"));

async function openAppearance(user: ReturnType<typeof userEvent.setup>) {
	const dialog = await panel();
	await user.click(dialog.getByRole("button", { name: /appearance$/i }));
	await dialog.findByLabelText(/search icons/i);
	return dialog;
}

describe("CategoryCreateDialog", () => {
	it("offers one appearance editor, not an icon picker and no colour", async () => {
		renderDialog();
		const dialog = await panel();

		expect(
			dialog.getByRole("button", { name: "Change Coffee gear appearance" }),
		).toBeInTheDocument();
		expect(
			dialog.queryByRole("button", { name: /change .* icon$/i }),
		).not.toBeInTheDocument();
	});

	it("opens both halves inside the modal, so the grid is reachable", async () => {
		const user = renderDialog();
		const dialog = await openAppearance(user);

		// Portalled into the dialog rather than to `document.body`: outside it the
		// modal's scroll lock leaves the icon grid unscrollable.
		expect(dialog.getByLabelText(/search icons/i)).toBeInTheDocument();
		expect(
			dialog.getByRole("group", { name: /colour palette/i }),
		).toBeInTheDocument();
		expect(dialog.getByLabelText(/hex colour/i)).toBeInTheDocument();
	});

	// The point of the merge, on the create path: both halves chosen up front and
	// carried into the one write that mints the row.
	it("creates the category with the icon and colour chosen up front", async () => {
		const user = renderDialog();
		const dialog = await openAppearance(user);

		await user.type(dialog.getByLabelText(/search icons/i), "shopping-bag");
		await user.click(
			await dialog.findByRole("button", { name: "shopping-bag" }),
		);
		await user.click(dialog.getByRole("button", { name: "Sky" }));
		await user.click(dialog.getByRole("button", { name: /^save$/i }));

		await user.click(dialog.getByRole("button", { name: /create category/i }));

		await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
		expect(createCategory).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Coffee gear",
				slug: "coffee-gear",
				icon: "shopping-bag",
				color: "#0ea5e9",
			}),
		);
	});

	// The editor is a form inside the dialog's form. It portals into the modal, so
	// they are siblings in the DOM — but React propagates events along the
	// *component* tree, so an unstopped submit would mint the category the moment
	// an appearance was saved, before the name had even been checked.
	it("saves the appearance without submitting the dialog", async () => {
		const user = renderDialog();
		const dialog = await openAppearance(user);

		await user.click(dialog.getByRole("button", { name: "Sky" }));
		await user.click(dialog.getByRole("button", { name: /^save$/i }));

		expect(createCategory).not.toHaveBeenCalled();
		// The panel closed and the dialog is still there to be filled in.
		await waitFor(() =>
			expect(dialog.queryByLabelText(/hex colour/i)).not.toBeInTheDocument(),
		);
		expect(dialog.getByLabelText(/category name/i)).toBeInTheDocument();
	});

	// The default is unchanged (ADR 0006): a category nobody restyled is born
	// inheriting, which is what keeps a later folder recolour reaching it.
	it("still creates an inheriting category when the editor is never opened", async () => {
		const user = renderDialog();
		const dialog = await panel();

		await user.click(dialog.getByRole("button", { name: /create category/i }));

		await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
		expect(createCategory).toHaveBeenCalledWith(
			expect.objectContaining({ color: null, icon: "tag" }),
		);
	});

	// The trigger paints what the row *will* look like: nothing stored yet, so it
	// resolves to the parent it would land under.
	it("paints the trigger in the colour the new category would inherit", async () => {
		const user = renderDialog();
		const dialog = await panel();

		await user.click(dialog.getByRole("button", { name: /^top level/i }));
		await screen.findByLabelText("Search parent categories");
		await user.click(await screen.findByText("Food"));

		await waitFor(() =>
			expect(
				dialog
					.getByRole("button", { name: /appearance$/i })
					.querySelector("[data-appearance-color]"),
			).toHaveAttribute("data-appearance-color", "#ef4444"),
		);
	});
});
