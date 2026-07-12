import type { Account } from "@mamen/shared/contract";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK boundary (PRD "Seam 2"): the view reads/writes only through
// `@mamen/sdk` (re-exported by `@/lib/sdk`), so overriding the accounts + the
// transactions `count` surface here — while keeping the rest of the SDK real —
// lets us drive canned data through a real `QueryClientProvider` and assert the
// exact calls the view makes.
const createAccount = vi.fn();
const updateAccount = vi.fn();
const removeAccount = vi.fn();
let listResult: { items: Account[]; total: number };
let listShouldFail: boolean;
let transactionCount: number;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		accountQueries: {
			list: () => ({
				queryKey: ["accounts", "list", "test", listShouldFail],
				queryFn: async () => {
					if (listShouldFail) throw new Error("boom");
					return listResult;
				},
			}),
		},
		accountMutations: {
			create: (payload: unknown) => createAccount(payload),
			update: (id: unknown, payload: unknown) => updateAccount(id, payload),
			remove: (id: unknown) => removeAccount(id),
		},
		transactionQueries: {
			count: (params: unknown) => ({
				queryKey: ["transactions", "count", params],
				queryFn: async () => ({ count: transactionCount }),
			}),
		},
	};
});

// Imported after the mock so the view binds to the mocked SDK surface.
const { AccountsView } = await import("./accounts-view");

function account(overrides: Partial<Account> = {}): Account {
	return {
		id: 1 as Account["id"],
		name: "Everyday",
		type: "checking",
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		...overrides,
	} as Account;
}

beforeEach(() => {
	createAccount.mockReset().mockResolvedValue(account());
	updateAccount.mockReset().mockResolvedValue(account());
	removeAccount.mockReset().mockResolvedValue(undefined);
	listResult = { items: [], total: 0 };
	listShouldFail = false;
	transactionCount = 0;
});

describe("AccountsView", () => {
	it("lists each account with its name and type label", async () => {
		listResult = {
			items: [
				account({ id: 1 as Account["id"], name: "Everyday", type: "checking" }),
				account({ id: 2 as Account["id"], name: "Rainy day", type: "savings" }),
			],
			total: 2,
		};

		const { render } = await import("@testing-library/react");
		render(<AccountsView />);

		// Scope to the accounts list — the create form's `<select>` also renders
		// options labelled "Checking"/"Savings".
		const list = await screen.findByRole("list");
		expect(within(list).getByText("Everyday")).toBeInTheDocument();
		expect(within(list).getByText("Rainy day")).toBeInTheDocument();
		expect(within(list).getByText("Checking")).toBeInTheDocument();
		expect(within(list).getByText("Savings")).toBeInTheDocument();
	});

	it("creates an account with the entered name and selected type", async () => {
		const user = userEvent.setup();
		const { render } = await import("@testing-library/react");
		render(<AccountsView />);

		await user.type(screen.getByLabelText("Account name"), "Holiday fund");
		await user.selectOptions(screen.getByLabelText("Account type"), "savings");
		await user.click(screen.getByRole("button", { name: "Add account" }));

		await waitFor(() =>
			expect(createAccount).toHaveBeenCalledWith({
				name: "Holiday fund",
				type: "savings",
			}),
		);
	});

	it("blocks deleting an account that still has transactions", async () => {
		listResult = { items: [account({ name: "Busy" })], total: 1 };
		transactionCount = 3;

		const user = userEvent.setup();
		const { render } = await import("@testing-library/react");
		render(<AccountsView />);

		const deleteButton = await screen.findByRole("button", { name: "Delete" });
		// The guard both disables the button and explains why.
		await waitFor(() => expect(deleteButton).toBeDisabled());
		expect(screen.getByText(/3 transactions/)).toBeInTheDocument();

		await user.click(deleteButton);
		expect(removeAccount).not.toHaveBeenCalled();
	});

	it("deletes an account with no transactions", async () => {
		listResult = { items: [account({ name: "Empty" })], total: 1 };
		transactionCount = 0;

		const user = userEvent.setup();
		const { render } = await import("@testing-library/react");
		render(<AccountsView />);

		const deleteButton = await screen.findByRole("button", { name: "Delete" });
		await waitFor(() => expect(deleteButton).toBeEnabled());
		await user.click(deleteButton);

		await waitFor(() => expect(removeAccount).toHaveBeenCalledWith(1));
	});

	it("renames an account through the update mutation", async () => {
		listResult = { items: [account({ name: "Old name" })], total: 1 };

		const user = userEvent.setup();
		const { render } = await import("@testing-library/react");
		render(<AccountsView />);

		await user.click(await screen.findByRole("button", { name: "Rename" }));
		const input = screen.getByLabelText("New account name");
		await user.clear(input);
		await user.type(input, "New name");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(updateAccount).toHaveBeenCalledWith(1, { name: "New name" }),
		);
	});

	it("shows an inline error state when the list read fails", async () => {
		listShouldFail = true;

		const { render } = await import("@testing-library/react");
		render(<AccountsView />);

		// `retry: 1` on the shared client means one backoff (~1s) before the
		// error surfaces, so allow extra time here.
		expect(
			await screen.findByText(/Couldn't load your accounts/, undefined, {
				timeout: 4000,
			}),
		).toBeInTheDocument();
	});
});
