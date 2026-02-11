import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { MerchantDetailPage } from "./index";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

beforeAll(() => {
	global.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
	Element.prototype.scrollIntoView = vi.fn();
	Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
	Element.prototype.setPointerCapture = vi.fn();
	Element.prototype.releasePointerCapture = vi.fn();
});

const seedData = async () => {
	const catId = (await db.categories.add({
		name: "Shopping",
		slug: "shopping",
		color: "#3B82F6",
		icon: "ShoppingCart",
		parentId: null,
		sortOrder: 0,
		createdAt: new Date(),
	})) as number;

	const subCatId = (await db.categories.add({
		name: "Subscriptions",
		slug: "subscriptions",
		color: "#EF4444",
		icon: "CreditCard",
		parentId: null,
		sortOrder: 1,
		createdAt: new Date(),
	})) as number;

	const merchantId = (await db.merchants.add({
		name: "Amazon",
		defaultCategoryId: catId,
		createdAt: new Date(),
		firstSeen: new Date("2024-01-15"),
	})) as number;

	const now = new Date();
	const currentMonth = new Date(now.getFullYear(), now.getMonth(), 10);
	const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

	await db.transactions.bulkAdd([
		{
			accountId: 1,
			date: currentMonth,
			amount: -29.99,
			rawMerchantString: "AMZN*1234XYZ",
			merchantId,
			categoryId: catId,
			importedAt: new Date(),
			importMonth: `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`,
		},
		{
			accountId: 1,
			date: lastMonth,
			amount: -15.0,
			rawMerchantString: "AMAZON PRIME",
			merchantId,
			categoryId: subCatId,
			importedAt: new Date(),
			importMonth: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`,
		},
		{
			accountId: 1,
			date: new Date("2025-06-01"),
			amount: -42.5,
			rawMerchantString: "AMZN*5678ABC",
			merchantId,
			categoryId: catId,
			importedAt: new Date(),
			importMonth: "2025-06",
		},
	]);

	await db.rules.bulkAdd([
		{
			merchantId,
			pattern: "AMZN.*",
			matchCount: 2,
			createdAt: new Date(),
		},
		{
			merchantId,
			pattern: "AMAZON PRIME.*",
			categoryOverride: subCatId,
			matchCount: 1,
			createdAt: new Date(),
		},
	]);

	return { merchantId, catId, subCatId };
};

describe("MerchantDetailPage (integration)", () => {
	beforeEach(async () => {
		await db.merchants.clear();
		await db.transactions.clear();
		await db.rules.clear();
		await db.categories.clear();
		navigateMock.mockClear();
	});

	it("renders full page with merchant data, stats, rules, and transactions", async () => {
		const { merchantId } = await seedData();

		render(<MerchantDetailPage merchantId={merchantId} />);

		// Merchant header
		expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
			"Amazon",
		);

		// Stats section
		expect(screen.getByText("Total Spent")).toBeInTheDocument();
		expect(screen.getAllByText("Transactions")).toHaveLength(2); // stats card + section header
		expect(screen.getByText("3")).toBeInTheDocument();

		// Rules section
		expect(screen.getByText("Matching Rules")).toBeInTheDocument();
		expect(screen.getByText("AMZN.*")).toBeInTheDocument();
		expect(screen.getByText("AMAZON PRIME.*")).toBeInTheDocument();

		// Transactions section
		expect(screen.getByText("AMZN*1234XYZ")).toBeInTheDocument();
		expect(screen.getByText("AMZN*5678ABC")).toBeInTheDocument();

		// Keyboard shortcuts
		expect(screen.getByText("Edit Merchant")).toBeInTheDocument();
		expect(screen.getByText("Change Default")).toBeInTheDocument();
	});

	it("shows 404 for non-existent merchant", async () => {
		render(<MerchantDetailPage merchantId={99999} />);

		await waitFor(() => {
			expect(screen.getByText("Merchant not found")).toBeInTheDocument();
		});
	});

	it("back button navigates to /merchants", async () => {
		const { merchantId } = await seedData();
		const user = userEvent.setup();

		render(<MerchantDetailPage merchantId={merchantId} />);

		await screen.findByText("Amazon");
		await user.click(screen.getByRole("button", { name: /merchants/i }));

		expect(navigateMock).toHaveBeenCalledWith({ to: "/merchants" });
	});

	it("E key opens edit merchant modal", async () => {
		const { merchantId } = await seedData();
		const user = userEvent.setup();

		render(<MerchantDetailPage merchantId={merchantId} />);

		await screen.findByText("Amazon");
		await user.keyboard("e");

		expect(
			await screen.findByRole("heading", { name: "Edit Merchant" }),
		).toBeInTheDocument();
		expect(screen.getByDisplayValue("Amazon")).toBeInTheDocument();
	});

	it("mixed categories note appears when applicable", async () => {
		const { merchantId } = await seedData();

		render(<MerchantDetailPage merchantId={merchantId} />);

		await screen.findByText("Amazon");

		expect(await screen.findByText(/Mixed categories/)).toBeInTheDocument();
	});

	it("time period filter changes transaction list", async () => {
		const { merchantId } = await seedData();
		const user = userEvent.setup();

		render(<MerchantDetailPage merchantId={merchantId} />);

		// Wait for full load
		await screen.findByText("AMZN*1234XYZ");
		expect(screen.getByText("AMZN*5678ABC")).toBeInTheDocument();
		expect(screen.getByText("AMAZON PRIME")).toBeInTheDocument();

		// Switch to "This Month" — should only show current month transactions
		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByText("This Month"));

		await waitFor(() => {
			expect(screen.getByText("AMZN*1234XYZ")).toBeInTheDocument();
			expect(screen.queryByText("AMZN*5678ABC")).not.toBeInTheDocument();
			expect(screen.queryByText("AMAZON PRIME")).not.toBeInTheDocument();
		});
	});

	it("shows stats with correct values", async () => {
		const { merchantId } = await seedData();

		render(<MerchantDetailPage merchantId={merchantId} />);

		await screen.findByText("Amazon");

		// Total spent = abs(-29.99 + -15 + -42.5) = 87.49
		// Transaction count = 3
		expect(screen.getByText("3")).toBeInTheDocument();
		expect(screen.getByText("Total Spent")).toBeInTheDocument();
		expect(screen.getByText("Average")).toBeInTheDocument();
	});
});
