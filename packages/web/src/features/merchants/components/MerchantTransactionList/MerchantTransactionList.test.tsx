import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Transaction } from "@/types";
import { MerchantTransactionList } from "./index";

beforeAll(() => {
	global.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
	Element.prototype.scrollIntoView = vi.fn();
	Element.prototype.hasPointerCapture = vi.fn();
	Element.prototype.setPointerCapture = vi.fn();
	Element.prototype.releasePointerCapture = vi.fn();
});

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
	id: 1,
	accountId: 1,
	date: new Date("2026-01-15"),
	amount: -29.99,
	rawMerchantString: "AMZN*1234XYZ",
	merchantId: 1,
	importedAt: new Date(),
	importMonth: "2026-01",
	...overrides,
});

describe("MerchantTransactionList", () => {
	beforeEach(async () => {
		await db.categories.clear();
	});

	it("renders transactions", () => {
		const transactions = [
			makeTx({ id: 1, rawMerchantString: "AMZN*1234" }),
			makeTx({ id: 2, rawMerchantString: "AMZN*5678", amount: -15 }),
		];

		render(
			<MerchantTransactionList
				transactions={transactions}
				categoryDistribution={[]}
				isMixed={false}
				timePeriod="all-time"
				onTimePeriodChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("AMZN*1234")).toBeInTheDocument();
		expect(screen.getByText("AMZN*5678")).toBeInTheDocument();
	});

	it("shows empty state when no transactions", () => {
		render(
			<MerchantTransactionList
				transactions={[]}
				categoryDistribution={[]}
				isMixed={false}
				timePeriod="all-time"
				onTimePeriodChange={vi.fn()}
			/>,
		);

		expect(
			screen.getByText("No transactions for this period"),
		).toBeInTheDocument();
	});

	it("shows mixed categories note when isMixed is true", () => {
		render(
			<MerchantTransactionList
				transactions={[makeTx()]}
				categoryDistribution={[
					{ categoryId: 1, categoryLabel: "Shopping", count: 32 },
					{ categoryId: 2, categoryLabel: "Subscriptions", count: 2 },
				]}
				isMixed={true}
				timePeriod="all-time"
				onTimePeriodChange={vi.fn()}
			/>,
		);

		expect(screen.getByText(/Mixed categories/)).toBeInTheDocument();
		expect(screen.getByText(/32 Shopping/)).toBeInTheDocument();
		expect(screen.getByText(/2 Subscriptions/)).toBeInTheDocument();
	});

	it("hides mixed note when isMixed is false", () => {
		render(
			<MerchantTransactionList
				transactions={[makeTx()]}
				categoryDistribution={[
					{ categoryId: 1, categoryLabel: "Shopping", count: 5 },
				]}
				isMixed={false}
				timePeriod="all-time"
				onTimePeriodChange={vi.fn()}
			/>,
		);

		expect(screen.queryByText(/Mixed categories/)).not.toBeInTheDocument();
	});

	it("calls onTimePeriodChange when period changes", async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();

		render(
			<MerchantTransactionList
				transactions={[]}
				categoryDistribution={[]}
				isMixed={false}
				timePeriod="all-time"
				onTimePeriodChange={handleChange}
			/>,
		);

		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByText("This Month"));
		expect(handleChange).toHaveBeenCalledWith("this-month");
	});
});
