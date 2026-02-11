import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { RuleWithMatchCount } from "../../hooks/useMerchantDetail";
import { RuleDetailModal } from "./index";

beforeAll(() => {
	global.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
	Element.prototype.scrollIntoView = vi.fn();
});

const makeRule = (
	overrides: Partial<RuleWithMatchCount> = {},
): RuleWithMatchCount => ({
	id: 1,
	pattern: "AMZN.*",
	categoryOverride: undefined,
	categoryLabel: "(default)",
	matchCount: 5,
	isDefault: true,
	...overrides,
});

describe("RuleDetailModal", () => {
	beforeEach(async () => {
		await db.categories.clear();
		await db.transactions.clear();
		await db.rules.clear();
	});

	it("edit mode pre-fills pattern", () => {
		const rule = makeRule({ pattern: "AMZN.*" });

		render(
			<RuleDetailModal
				isOpen={true}
				onClose={vi.fn()}
				merchantId={1}
				merchantName="Amazon"
				rule={rule}
				onSave={vi.fn()}
			/>,
		);

		expect(screen.getByText("Edit Rule")).toBeInTheDocument();
		expect(screen.getByDisplayValue("AMZN.*")).toBeInTheDocument();
		expect(screen.getByText("Merchant: Amazon")).toBeInTheDocument();
	});

	it("add mode shows empty fields", () => {
		render(
			<RuleDetailModal
				isOpen={true}
				onClose={vi.fn()}
				merchantId={1}
				merchantName="Amazon"
				rule={null}
				onSave={vi.fn()}
			/>,
		);

		expect(
			screen.getByRole("heading", { name: "Add Rule" }),
		).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Enter regex pattern...")).toHaveValue(
			"",
		);
	});

	it("validates regex pattern", async () => {
		const user = userEvent.setup();

		render(
			<RuleDetailModal
				isOpen={true}
				onClose={vi.fn()}
				merchantId={1}
				merchantName="Amazon"
				rule={null}
				onSave={vi.fn()}
			/>,
		);

		const input = screen.getByPlaceholderText("Enter regex pattern...");
		// Use fireEvent instead of userEvent.type because brackets are special chars in userEvent
		await user.click(input);
		await user.paste("[invalid(");

		expect(
			await screen.findByText(/Invalid|Unterminated/i),
		).toBeInTheDocument();
	});

	it("shows valid indicator for correct regex", async () => {
		const user = userEvent.setup();

		render(
			<RuleDetailModal
				isOpen={true}
				onClose={vi.fn()}
				merchantId={1}
				merchantName="Amazon"
				rule={null}
				onSave={vi.fn()}
			/>,
		);

		const input = screen.getByPlaceholderText("Enter regex pattern...");
		await user.type(input, "AMZN.*");

		expect(await screen.findByText("Valid regex pattern")).toBeInTheDocument();
	});

	it("calls onSave with pattern data", async () => {
		const user = userEvent.setup();
		const handleSave = vi.fn().mockResolvedValue(undefined);

		render(
			<RuleDetailModal
				isOpen={true}
				onClose={vi.fn()}
				merchantId={1}
				merchantName="Amazon"
				rule={null}
				onSave={handleSave}
			/>,
		);

		const input = screen.getByPlaceholderText("Enter regex pattern...");
		await user.type(input, "AMZN.*");
		await user.click(screen.getByRole("button", { name: "Add Rule" }));

		expect(handleSave).toHaveBeenCalledWith({
			pattern: "AMZN.*",
			categoryOverride: undefined,
		});
	});

	it("shows delete button in edit mode", () => {
		const rule = makeRule();

		render(
			<RuleDetailModal
				isOpen={true}
				onClose={vi.fn()}
				merchantId={1}
				merchantName="Amazon"
				rule={rule}
				onSave={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
	});

	it("does not show delete button in add mode", () => {
		render(
			<RuleDetailModal
				isOpen={true}
				onClose={vi.fn()}
				merchantId={1}
				merchantName="Amazon"
				rule={null}
				onSave={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);

		expect(
			screen.queryByRole("button", { name: "Delete" }),
		).not.toBeInTheDocument();
	});
});
