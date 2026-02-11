import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SpendingComparison } from "../../hooks/useSpendingComparison";
import { SpendingSummary } from "./index";

const mockComparison: SpendingComparison = {
	totalComparison: {
		absoluteChange: 150,
		percentageChange: 12,
		direction: "up",
		hasPreviousData: true,
	},
	comparisonLabel: "vs last month",
	categoryComparisons: new Map(),
	previousPeriodTotal: -1000,
};

const mockDecreaseComparison: SpendingComparison = {
	totalComparison: {
		absoluteChange: -75,
		percentageChange: -8,
		direction: "down",
		hasPreviousData: true,
	},
	comparisonLabel: "vs last month",
	categoryComparisons: new Map(),
	previousPeriodTotal: -1000,
};

describe("SpendingSummary", () => {
	it("shows total expenses", () => {
		render(
			<SpendingSummary
				totalExpenses={-1500}
				totalIncome={0}
				categoryCount={3}
				uncategorizedCount={0}
			/>,
		);

		expect(screen.getByText(/1\.500,00/)).toBeInTheDocument();
		expect(screen.getByText("Total Expenses")).toBeInTheDocument();
	});

	it("shows income separately when present", () => {
		render(
			<SpendingSummary
				totalExpenses={-500}
				totalIncome={2000}
				categoryCount={2}
				uncategorizedCount={0}
			/>,
		);

		expect(screen.getByText("Total Income")).toBeInTheDocument();
		expect(screen.getByText(/2\.000,00/)).toBeInTheDocument();
	});

	it("does not show income section when no income", () => {
		render(
			<SpendingSummary
				totalExpenses={-500}
				totalIncome={0}
				categoryCount={2}
				uncategorizedCount={0}
			/>,
		);

		expect(screen.queryByText("Total Income")).not.toBeInTheDocument();
	});

	it("shows uncategorized count as warning when present", () => {
		render(
			<SpendingSummary
				totalExpenses={-500}
				totalIncome={0}
				categoryCount={2}
				uncategorizedCount={5}
			/>,
		);

		expect(screen.getByText("5")).toBeInTheDocument();
		expect(screen.getByText("Uncategorized")).toBeInTheDocument();
	});

	it("does not show uncategorized warning when zero", () => {
		render(
			<SpendingSummary
				totalExpenses={-500}
				totalIncome={0}
				categoryCount={2}
				uncategorizedCount={0}
			/>,
		);

		expect(screen.queryByText("Uncategorized")).not.toBeInTheDocument();
	});

	it("shows comparison when data available", () => {
		render(
			<SpendingSummary
				totalExpenses={-1500}
				totalIncome={0}
				categoryCount={3}
				uncategorizedCount={0}
				comparison={mockComparison}
			/>,
		);

		expect(screen.getByText(/\+12%/)).toBeInTheDocument();
		expect(screen.getByText(/vs last month/)).toBeInTheDocument();
	});

	it("shows correct color for increase (destructive)", () => {
		render(
			<SpendingSummary
				totalExpenses={-1500}
				totalIncome={0}
				categoryCount={3}
				uncategorizedCount={0}
				comparison={mockComparison}
			/>,
		);

		const indicator = screen.getByTestId("comparison-indicator");
		expect(indicator.className).toContain("text-destructive");
	});

	it("shows correct color for decrease (success/green)", () => {
		render(
			<SpendingSummary
				totalExpenses={-1500}
				totalIncome={0}
				categoryCount={3}
				uncategorizedCount={0}
				comparison={mockDecreaseComparison}
			/>,
		);

		const indicator = screen.getByTestId("comparison-indicator");
		expect(indicator.className).toContain("text-green-500");
	});

	it("hides comparison gracefully when undefined", () => {
		render(
			<SpendingSummary
				totalExpenses={-1500}
				totalIncome={0}
				categoryCount={3}
				uncategorizedCount={0}
			/>,
		);

		expect(
			screen.queryByTestId("comparison-indicator"),
		).not.toBeInTheDocument();
	});
});
