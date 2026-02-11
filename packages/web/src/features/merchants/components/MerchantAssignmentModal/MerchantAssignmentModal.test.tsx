import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Transaction } from "@/types";
import { MerchantAssignmentModal } from "./index";

beforeAll(() => {
	global.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
	Element.prototype.scrollIntoView = vi.fn();
});

const mockTransaction: Transaction = {
	id: 1,
	accountId: 1,
	date: new Date("2025-01-15"),
	amount: -29.99,
	rawMerchantString: "AMZN*1234XYZ",
	importedAt: new Date(),
	importMonth: "2025-01",
};

const renderModal = (
	props: Partial<React.ComponentProps<typeof MerchantAssignmentModal>> = {},
) =>
	render(
		<MerchantAssignmentModal
			open={true}
			onOpenChange={vi.fn()}
			transaction={mockTransaction}
			{...props}
		/>,
	);

describe("MerchantAssignmentModal", () => {
	beforeEach(async () => {
		await db.transactions.clear();
		await db.merchants.clear();
		await db.rules.clear();
		await db.categories.clear();

		await db.transactions.add(mockTransaction);
		await db.categories.add({
			name: "Shopping",
			slug: "shopping",
			parentId: null,
			color: "#3b82f6",
			sortOrder: 1,
			createdAt: new Date(),
		});
	});

	it("displays the transaction raw string", () => {
		renderModal();
		expect(screen.getByText("AMZN*1234XYZ")).toBeInTheDocument();
	});

	it("pre-fills merchant name with cleaned string", () => {
		renderModal();
		const input = screen.getByLabelText("Merchant name") as HTMLInputElement;
		expect(input.value).toBe("Amzn");
	});

	it("shows modal title", () => {
		renderModal();
		expect(screen.getByText("Assign to Merchant")).toBeInTheDocument();
	});

	it("has Cancel and Create buttons", () => {
		renderModal();
		expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /create/i })).toBeInTheDocument();
	});

	it("Create button is disabled when category is not selected", () => {
		renderModal();
		const createBtn = screen.getByRole("button", { name: /create/i });
		expect(createBtn).toBeDisabled();
	});

	it("shows pattern suggestions", async () => {
		renderModal();
		await waitFor(() => {
			expect(screen.getByText(/Exact/)).toBeInTheDocument();
		});
	});

	it("opens in power mode with custom regex input when powerMode=true", () => {
		renderModal({ powerMode: true });
		expect(
			screen.getByPlaceholderText("Enter regex pattern"),
		).toBeInTheDocument();
	});

	it("shows regex cheatsheet in power mode", () => {
		renderModal({ powerMode: true });
		expect(screen.getByLabelText("Regex help")).toBeInTheDocument();
	});

	it("validates invalid regex pattern in power mode", async () => {
		const user = userEvent.setup();
		renderModal({ powerMode: true });

		const input = screen.getByPlaceholderText("Enter regex pattern");
		await user.type(input, "[[invalid");

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
		});
	});

	it("shows category picker", () => {
		renderModal();
		expect(screen.getByText("Select category...")).toBeInTheDocument();
	});

	it("shows set as default checkbox", () => {
		renderModal();
		expect(
			screen.getByLabelText(/set as default category for this merchant/i),
		).toBeInTheDocument();
	});

	it("calls onOpenChange when Cancel is clicked", async () => {
		const onOpenChange = vi.fn();
		const user = userEvent.setup();
		renderModal({ onOpenChange });

		await user.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("warns about duplicate merchant names", async () => {
		await db.merchants.add({
			name: "Amzn",
			createdAt: new Date(),
			firstSeen: new Date(),
		});

		const user = userEvent.setup();
		renderModal();

		// Clear and re-type to trigger duplicate check
		const input = screen.getByLabelText("Merchant name") as HTMLInputElement;
		await user.clear(input);
		await user.type(input, "Amzn");

		await waitFor(() => {
			expect(screen.getByText(/already exists/)).toBeInTheDocument();
		});
	});

	it("does not render when closed", () => {
		renderModal({ open: false });
		expect(screen.queryByText("Assign to Merchant")).not.toBeInTheDocument();
	});

	// --- Story 4.4: Existing Merchant Flow Tests ---

	it("shows new/existing merchant toggle", () => {
		renderModal();
		expect(screen.getByLabelText("New merchant")).toBeInTheDocument();
		expect(screen.getByLabelText("Existing merchant")).toBeInTheDocument();
	});

	it("defaults to new merchant mode", () => {
		renderModal();
		const newRadio = screen.getByLabelText("New merchant") as HTMLInputElement;
		expect(newRadio).toBeChecked();
	});

	it("toggles between new and existing mode", async () => {
		const user = userEvent.setup();
		renderModal();

		await user.click(screen.getByLabelText("Existing merchant"));

		// In existing mode, merchant name input should be hidden
		expect(screen.queryByLabelText("Merchant name")).not.toBeInTheDocument();
		// Merchant search select should appear
		expect(screen.getByText("Select merchant...")).toBeInTheDocument();
	});

	it("shows Add Rule button in existing merchant mode", async () => {
		const user = userEvent.setup();
		renderModal();

		await user.click(screen.getByLabelText("Existing merchant"));

		expect(
			screen.getByRole("button", { name: /add rule/i }),
		).toBeInTheDocument();
		// Create button should be replaced
		expect(
			screen.queryByRole("button", { name: /^create$/i }),
		).not.toBeInTheDocument();
	});

	it("shows category override checkbox when existing merchant selected", async () => {
		const catId = (await db.categories.add({
			name: "Electronics",
			slug: "electronics",
			parentId: null,
			color: "#ef4444",
			icon: "",
			sortOrder: 2,
			createdAt: new Date(),
		})) as number;

		const merchantId = (await db.merchants.add({
			name: "Amazon",
			defaultCategoryId: catId,
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;

		const user = userEvent.setup();
		renderModal();

		await user.click(screen.getByLabelText("Existing merchant"));

		// Open merchant search and select Amazon
		await user.click(screen.getByText("Select merchant..."));

		await waitFor(() => {
			expect(screen.getByText("Amazon")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Amazon"));

		await waitFor(() => {
			expect(
				screen.getByLabelText(/override category for this rule/i),
			).toBeInTheDocument();
		});
	});

	it("shows merchant default category hint when override not enabled", async () => {
		const catId = (await db.categories.add({
			name: "Electronics",
			slug: "electronics",
			parentId: null,
			color: "#ef4444",
			icon: "",
			sortOrder: 2,
			createdAt: new Date(),
		})) as number;

		await db.merchants.add({
			name: "Amazon",
			defaultCategoryId: catId,
			createdAt: new Date(),
			firstSeen: new Date(),
		});

		const user = userEvent.setup();
		renderModal();

		await user.click(screen.getByLabelText("Existing merchant"));
		await user.click(screen.getByText("Select merchant..."));

		await waitFor(() => {
			expect(screen.getByText("Amazon")).toBeInTheDocument();
		});
		await user.click(screen.getByText("Amazon"));

		await waitFor(() => {
			expect(screen.getByText(/uses merchant default/i)).toBeInTheDocument();
			expect(screen.getByText("Electronics")).toBeInTheDocument();
		});
	});

	it("selecting existing merchant shows its rules", async () => {
		const merchantId = (await db.merchants.add({
			name: "Amazon",
			defaultCategoryId: 1,
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;

		await db.rules.add({
			merchantId,
			pattern: "^AMZN.*",
			matchCount: 5,
			createdAt: new Date(),
		});

		const user = userEvent.setup();
		renderModal();

		await user.click(screen.getByLabelText("Existing merchant"));
		await user.click(screen.getByText("Select merchant..."));

		await waitFor(() => {
			expect(screen.getByText("Amazon")).toBeInTheDocument();
		});
		await user.click(screen.getByText("Amazon"));

		await waitFor(() => {
			expect(screen.getByText("^AMZN.*")).toBeInTheDocument();
			expect(screen.getByText("(5 matches)")).toBeInTheDocument();
		});
	});

	it("hides merchant name input when in existing mode", async () => {
		const user = userEvent.setup();
		renderModal();

		// Initially shows merchant name
		expect(screen.getByLabelText("Merchant name")).toBeInTheDocument();

		// Switch to existing
		await user.click(screen.getByLabelText("Existing merchant"));
		expect(screen.queryByLabelText("Merchant name")).not.toBeInTheDocument();

		// Switch back to new
		await user.click(screen.getByLabelText("New merchant"));
		expect(screen.getByLabelText("Merchant name")).toBeInTheDocument();
	});
});
