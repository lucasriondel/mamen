import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Rule } from "@/types";
import { RulesListByMerchant } from "./index";

const seedData = async () => {
	const catId = await db.categories.add({
		name: "Shopping",
		slug: "shopping",
		color: "#3b82f6",
		icon: "cart",
		parentId: null,
		sortOrder: 1,
		createdAt: new Date(),
	});

	const amazonId = await db.merchants.add({
		name: "Amazon",
		defaultCategoryId: catId,
		createdAt: new Date(),
		firstSeen: new Date(),
	});

	const netflixId = await db.merchants.add({
		name: "Netflix",
		defaultCategoryId: catId,
		createdAt: new Date(),
		firstSeen: new Date(),
	});

	const rule1Id = await db.rules.add({
		merchantId: amazonId,
		pattern: "AMZN.*",
		matchCount: 42,
		createdAt: new Date(),
	});

	const rule2Id = await db.rules.add({
		merchantId: amazonId,
		pattern: "AMAZON\\.COM.*",
		matchCount: 12,
		createdAt: new Date(),
	});

	const rule3Id = await db.rules.add({
		merchantId: netflixId,
		pattern: "NETFLIX.*",
		matchCount: 8,
		createdAt: new Date(),
	});

	const allRules = await db.rules.toArray();
	return { catId, amazonId, netflixId, allRules };
};

describe("RulesListByMerchant", () => {
	beforeEach(async () => {
		await db.transactions.clear();
		await db.rules.clear();
		await db.merchants.clear();
		await db.categories.clear();
	});

	const defaultProps = {
		searchQuery: "",
		focusedIndex: null,
		flatRules: [] as Rule[],
		onEditRule: vi.fn(),
		onDeleteRule: vi.fn(),
	};

	it("should show empty state when no rules", async () => {
		render(<RulesListByMerchant {...defaultProps} />);
		expect(await screen.findByText("No rules yet")).toBeInTheDocument();
	});

	it("should display merchant groups", async () => {
		const { allRules } = await seedData();
		render(<RulesListByMerchant {...defaultProps} flatRules={allRules} />);

		expect(await screen.findByText("Amazon")).toBeInTheDocument();
		expect(screen.getByText("Netflix")).toBeInTheDocument();
	});

	it("should sort merchants by rule count (most rules first)", async () => {
		const { allRules } = await seedData();
		render(<RulesListByMerchant {...defaultProps} flatRules={allRules} />);

		const groups = await screen.findAllByTestId("merchant-group");
		expect(groups).toHaveLength(2);
		// Amazon (2 rules) should appear before Netflix (1 rule)
		expect(groups[0]).toHaveTextContent("Amazon");
		expect(groups[1]).toHaveTextContent("Netflix");
	});

	it("should toggle collapse when merchant header clicked", async () => {
		const { allRules } = await seedData();
		const user = userEvent.setup();
		render(<RulesListByMerchant {...defaultProps} flatRules={allRules} />);

		await screen.findByText("AMZN.*");

		// Click the Amazon merchant header button (first expanded button)
		const expandedButtons = screen.getAllByRole("button", { expanded: true });
		await user.click(expandedButtons[0]);

		expect(screen.queryByText("AMZN.*")).not.toBeInTheDocument();
	});
});
