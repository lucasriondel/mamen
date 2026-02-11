import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RuleWithMatchCount } from "../../hooks/useMerchantDetail";
import { MerchantDetailRules } from "./index";

const makeRule = (
	overrides: Partial<RuleWithMatchCount> = {},
): RuleWithMatchCount => ({
	id: 1,
	pattern: "AMZN.*",
	categoryOverride: undefined,
	categoryLabel: "(default)",
	matchCount: 28,
	isDefault: true,
	...overrides,
});

describe("MerchantDetailRules", () => {
	it("renders rules with pattern, match count, category indicator", () => {
		const rules = [
			makeRule({ id: 1, pattern: "AMZN.*", matchCount: 28 }),
			makeRule({
				id: 2,
				pattern: "AMAZON PRIME.*",
				matchCount: 2,
				categoryOverride: 5,
				categoryLabel: "Subscriptions",
				isDefault: false,
			}),
		];

		render(
			<MerchantDetailRules
				rules={rules}
				onEditRule={vi.fn()}
				onAddRule={vi.fn()}
			/>,
		);

		expect(screen.getByText("AMZN.*")).toBeInTheDocument();
		expect(screen.getByText("28 matches")).toBeInTheDocument();
		expect(screen.getByText("AMAZON PRIME.*")).toBeInTheDocument();
		expect(screen.getByText("2 matches")).toBeInTheDocument();
	});

	it('shows "(default)" for null categoryOverride, "→ Name" for overrides', () => {
		const rules = [
			makeRule({ id: 1, isDefault: true }),
			makeRule({
				id: 2,
				isDefault: false,
				categoryOverride: 5,
				categoryLabel: "Subscriptions",
			}),
		];

		render(
			<MerchantDetailRules
				rules={rules}
				onEditRule={vi.fn()}
				onAddRule={vi.fn()}
			/>,
		);

		expect(screen.getByText("(default)")).toBeInTheDocument();
		expect(screen.getByText("→ Subscriptions")).toBeInTheDocument();
	});

	it("calls onEditRule when edit button clicked", async () => {
		const user = userEvent.setup();
		const handleEdit = vi.fn();

		render(
			<MerchantDetailRules
				rules={[makeRule({ id: 42 })]}
				onEditRule={handleEdit}
				onAddRule={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Edit" }));
		expect(handleEdit).toHaveBeenCalledWith(42);
	});

	it("calls onAddRule when add button clicked", async () => {
		const user = userEvent.setup();
		const handleAdd = vi.fn();

		render(
			<MerchantDetailRules
				rules={[]}
				onEditRule={vi.fn()}
				onAddRule={handleAdd}
			/>,
		);

		const addButtons = screen.getAllByRole("button", { name: /add/i });
		await user.click(addButtons[addButtons.length - 1]);
		expect(handleAdd).toHaveBeenCalledOnce();
	});

	it("shows empty state when no rules", () => {
		render(
			<MerchantDetailRules
				rules={[]}
				onEditRule={vi.fn()}
				onAddRule={vi.fn()}
			/>,
		);

		expect(screen.getByText("No rules defined")).toBeInTheDocument();
	});

	it('shows singular "match" for 1 match', () => {
		render(
			<MerchantDetailRules
				rules={[makeRule({ matchCount: 1 })]}
				onEditRule={vi.fn()}
				onAddRule={vi.fn()}
			/>,
		);

		expect(screen.getByText("1 match")).toBeInTheDocument();
	});
});
