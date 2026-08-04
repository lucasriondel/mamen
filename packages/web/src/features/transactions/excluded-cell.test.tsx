import type { Transaction } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK seam: the cell writes through `transactionMutations.update`
// ({ excludedFromRecap, manualExcluded }). Real key factories are kept so the
// mutation's invalidation resolves.
const updateTransaction = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		transactionMutations: {
			update: (id: unknown, payload: unknown) => updateTransaction(id, payload),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { ExcludedCell } = await import("./excluded-cell");

/** A minimal transaction — only the fields the cell reads. */
function tx(over: Partial<Transaction> = {}): Transaction {
	return {
		id: 100,
		accountId: 1,
		date: new Date(),
		amount: -9.99,
		rawIssuerString: "ACME",
		importedAt: new Date(),
		importMonth: "2026-01",
		...over,
	} as Transaction;
}

beforeEach(() => {
	updateTransaction.mockReset().mockResolvedValue({ id: 100 });
});

describe("ExcludedCell", () => {
	it("shows the row's derived exclusion, ticked or not", () => {
		const { unmount } = render(<ExcludedCell transaction={tx()} />);
		expect(screen.getByRole("checkbox")).not.toBeChecked();
		unmount();

		render(<ExcludedCell transaction={tx({ excludedFromRecap: true })} />);
		expect(screen.getByRole("checkbox")).toBeChecked();
	});

	it("excludes a counted row, marking the decision deliberate", async () => {
		render(<ExcludedCell transaction={tx()} />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("checkbox"));

		// `manualExcluded` rides along on the write: an exclusion the user asked
		// for must outlive its issuer's default changing later (ADR 0008).
		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				excludedFromRecap: true,
				manualExcluded: true,
			}),
		);
	});

	it("re-includes an excluded row — still a deliberate decision", async () => {
		render(<ExcludedCell transaction={tx({ excludedFromRecap: true })} />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("checkbox"));

		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				excludedFromRecap: false,
				manualExcluded: true,
			}),
		);
	});

	it("names the gesture per row, so a page of boxes is not anonymous", () => {
		render(<ExcludedCell transaction={tx({ rawIssuerString: "NETFLIX" })} />);
		expect(
			screen.getByRole("checkbox", { name: /exclude NETFLIX from recap/i }),
		).toBeVisible();
	});
});
