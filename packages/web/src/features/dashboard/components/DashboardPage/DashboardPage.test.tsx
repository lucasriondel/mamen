import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Category, Transaction } from "@/types";
import { DashboardPage } from "./index";

beforeAll(() => {
	global.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
});

const now = new Date();
const currentImportMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const makeTransaction = (
	overrides: Partial<Transaction> = {},
): Omit<Transaction, "id"> => ({
	accountId: 1,
	date: now,
	amount: -50,
	rawMerchantString: "STORE",
	importedAt: new Date(),
	importMonth: currentImportMonth,
	...overrides,
});

const makeCategory = (
	overrides: Partial<Category> = {},
): Omit<Category, "id"> => ({
	name: "Shopping",
	slug: "shopping",
	color: "#3B82F6",
	icon: "ShoppingCart",
	parentId: null,
	sortOrder: 0,
	createdAt: new Date(),
	...overrides,
});

beforeEach(async () => {
	await db.transactions.clear();
	await db.categories.clear();
});

describe("DashboardPage", () => {
	it("renders empty state when no transactions", async () => {
		render(<DashboardPage />);

		expect(await screen.findByText("No transactions yet")).toBeInTheDocument();
		expect(screen.getByText(/Import bank statements/i)).toBeInTheDocument();
	});

	it("renders SpendingSummary and CategoryBreakdown when data exists", async () => {
		const catId = await db.categories.add(makeCategory() as Category);

		await db.transactions.bulkAdd([
			makeTransaction({ amount: -100, categoryId: catId as number }),
			makeTransaction({ amount: -50, categoryId: catId as number }),
		]);

		render(<DashboardPage />);

		// SpendingSummary should show total expenses
		expect(await screen.findByText("Total Expenses")).toBeInTheDocument();
		// CategoryBreakdown should show the category
		expect(await screen.findByText("Shopping")).toBeInTheDocument();
	});

	it("renders Import Statements button in empty state", async () => {
		render(<DashboardPage />);

		const button = await screen.findByRole("button", {
			name: /Import Statement/i,
		});
		expect(button).toBeInTheDocument();
	});

	it("renders TimePeriodSelector when data exists", async () => {
		const catId = await db.categories.add(makeCategory() as Category);

		await db.transactions.bulkAdd([
			makeTransaction({
				amount: -100,
				categoryId: catId as number,
				date: new Date(),
			}),
		]);

		render(<DashboardPage />);

		// The period selector trigger button should be visible with a period label
		const periodButton = await screen.findByRole("button", { name: /2026/i });
		expect(periodButton).toBeInTheDocument();
	});

	it("changing period updates displayed data", async () => {
		const catId = await db.categories.add(makeCategory() as Category);

		// Transaction in January (last month from Feb perspective)
		await db.transactions.bulkAdd([
			makeTransaction({
				amount: -100,
				categoryId: catId as number,
				date: new Date(2026, 0, 15),
			}),
		]);

		const user = userEvent.setup();
		render(<DashboardPage />);

		// Wait for the period selector to render
		const periodButton = await screen.findByRole("button", { name: /2026/i });

		// Open period selector and choose "Last Month"
		await user.click(periodButton);
		await user.click(screen.getByText("Last Month"));

		// Data should update - January transaction should be visible
		expect(await screen.findByText("Shopping")).toBeInTheDocument();
	});

	it("shows comparison data when previous period has transactions", async () => {
		const catId = await db.categories.add(makeCategory() as Category);

		// Current period (this month)
		await db.transactions.bulkAdd([
			makeTransaction({ amount: -200, categoryId: catId as number, date: now }),
		]);

		// Previous period (last month)
		const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
		const lastMonthImport = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
		await db.transactions.bulkAdd([
			makeTransaction({
				amount: -100,
				categoryId: catId as number,
				date: lastMonth,
				importMonth: lastMonthImport,
			}),
		]);

		render(<DashboardPage />);

		// Should show comparison indicators (spending went up)
		await screen.findByText("Total Expenses");
		await waitFor(
			() => {
				const indicators = screen.getAllByTestId("comparison-indicator");
				expect(indicators.length).toBeGreaterThanOrEqual(1);
			},
			{ timeout: 3000 },
		);
	});

	it("shows comparison in CategoryBreakdown when previous period exists", async () => {
		const catId = await db.categories.add(makeCategory() as Category);

		// Current period
		await db.transactions.bulkAdd([
			makeTransaction({ amount: -200, categoryId: catId as number, date: now }),
		]);

		// Previous period
		const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
		const lastMonthImport = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
		await db.transactions.bulkAdd([
			makeTransaction({
				amount: -100,
				categoryId: catId as number,
				date: lastMonth,
				importMonth: lastMonthImport,
			}),
		]);

		render(<DashboardPage />);

		// Should have comparison indicators (total + per-category)
		await screen.findByText("Shopping");
		await waitFor(() => {
			const indicators = screen.getAllByTestId("comparison-indicator");
			expect(indicators.length).toBeGreaterThanOrEqual(2); // total + category
		});
	});
});
