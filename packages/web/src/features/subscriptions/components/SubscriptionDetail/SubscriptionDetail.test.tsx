import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Subscription, Transaction } from "@/types";
import { SubscriptionDetail } from "./index";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
}));

const makeSubscription = (
	overrides: Partial<Subscription> = {},
): Subscription => ({
	id: 1,
	merchantId: 10,
	merchantName: "Netflix",
	typicalAmount: -15.99,
	frequency: "monthly",
	intervalDays: 30,
	lastChargeDate: "2026-01-18",
	firstChargeDate: "2025-06-18",
	chargeCount: 8,
	status: "active",
	transactionIds: [100, 101, 102],
	detectedAt: "2026-01-20",
	updatedAt: "2026-01-20",
	...overrides,
});

describe("SubscriptionDetail", () => {
	beforeEach(async () => {
		mockNavigate.mockClear();
		await db.transactions.clear();

		// Seed transactions that the component will load via bulkGet.
		// SubscriptionDetail expects date as string (uses localeCompare).
		await db.transactions.add({
			id: 100,
			accountId: 1,
			date: "2026-01-18",
			amount: -15.99,
			rawMerchantString: "NETFLIX",
			importedAt: new Date(),
			importMonth: "2026-01",
		} as unknown as Transaction);
		await db.transactions.add({
			id: 101,
			accountId: 1,
			date: "2025-12-18",
			amount: -15.99,
			rawMerchantString: "NETFLIX",
			importedAt: new Date(),
			importMonth: "2025-12",
		} as unknown as Transaction);
		await db.transactions.add({
			id: 102,
			accountId: 1,
			date: "2025-11-19",
			amount: -16.49,
			rawMerchantString: "NETFLIX",
			importedAt: new Date(),
			importMonth: "2025-11",
		} as unknown as Transaction);
	});

	it("renders subscription metadata", () => {
		render(<SubscriptionDetail subscription={makeSubscription()} />);

		expect(screen.getByText("Active")).toBeInTheDocument();
		expect(screen.getByText(/Jun 18, 2025/)).toBeInTheDocument();
		expect(screen.getAllByText(/Jan 18, 2026/).length).toBeGreaterThanOrEqual(
			1,
		);
		expect(screen.getByText("8")).toBeInTheDocument();
	});

	it("renders charge history with transaction dates and amounts", async () => {
		render(<SubscriptionDetail subscription={makeSubscription()} />);

		expect(screen.getByText("Charge History")).toBeInTheDocument();

		await waitFor(() => {
			const amounts = screen.getAllByText(/15,99/);
			expect(amounts.length).toBeGreaterThanOrEqual(2);
		});
	});

	it("navigates to merchant page when View Merchant is clicked", async () => {
		const user = userEvent.setup();
		render(<SubscriptionDetail subscription={makeSubscription()} />);

		const link = screen.getByRole("button", { name: /View Merchant/i });
		await user.click(link);

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/merchants/$merchantId",
			params: { merchantId: "10" },
		});
	});

	it("handles empty transactionIds gracefully", () => {
		render(
			<SubscriptionDetail
				subscription={makeSubscription({ transactionIds: [] })}
			/>,
		);

		expect(screen.getByText(/No charge history/)).toBeInTheDocument();
	});
});
