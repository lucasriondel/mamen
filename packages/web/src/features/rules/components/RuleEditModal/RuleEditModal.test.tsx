import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { RuleEditModal } from "./index";

beforeAll(() => {
	window.ResizeObserver = vi.fn().mockImplementation(() => ({
		observe: vi.fn(),
		unobserve: vi.fn(),
		disconnect: vi.fn(),
	}));
	Element.prototype.scrollIntoView = vi.fn();
});

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

	const merchantId = await db.merchants.add({
		name: "Amazon",
		defaultCategoryId: catId,
		createdAt: new Date(),
		firstSeen: new Date(),
	});

	const ruleId = await db.rules.add({
		merchantId,
		pattern: "AMZN.*",
		matchCount: 42,
		createdAt: new Date(),
	});

	return { catId, merchantId, ruleId };
};

describe("RuleEditModal", () => {
	beforeEach(async () => {
		await db.transactions.clear();
		await db.rules.clear();
		await db.merchants.clear();
		await db.categories.clear();
	});

	it("should display rule pattern and merchant name", async () => {
		const { ruleId } = await seedData();
		render(
			<RuleEditModal
				ruleId={ruleId}
				open
				onOpenChange={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		expect(await screen.findByText("Edit Rule")).toBeInTheDocument();
		expect(await screen.findByText(/Amazon/)).toBeInTheDocument();
		expect(screen.getByDisplayValue("AMZN.*")).toBeInTheDocument();
	});

	it("should show validation error for invalid regex", async () => {
		const { ruleId } = await seedData();
		const user = userEvent.setup();
		render(
			<RuleEditModal
				ruleId={ruleId}
				open
				onOpenChange={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		const input = await screen.findByDisplayValue("AMZN.*");
		await user.clear(input);
		await user.type(input, "(unclosed");

		expect(
			await screen.findByText(/Invalid|Unterminated/i),
		).toBeInTheDocument();
	});

	it("should show valid indicator for valid regex", async () => {
		const { ruleId } = await seedData();
		const user = userEvent.setup();
		render(
			<RuleEditModal
				ruleId={ruleId}
				open
				onOpenChange={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		const input = await screen.findByDisplayValue("AMZN.*");
		await user.clear(input);
		await user.type(input, "AMAZON.*");

		expect(await screen.findByText("Valid regex pattern")).toBeInTheDocument();
	});

	it("should disable save when pattern unchanged", async () => {
		const { ruleId } = await seedData();
		render(
			<RuleEditModal
				ruleId={ruleId}
				open
				onOpenChange={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		await screen.findByDisplayValue("AMZN.*");

		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton).toBeDisabled();
	});

	it("should enable save when pattern changed to valid value", async () => {
		const { ruleId } = await seedData();
		const user = userEvent.setup();
		render(
			<RuleEditModal
				ruleId={ruleId}
				open
				onOpenChange={vi.fn()}
				onSave={vi.fn()}
			/>,
		);

		const input = await screen.findByDisplayValue("AMZN.*");
		await user.clear(input);
		await user.type(input, "AMAZON.*");

		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton).toBeEnabled();
	});

	it("should call onSave with correct data", async () => {
		const { ruleId } = await seedData();
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(
			<RuleEditModal
				ruleId={ruleId}
				open
				onOpenChange={vi.fn()}
				onSave={onSave}
			/>,
		);

		const input = await screen.findByDisplayValue("AMZN.*");
		await user.clear(input);
		await user.type(input, "AMAZON.*");

		await user.click(screen.getByRole("button", { name: /save/i }));

		expect(onSave).toHaveBeenCalledWith(ruleId, {
			pattern: "AMAZON.*",
			categoryOverride: undefined,
		});
	});

	it("should call onOpenChange when cancel clicked", async () => {
		const { ruleId } = await seedData();
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(
			<RuleEditModal
				ruleId={ruleId}
				open
				onOpenChange={onOpenChange}
				onSave={vi.fn()}
			/>,
		);

		await screen.findByText("Edit Rule");

		await user.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
