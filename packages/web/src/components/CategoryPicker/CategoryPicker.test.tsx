import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { CategoryPicker } from "./index";

const CATEGORIES = [
	{ name: "Shopping", color: "#3B82F6", icon: "ShoppingCart", subs: ["Online", "Groceries", "Clothing", "Electronics", "Other"] },
	{ name: "Dining", color: "#F97316", icon: "Utensils", subs: ["Restaurants", "Coffee", "Fast Food", "Delivery"] },
	{ name: "Transportation", color: "#06B6D4", icon: "Car", subs: ["Rideshare", "Public Transit", "Gas", "Parking"] },
	{ name: "Subscriptions", color: "#8B5CF6", icon: "Repeat", subs: ["Streaming", "Software", "Memberships"] },
	{ name: "Housing", color: "#64748B", icon: "Home", subs: ["Rent", "Utilities", "Insurance", "Maintenance"] },
	{ name: "Health", color: "#EF4444", icon: "Heart", subs: ["Medical", "Pharmacy", "Fitness"] },
	{ name: "Entertainment", color: "#EC4899", icon: "Gamepad2", subs: ["Events", "Games", "Hobbies"] },
	{ name: "Travel", color: "#22C55E", icon: "Plane", subs: ["Flights", "Hotels", "Activities"] },
	{ name: "Income", color: "#10B981", icon: "TrendingUp", subs: ["Salary", "Freelance", "Refunds", "Other"] },
	{ name: "Other", color: "#6B7280", icon: "MoreHorizontal", subs: ["Uncategorized"] },
] as const;

const toSlug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

const seedCategories = async () => {
	const now = new Date();
	for (const [i, cat] of CATEGORIES.entries()) {
		const parentId = await db.categories.add({
			name: cat.name, slug: toSlug(cat.name), color: cat.color,
			icon: cat.icon, parentId: null, sortOrder: i, createdAt: now,
		});
		for (const [j, sub] of cat.subs.entries()) {
			await db.categories.add({
				name: sub, slug: `${toSlug(cat.name)}-${toSlug(sub)}`, color: cat.color,
				icon: cat.icon, parentId, sortOrder: j, createdAt: now,
			});
		}
	}
};

beforeAll(() => {
	global.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
	Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(async () => {
	await db.categories.clear();
	await seedCategories();
});

describe("CategoryPicker", () => {
	it("renders all parent categories", async () => {
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		expect(screen.getByText("Dining")).toBeInTheDocument();
		expect(screen.getByText("Transportation")).toBeInTheDocument();
		expect(screen.getByText("Subscriptions")).toBeInTheDocument();
		expect(screen.getByText("Housing")).toBeInTheDocument();
		expect(screen.getByText("Health")).toBeInTheDocument();
		expect(screen.getByText("Entertainment")).toBeInTheDocument();
		expect(screen.getByText("Travel")).toBeInTheDocument();
		expect(screen.getByText("Income")).toBeInTheDocument();
		expect(screen.getByText("Other")).toBeInTheDocument();
	});

	it("renders search input", async () => {
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} />);

		await waitFor(() => {
			expect(
				screen.getByPlaceholderText("Search categories..."),
			).toBeInTheDocument();
		});
	});

	it("filters categories by search", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		const input = screen.getByPlaceholderText("Search categories...");
		await user.type(input, "shop");

		expect(screen.getByText("Shopping")).toBeInTheDocument();
		expect(screen.queryByText("Dining")).not.toBeInTheDocument();
	});

	it("shows no results when search does not match", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		const input = screen.getByPlaceholderText("Search categories...");
		await user.type(input, "xyznonexistent");

		expect(screen.getByText("No categories found.")).toBeInTheDocument();
	});

	it("shows subcategories when parent is selected", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Shopping"));

		await waitFor(() => {
			expect(screen.getByText("Groceries")).toBeInTheDocument();
		});

		expect(screen.getByText("Online")).toBeInTheDocument();
		expect(screen.getByText("Clothing")).toBeInTheDocument();
		expect(screen.getByText("Electronics")).toBeInTheDocument();
		expect(screen.getByText("Back")).toBeInTheDocument();
	});

	it("calls onSelect with subcategory", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Shopping"));

		await waitFor(() => {
			expect(screen.getByText("Groceries")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Groceries"));

		expect(onSelect).toHaveBeenCalledTimes(1);
		const [categoryId, subcategoryId] = onSelect.mock.calls[0];
		expect(typeof categoryId).toBe("number");
		expect(typeof subcategoryId).toBe("number");
	});

	it("allows selecting parent without subcategory", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Shopping"));

		await waitFor(() => {
			expect(screen.getByText("Shopping (no subcategory)")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Shopping (no subcategory)"));

		expect(onSelect).toHaveBeenCalledTimes(1);
		const [categoryId, subcategoryId] = onSelect.mock.calls[0];
		expect(typeof categoryId).toBe("number");
		expect(subcategoryId).toBeUndefined();
	});

	it("navigates back from subcategories", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Shopping"));

		await waitFor(() => {
			expect(screen.getByText("Back")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Back"));

		await waitFor(() => {
			expect(screen.getByText("Dining")).toBeInTheDocument();
		});
	});

	it("calls onSelect directly when allowSubcategory is false", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} allowSubcategory={false} />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Shopping"));

		expect(onSelect).toHaveBeenCalledTimes(1);
		const [categoryId] = onSelect.mock.calls[0];
		expect(typeof categoryId).toBe("number");
	});

	it("has search input with aria-label", async () => {
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} />);

		await waitFor(() => {
			expect(screen.getByLabelText("Search categories")).toBeInTheDocument();
		});
	});

	it("has category list with aria-label", async () => {
		const onSelect = vi.fn();
		render(<CategoryPicker onSelect={onSelect} />);

		await waitFor(() => {
			expect(screen.getByLabelText("Select category")).toBeInTheDocument();
		});
	});
});
