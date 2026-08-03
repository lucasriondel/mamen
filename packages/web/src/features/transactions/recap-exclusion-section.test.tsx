import type { Transaction } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK seam: the control writes through `transactionMutations.update`
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
const { RecapExclusionSection } = await import("./recap-exclusion-section");

/** A minimal transaction — only the fields the control reads. */
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

describe("RecapExclusionSection", () => {
	it("excludes a counted row, marking the decision deliberate", async () => {
		render(<RecapExclusionSection transaction={tx()} />);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: /exclude from recap/i }),
		);

		// `manualExcluded` rides along on the write: an exclusion the user asked
		// for must survive the issuer default that arrives in #69 (ADR 0008).
		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				excludedFromRecap: true,
				manualExcluded: true,
			}),
		);
	});

	it("re-includes an excluded row — still a deliberate decision", async () => {
		render(
			<RecapExclusionSection transaction={tx({ excludedFromRecap: true })} />,
		);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: /include in recap/i }));

		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				excludedFromRecap: false,
				manualExcluded: true,
			}),
		);
	});

	it("says which state the row is in, so the button is not the only signal", () => {
		render(
			<RecapExclusionSection transaction={tx({ excludedFromRecap: true })} />,
		);
		expect(
			screen.getByText(/does not count toward your spend totals/i),
		).toBeVisible();
	});
});
