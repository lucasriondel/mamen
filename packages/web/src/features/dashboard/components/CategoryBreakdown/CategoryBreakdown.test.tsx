import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SpendingBreakdownItem } from "../../hooks/useSpendingBreakdown";
import { CategoryBreakdown } from "./index";

vi.mock("@/components/ui/tooltip", () => ({
	TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
	Tooltip: ({ children }: { children: React.ReactNode }) => children,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
	TooltipContent: () => null,
}));

vi.mock("../../hooks/useCategoryTooltipData", () => ({
	useCategoryTooltipData: () => null,
}));

import type { ComparisonResult } from "../../utils/computeComparison";

const makeItem = (
	overrides: Partial<SpendingBreakdownItem> = {},
): SpendingBreakdownItem => ({
	categoryId: 1,
	categoryName: "Shopping",
	subcategories: [],
	totalAmount: -100,
	percentage: 50,
	color: "#3B82F6",
	...overrides,
});

describe("CategoryBreakdown", () => {
	it("renders category rows with name, amount, percentage", () => {
		const items = [
			makeItem({ categoryName: "Shopping", totalAmount: -100, percentage: 60 }),
			makeItem({
				categoryId: 2,
				categoryName: "Dining",
				totalAmount: -75,
				percentage: 40,
				color: "#F97316",
			}),
		];

		render(<CategoryBreakdown items={items} totalExpenses={-175} />);

		expect(screen.getByText("Shopping")).toBeInTheDocument();
		expect(screen.getByText("Dining")).toBeInTheDocument();
		expect(screen.getByText("60%")).toBeInTheDocument();
		expect(screen.getByText("40%")).toBeInTheDocument();
	});

	it("renders proportional bars", () => {
		const items = [makeItem({ percentage: 75 })];

		render(<CategoryBreakdown items={items} totalExpenses={-100} />);

		const bar = document.querySelector('[data-testid="category-bar-fill"]');
		expect(bar).toBeInTheDocument();
		expect(bar).toHaveStyle({ width: "75%" });
	});

	it("renders Uncategorized row with distinct styling", () => {
		const items = [
			makeItem({
				categoryId: null,
				categoryName: "Uncategorized",
				totalAmount: -50,
				percentage: 100,
				color: "hsl(215 20% 65%)",
			}),
		];

		render(<CategoryBreakdown items={items} totalExpenses={-50} />);

		const row = screen
			.getByText("Uncategorized")
			.closest('[data-testid="category-row"]');
		expect(row).toHaveAttribute("data-uncategorized", "true");
	});

	it("shows empty state when no data", () => {
		render(<CategoryBreakdown items={[]} totalExpenses={0} />);

		expect(screen.getByText("No spending data")).toBeInTheDocument();
	});

	it("formats amounts with currency symbol", () => {
		const items = [makeItem({ totalAmount: -1234.56 })];

		render(<CategoryBreakdown items={items} totalExpenses={-1234.56} />);

		// formatCurrency with EUR locale returns something like "1.234,56 €"
		expect(screen.getAllByText(/1\.234,56/).length).toBeGreaterThanOrEqual(1);
	});

	it("categories are sorted by amount (renders in order given)", () => {
		const items = [
			makeItem({ categoryName: "First", totalAmount: -200, percentage: 67 }),
			makeItem({
				categoryId: 2,
				categoryName: "Second",
				totalAmount: -100,
				percentage: 33,
			}),
		];

		render(<CategoryBreakdown items={items} totalExpenses={-300} />);

		const rows = screen.getAllByTestId("category-row");
		expect(rows[0]).toHaveTextContent("First");
		expect(rows[1]).toHaveTextContent("Second");
	});

	it("shows per-category comparison indicators", () => {
		const items = [
			makeItem({
				categoryId: 1,
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 60,
			}),
			makeItem({
				categoryId: 2,
				categoryName: "Dining",
				totalAmount: -75,
				percentage: 40,
				color: "#F97316",
			}),
		];

		const catComparisons = new Map<number | null, ComparisonResult>([
			[
				1,
				{
					absoluteChange: 20,
					percentageChange: 25,
					direction: "up",
					hasPreviousData: true,
				},
			],
			[
				2,
				{
					absoluteChange: -10,
					percentageChange: -12,
					direction: "down",
					hasPreviousData: true,
				},
			],
		]);

		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-175}
				categoryComparisons={catComparisons}
				comparisonLabel="vs last month"
			/>,
		);

		const indicators = screen.getAllByTestId("comparison-indicator");
		expect(indicators).toHaveLength(2);
		expect(indicators[0].className).toContain("text-destructive");
		expect(indicators[1].className).toContain("text-green-500");
	});

	it("hides comparison when no data", () => {
		const items = [
			makeItem({
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		render(<CategoryBreakdown items={items} totalExpenses={-100} />);

		expect(
			screen.queryByTestId("comparison-indicator"),
		).not.toBeInTheDocument();
	});

	it('shows "New" for categories not in previous period', () => {
		const items = [
			makeItem({
				categoryId: 1,
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		const catComparisons = new Map<number | null, ComparisonResult>([
			[
				1,
				{
					absoluteChange: 100,
					percentageChange: 100,
					direction: "up",
					hasPreviousData: false,
				},
			],
		]);

		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				categoryComparisons={catComparisons}
				comparisonLabel="vs last month"
			/>,
		);

		expect(screen.getByText("New")).toBeInTheDocument();
	});

	it("clicking a category row calls onCategoryClick with categoryId", async () => {
		const handleClick = vi.fn();
		const items = [makeItem({ categoryId: 5, categoryName: "Shopping" })];

		const user = userEvent.setup();
		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				onCategoryClick={handleClick}
			/>,
		);

		const row = screen.getByTestId("category-row");
		await user.click(row);

		expect(handleClick).toHaveBeenCalledWith(5);
	});

	it("Enter key on focused category triggers onCategoryClick", async () => {
		const handleClick = vi.fn();
		const items = [makeItem({ categoryId: 3, categoryName: "Dining" })];

		const user = userEvent.setup();
		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				onCategoryClick={handleClick}
			/>,
		);

		const row = screen.getByTestId("category-row");
		row.focus();
		await user.keyboard("{Enter}");

		expect(handleClick).toHaveBeenCalledWith(3);
	});

	it("category rows have cursor-pointer when onCategoryClick is provided", () => {
		const items = [makeItem({ categoryId: 1, categoryName: "Shopping" })];

		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				onCategoryClick={vi.fn()}
			/>,
		);

		const row = screen.getByTestId("category-row");
		expect(row.className).toContain("cursor-pointer");
	});

	it("category rows have role=button and aria-label when clickable", () => {
		const items = [makeItem({ categoryId: 1, categoryName: "Shopping" })];

		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				onCategoryClick={vi.fn()}
			/>,
		);

		const button = screen.getByRole("button", {
			name: "View Shopping transactions",
		});
		expect(button).toBeInTheDocument();
	});

	it("uncategorized row is not clickable even when onCategoryClick is provided", async () => {
		const handleClick = vi.fn();
		const items = [
			makeItem({ categoryId: null, categoryName: "Uncategorized" }),
		];

		const user = userEvent.setup();
		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				onCategoryClick={handleClick}
			/>,
		);

		const row = screen.getByTestId("category-row");
		await user.click(row);

		expect(handleClick).not.toHaveBeenCalled();
		expect(row.className).not.toContain("cursor-pointer");
	});

	it("Tab navigates between category rows", async () => {
		const items = [
			makeItem({ categoryId: 1, categoryName: "Shopping" }),
			makeItem({ categoryId: 2, categoryName: "Dining", color: "#F97316" }),
		];

		const user = userEvent.setup();
		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-200}
				onCategoryClick={vi.fn()}
			/>,
		);

		const rows = screen.getAllByTestId("category-row");
		rows[0].focus();
		expect(document.activeElement).toBe(rows[0]);

		await user.tab();
		expect(document.activeElement).toBe(rows[1]);
	});

	it('shows "Net of refunds" label when spendingView is net', () => {
		const items = [
			makeItem({
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				spendingView="net"
				onViewChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("Net of refunds")).toBeInTheDocument();
	});

	it('does not show "Net of refunds" when spendingView is gross', () => {
		const items = [
			makeItem({
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				spendingView="gross"
				onViewChange={vi.fn()}
			/>,
		);

		expect(screen.queryByText("Net of refunds")).not.toBeInTheDocument();
	});

	it("renders gross/net toggle buttons when onViewChange is provided", () => {
		const items = [
			makeItem({
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				spendingView="net"
				onViewChange={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: "Net" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Gross" })).toBeInTheDocument();
	});

	it("calls onViewChange when toggle is clicked", async () => {
		const handleChange = vi.fn();
		const items = [
			makeItem({
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		const user = userEvent.setup();
		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				spendingView="net"
				onViewChange={handleChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Gross" }));
		expect(handleChange).toHaveBeenCalledWith("gross");
	});

	it("does not render toggle or label when spendingView is not provided", () => {
		const items = [
			makeItem({
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		render(<CategoryBreakdown items={items} totalExpenses={-100} />);

		expect(screen.queryByText("Net of refunds")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Net" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Gross" }),
		).not.toBeInTheDocument();
	});

	it("shows orphan refunds row when orphanRefunds > 0", () => {
		const items = [
			makeItem({
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				orphanRefunds={50}
			/>,
		);

		expect(screen.getByTestId("orphan-refunds-row")).toBeInTheDocument();
		expect(screen.getByText("Refunds (unlinked)")).toBeInTheDocument();
		// Amount shown as positive with + prefix
		expect(screen.getByText(/\+.*50/)).toBeInTheDocument();
	});

	it("hides orphan refunds row when orphanRefunds is 0", () => {
		const items = [
			makeItem({
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				orphanRefunds={0}
			/>,
		);

		expect(screen.queryByTestId("orphan-refunds-row")).not.toBeInTheDocument();
	});

	it("hides orphan refunds row when orphanRefunds is undefined", () => {
		const items = [
			makeItem({
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		render(<CategoryBreakdown items={items} totalExpenses={-100} />);

		expect(screen.queryByTestId("orphan-refunds-row")).not.toBeInTheDocument();
	});

	it("shows orphan refund amount in green", () => {
		const items = [
			makeItem({
				categoryName: "Shopping",
				totalAmount: -100,
				percentage: 100,
			}),
		];

		render(
			<CategoryBreakdown
				items={items}
				totalExpenses={-100}
				orphanRefunds={75}
			/>,
		);

		const orphanRow = screen.getByTestId("orphan-refunds-row");
		const greenAmount = orphanRow.querySelector(".text-green-500");
		expect(greenAmount).toBeInTheDocument();
	});
});
