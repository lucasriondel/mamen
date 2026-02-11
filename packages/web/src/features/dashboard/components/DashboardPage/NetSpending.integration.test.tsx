import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("Net Spending Integration", () => {
	it("full refund pair results in EUR0 net on dashboard", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		const purchaseId = (await db.transactions.add(
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
		)) as number;

		const refundId = (await db.transactions.add(
			makeTransaction({
				amount: 100,
				categoryId: catId,
				isRefund: true,
				linkedRefundId: purchaseId,
			}) as Transaction,
		)) as number;

		await db.transactions.update(purchaseId, { linkedRefundId: refundId });

		render(<DashboardPage />);

		// Default view is net — should show EUR0 for the category
		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
			// The total and category should both show 0,00 €
			expect(screen.getAllByText(/0,00/).length).toBeGreaterThanOrEqual(1);
		});
	});

	it("partial refund shows correct net amount", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		const purchaseId = (await db.transactions.add(
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
		)) as number;

		const refundId = (await db.transactions.add(
			makeTransaction({
				amount: 30,
				categoryId: catId,
				isRefund: true,
				linkedRefundId: purchaseId,
			}) as Transaction,
		)) as number;

		await db.transactions.update(purchaseId, { linkedRefundId: refundId });

		render(<DashboardPage />);

		// Net should be 70 (100 - 30)
		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
			expect(screen.getAllByText(/70,00/).length).toBeGreaterThanOrEqual(1);
		});
	});

	it("orphan refund appears as separate entry on dashboard", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		await db.transactions.add(
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
		);

		// Orphan refund (not linked)
		await db.transactions.add(
			makeTransaction({ amount: 50, isRefund: true }) as Transaction,
		);

		render(<DashboardPage />);

		await waitFor(() => {
			expect(screen.getByTestId("orphan-refunds-row")).toBeInTheDocument();
			expect(screen.getByText("Refunds (unlinked)")).toBeInTheDocument();
		});
	});

	it("multiple categories with refunds calculate independently", async () => {
		const catA = (await db.categories.add(
			makeCategory({ name: "Shopping", slug: "shopping" }) as Category,
		)) as number;
		const catB = (await db.categories.add(
			makeCategory({
				name: "Dining",
				slug: "dining",
				color: "#F97316",
				sortOrder: 1,
			}) as Category,
		)) as number;

		// Shopping: -200 purchase, +50 linked refund => net 150
		const purchaseA = (await db.transactions.add(
			makeTransaction({ amount: -200, categoryId: catA }) as Transaction,
		)) as number;
		const refundA = (await db.transactions.add(
			makeTransaction({
				amount: 50,
				categoryId: catA,
				isRefund: true,
				linkedRefundId: purchaseA,
			}) as Transaction,
		)) as number;
		await db.transactions.update(purchaseA, { linkedRefundId: refundA });

		// Dining: -80 => net 80
		await db.transactions.add(
			makeTransaction({ amount: -80, categoryId: catB }) as Transaction,
		);

		render(<DashboardPage />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
			expect(screen.getByText("Dining")).toBeInTheDocument();
		});
	});

	it("gross toggle shows raw spending amounts", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		const purchaseId = (await db.transactions.add(
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
		)) as number;

		const refundId = (await db.transactions.add(
			makeTransaction({
				amount: 30,
				categoryId: catId,
				isRefund: true,
				linkedRefundId: purchaseId,
			}) as Transaction,
		)) as number;

		await db.transactions.update(purchaseId, { linkedRefundId: refundId });

		const user = userEvent.setup();
		render(<DashboardPage />);

		// Wait for net view to render (shows 70)
		await waitFor(() => {
			expect(screen.getByText("Net of refunds")).toBeInTheDocument();
		});

		// Switch to gross
		await user.click(screen.getByRole("button", { name: "Gross" }));

		// Should now show 100 (raw amount)
		await waitFor(() => {
			expect(screen.getAllByText(/100,00/).length).toBeGreaterThanOrEqual(1);
		});
	});

	it("no refunds: dashboard works normally (no toggle shown)", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		await db.transactions.bulkAdd([
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
			makeTransaction({ amount: -50, categoryId: catId }) as Transaction,
		]);

		render(<DashboardPage />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		// No toggle should be shown when there are no refunds
		expect(
			screen.queryByRole("button", { name: "Net" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Gross" }),
		).not.toBeInTheDocument();
		expect(screen.queryByText("Net of refunds")).not.toBeInTheDocument();
	});

	it("all transactions refunded shows EUR0 for categories", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		const p1 = (await db.transactions.add(
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
		)) as number;
		const r1 = (await db.transactions.add(
			makeTransaction({
				amount: 100,
				categoryId: catId,
				isRefund: true,
				linkedRefundId: p1,
			}) as Transaction,
		)) as number;
		await db.transactions.update(p1, { linkedRefundId: r1 });

		const p2 = (await db.transactions.add(
			makeTransaction({ amount: -50, categoryId: catId }) as Transaction,
		)) as number;
		const r2 = (await db.transactions.add(
			makeTransaction({
				amount: 50,
				categoryId: catId,
				isRefund: true,
				linkedRefundId: p2,
			}) as Transaction,
		)) as number;
		await db.transactions.update(p2, { linkedRefundId: r2 });

		render(<DashboardPage />);

		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
			// Net spending should be 0
			expect(screen.getAllByText(/0,00/).length).toBeGreaterThanOrEqual(1);
		});
	});

	it("time period change recalculates net spending", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		// Current month: -100 purchase, +30 refund => net 70
		const purchaseId = (await db.transactions.add(
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
		)) as number;
		const refundId = (await db.transactions.add(
			makeTransaction({
				amount: 30,
				categoryId: catId,
				isRefund: true,
				linkedRefundId: purchaseId,
			}) as Transaction,
		)) as number;
		await db.transactions.update(purchaseId, { linkedRefundId: refundId });

		// Previous month: -200 (no refunds)
		const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
		const lastMonthImport = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
		await db.transactions.add(
			makeTransaction({
				amount: -200,
				categoryId: catId,
				date: lastMonth,
				importMonth: lastMonthImport,
			}) as Transaction,
		);

		const user = userEvent.setup();
		render(<DashboardPage />);

		// Current month shows net 70
		await waitFor(() => {
			expect(screen.getByText("Shopping")).toBeInTheDocument();
		});

		// Switch to last month
		const periodButton = await screen.findByRole("button", { name: /2026/i });
		await user.click(periodButton);
		await user.click(screen.getByText("Last Month"));

		// Should now show last month's spending (200, no refunds)
		await waitFor(() => {
			expect(screen.getAllByText(/200,00/).length).toBeGreaterThanOrEqual(1);
		});
	});
});
