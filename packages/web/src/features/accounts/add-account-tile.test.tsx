import type { Account } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createAccount = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		accountMutations: {
			create: (payload: unknown) => createAccount(payload),
		},
	};
});

const { AddAccountTile } = await import("./add-account-tile");

const TILE = "Add another account";

beforeEach(() => {
	createAccount.mockReset().mockResolvedValue({ id: 2 } as Account);
});

async function openDialog() {
	const user = userEvent.setup();
	render(
		<ul>
			<AddAccountTile />
		</ul>,
	);
	await user.click(screen.getByRole("button", { name: TILE }));
	await screen.findByRole("dialog");
	return user;
}

describe("AddAccountTile", () => {
	// Adding an account is a once-in-a-while task, so it stops being the loudest
	// thing on the page: a quiet dashed tile at the end of the list, not a form
	// pinned above it (issue #131).
	it("is a quiet ghost tile, not a filled control", () => {
		render(
			<ul>
				<AddAccountTile />
			</ul>,
		);

		const tile = screen.getByRole("button", { name: TILE });
		expect(tile.className).toContain("border-dashed");
		expect(tile.className).not.toContain("bg-gousse-ink");
	});

	it("asks for nothing until it is pressed", () => {
		render(
			<ul>
				<AddAccountTile />
			</ul>,
		);

		expect(screen.queryByLabelText("Account name")).not.toBeInTheDocument();
	});

	it("creates an account with the entered name and selected type", async () => {
		const user = await openDialog();

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

	it("closes once the account exists", async () => {
		const user = await openDialog();

		await user.type(screen.getByLabelText("Account name"), "Holiday fund");
		await user.click(screen.getByRole("button", { name: "Add account" }));

		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
	});

	it("trims the name and refuses an empty one", async () => {
		const user = await openDialog();

		const submit = screen.getByRole("button", { name: "Add account" });
		expect(submit).toBeDisabled();

		await user.type(screen.getByLabelText("Account name"), "  Spaced  ");
		await user.click(submit);

		await waitFor(() =>
			expect(createAccount).toHaveBeenCalledWith({
				name: "Spaced",
				type: "checking",
			}),
		);
	});

	// A cancelled draft must not survive into the next opening, or the form would
	// remember a name the user deliberately walked away from.
	it("forgets a cancelled draft", async () => {
		const user = await openDialog();

		await user.type(screen.getByLabelText("Account name"), "Discarded");
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);

		await user.click(screen.getByRole("button", { name: TILE }));

		expect(await screen.findByLabelText("Account name")).toHaveValue("");
	});
});
