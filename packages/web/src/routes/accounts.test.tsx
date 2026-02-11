import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

vi.mock("pdfjs-dist", () => ({
	GlobalWorkerOptions: { workerSrc: "" },
	getDocument: vi.fn(),
}));

import { AccountsPage } from "./accounts";

beforeEach(async () => {
	await db.accounts.clear();
	await db.transactions.clear();
});

describe("AccountsPage - Empty State", () => {
	it("renders empty state when no accounts exist", async () => {
		render(<AccountsPage />);

		expect(await screen.findByText("No accounts yet")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Create your first bank account to start importing statements.",
			),
		).toBeInTheDocument();
	});

	it("shows Add Account button in empty state", async () => {
		render(<AccountsPage />);

		expect(await screen.findByText("Add Account")).toBeInTheDocument();
	});

	it("opens create modal when Add Account is clicked in empty state", async () => {
		const user = userEvent.setup();
		render(<AccountsPage />);

		const button = await screen.findByText("Add Account");
		await user.click(button);

		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		expect(
			screen.getByText("Add a new bank account to organize your statements."),
		).toBeInTheDocument();
	});
});

describe("AccountsPage - With Accounts", () => {
	beforeEach(async () => {
		await db.accounts.add({
			name: "Test Checking",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.accounts.add({
			name: "Test Savings",
			type: "savings",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("renders account cards when accounts exist", async () => {
		render(<AccountsPage />);

		expect(await screen.findByText("Test Checking")).toBeInTheDocument();
		expect(screen.getByText("Test Savings")).toBeInTheDocument();
	});

	it("shows account type badges", async () => {
		render(<AccountsPage />);

		expect(await screen.findByText("Checking")).toBeInTheDocument();
		expect(screen.getByText("Savings")).toBeInTheDocument();
	});

	it("shows transaction count for each account", async () => {
		render(<AccountsPage />);

		const counts = await screen.findAllByText("0 transactions");
		expect(counts).toHaveLength(2);
	});

	it("shows Add Account button in header", async () => {
		render(<AccountsPage />);

		await screen.findByText("Test Checking");
		expect(screen.getByText("Accounts")).toBeInTheDocument();
		// The header Add Account button
		const buttons = screen.getAllByText("Add Account");
		expect(buttons.length).toBeGreaterThanOrEqual(1);
	});

	it("opens edit modal when edit button is clicked", async () => {
		const user = userEvent.setup();
		render(<AccountsPage />);

		await screen.findByText("Test Checking");
		const editButtons = screen.getAllByLabelText("Edit account");
		await user.click(editButtons[0]);

		expect(await screen.findByText("Edit Account")).toBeInTheDocument();
	});

	it("opens delete confirmation when delete button is clicked", async () => {
		const user = userEvent.setup();
		render(<AccountsPage />);

		await screen.findByText("Test Checking");
		const deleteButtons = screen.getAllByLabelText("Delete account");
		await user.click(deleteButtons[0]);

		expect(await screen.findByText("Delete Account")).toBeInTheDocument();
		expect(
			screen.getByText(/Are you sure you want to delete/),
		).toBeInTheDocument();
	});
});

describe("AccountsPage - CRUD Operations", () => {
	it("creates a new account via modal", async () => {
		const user = userEvent.setup();
		render(<AccountsPage />);

		// Click Add Account in empty state
		const addButton = await screen.findByText("Add Account");
		await user.click(addButton);

		// Fill in form
		const nameInput = await screen.findByPlaceholderText("e.g. Main Checking");
		await user.type(nameInput, "My Bank");

		// Submit via the submit button
		const createButton = screen.getByRole("button", { name: "Create Account" });
		await user.click(createButton);

		// Verify account appears in list
		expect(await screen.findByText("My Bank")).toBeInTheDocument();
	});

	it("edits an existing account", async () => {
		await db.accounts.add({
			name: "Old Name",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const user = userEvent.setup();
		render(<AccountsPage />);

		await screen.findByText("Old Name");
		const editButton = screen.getByLabelText("Edit account");
		await user.click(editButton);

		// Clear and type new name
		const nameInput = await screen.findByPlaceholderText("e.g. Main Checking");
		await user.clear(nameInput);
		await user.type(nameInput, "New Name");

		const saveButton = screen.getByText("Save Changes");
		await user.click(saveButton);

		expect(await screen.findByText("New Name")).toBeInTheDocument();
	});

	it("deletes an account with confirmation", async () => {
		await db.accounts.add({
			name: "Delete Me",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const user = userEvent.setup();
		render(<AccountsPage />);

		await screen.findByText("Delete Me");
		const deleteButton = screen.getByLabelText("Delete account");
		await user.click(deleteButton);

		// Confirm deletion
		const confirmButton = await screen.findByText("Delete");
		await user.click(confirmButton);

		// Account should be gone, empty state should show
		await waitFor(() => {
			expect(screen.getByText("No accounts yet")).toBeInTheDocument();
		});
	});

	it("shows correct transaction count in delete confirmation", async () => {
		const accountId = await db.accounts.add({
			name: "With Transactions",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		await db.transactions.bulkAdd([
			{
				accountId: accountId as number,
				date: new Date(),
				amount: 100,
				rawMerchantString: "Test 1",
				importedAt: new Date(),
				importMonth: "2026-01",
			},
			{
				accountId: accountId as number,
				date: new Date(),
				amount: 200,
				rawMerchantString: "Test 2",
				importedAt: new Date(),
				importMonth: "2026-01",
			},
		]);

		const user = userEvent.setup();
		render(<AccountsPage />);

		await screen.findByText("With Transactions");
		const deleteButton = screen.getByLabelText("Delete account");
		await user.click(deleteButton);

		// The alert dialog description should mention the transaction count
		expect(
			await screen.findByText(/remove 2 transactions/),
		).toBeInTheDocument();
	});
});
