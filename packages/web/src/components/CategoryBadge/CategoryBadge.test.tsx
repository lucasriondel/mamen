import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { CategoryBadge } from "./index";

const seedCategories = async () => {
	const now = new Date();
	const shoppingId = await db.categories.add({
		name: "Shopping",
		slug: "shopping",
		color: "#3B82F6",
		icon: "ShoppingCart",
		parentId: null,
		sortOrder: 0,
		createdAt: now,
	});
	await db.categories.add({
		name: "Groceries",
		slug: "shopping-groceries",
		color: "#3B82F6",
		icon: "ShoppingCart",
		parentId: shoppingId,
		sortOrder: 0,
		createdAt: now,
	});
};

beforeEach(async () => {
	await db.categories.clear();
	await seedCategories();
});

const getShoppingIds = async () => {
	const allCategories = await db.categories.toArray();
	const shopping = allCategories.find(
		(c) => c.name === "Shopping" && c.parentId === null,
	)!;
	const groceries = allCategories.find((c) => c.name === "Groceries")!;
	return { shoppingId: shopping.id!, groceriesId: groceries.id! };
};

describe("CategoryBadge", () => {
	it("displays category name", async () => {
		const { shoppingId } = await getShoppingIds();
		render(<CategoryBadge categoryId={shoppingId} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});
	});

	it("shows color indicator", async () => {
		const { shoppingId } = await getShoppingIds();
		const { container } = render(<CategoryBadge categoryId={shoppingId} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		const colorDot = container.querySelector('span[aria-hidden="true"]');
		expect(colorDot).toBeInTheDocument();
		expect(colorDot).toHaveStyle({ backgroundColor: "#3B82F6" });
	});

	it("displays subcategory when provided", async () => {
		const { shoppingId, groceriesId } = await getShoppingIds();
		render(
			<CategoryBadge categoryId={shoppingId} subcategoryId={groceriesId} />,
		);

		await waitFor(() => {
			expect(screen.getByText("Shopping > Groceries")).toBeInTheDocument();
		});
	});

	it("hides subcategory when showSubcategory is false", async () => {
		const { shoppingId, groceriesId } = await getShoppingIds();
		render(
			<CategoryBadge
				categoryId={shoppingId}
				subcategoryId={groceriesId}
				showSubcategory={false}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		expect(screen.queryByText("Shopping > Groceries")).not.toBeInTheDocument();
	});

	it("returns null for non-existent category", async () => {
		const { container } = render(<CategoryBadge categoryId={99999} />);

		// Wait a tick for the hook to resolve
		await waitFor(() => {
			expect(
				container.querySelector('[data-slot="badge"]'),
			).not.toBeInTheDocument();
		});
	});

	it("applies sm size by default", async () => {
		const { shoppingId } = await getShoppingIds();
		const { container } = render(<CategoryBadge categoryId={shoppingId} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		const badge = container.querySelector('[data-slot="badge"]');
		expect(badge?.className).toContain("h-6");
	});

	it("applies md size when specified", async () => {
		const { shoppingId } = await getShoppingIds();
		const { container } = render(
			<CategoryBadge categoryId={shoppingId} size="md" />,
		);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		const badge = container.querySelector('[data-slot="badge"]');
		expect(badge?.className).toContain("h-7");
	});
});
