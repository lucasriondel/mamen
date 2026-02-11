import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MerchantStats } from "../../hooks/useMerchantDetail";
import { MerchantStatsCards } from "./index";

const makeStats = (overrides: Partial<MerchantStats> = {}): MerchantStats => ({
	totalSpent: 1247.5,
	transactionCount: 34,
	averageAmount: 36.69,
	monthlyAverage: 156.88,
	firstSeen: new Date("2024-01-15"),
	lastSeen: new Date("2026-02-05"),
	monthOverMonth: {
		amount: 150,
		percentage: 12,
		hasData: true,
	},
	...overrides,
});

describe("MerchantStatsCards", () => {
	it("renders all stat values", () => {
		render(<MerchantStatsCards stats={makeStats()} />);

		expect(screen.getByText("Total Spent")).toBeInTheDocument();
		expect(screen.getByText("Transactions")).toBeInTheDocument();
		expect(screen.getByText("Average")).toBeInTheDocument();
		expect(screen.getByText("Last Seen")).toBeInTheDocument();
		expect(screen.getByText("34")).toBeInTheDocument();
	});

	it("shows correct color for positive month-over-month (spending up = destructive)", () => {
		const { container } = render(
			<MerchantStatsCards
				stats={makeStats({
					monthOverMonth: { amount: 150, percentage: 12, hasData: true },
				})}
			/>,
		);

		const trendUp = container.querySelector(".text-destructive");
		expect(trendUp).toBeInTheDocument();
		expect(screen.getByText(/\+12%/)).toBeInTheDocument();
	});

	it("shows correct color for negative month-over-month (spending down = green)", () => {
		const { container } = render(
			<MerchantStatsCards
				stats={makeStats({
					monthOverMonth: { amount: -75, percentage: -8, hasData: true },
				})}
			/>,
		);

		const trendDown = container.querySelector(".text-green-500");
		expect(trendDown).toBeInTheDocument();
		expect(screen.getByText(/-8%/)).toBeInTheDocument();
	});

	it('handles hasData=false by showing "No previous data"', () => {
		render(
			<MerchantStatsCards
				stats={makeStats({
					monthOverMonth: { amount: 0, percentage: 0, hasData: false },
				})}
			/>,
		);

		expect(screen.getByText("No previous data")).toBeInTheDocument();
	});

	it("shows dash when no lastSeen date", () => {
		render(<MerchantStatsCards stats={makeStats({ lastSeen: null })} />);

		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("does not show first seen when null", () => {
		render(<MerchantStatsCards stats={makeStats({ firstSeen: null })} />);

		expect(screen.queryByText(/First seen/)).not.toBeInTheDocument();
	});
});
