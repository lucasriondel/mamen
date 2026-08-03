import type { AccountId } from "@mamen/shared/contract";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedTransaction } from "./parsers/types";

// SDK-boundary seam: the bar reads two per-month numbers — how many rows the
// commit replaces, and how many BUNDLES it dissolves (issue #77) — and owns the
// commit action. Mock the reads; the commit itself is `use-import-commit`'s.
const count = vi.fn();
const bundleImpact = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		transactionQueries: {
			...actual.transactionQueries,
			count: (params: unknown) => ({
				queryKey: ["transactions", "count", params],
				queryFn: async () => count(params),
			}),
			bundleImpact: (params: unknown) => ({
				queryKey: ["transactions", "bundle-impact", params],
				queryFn: async () => bundleImpact(params),
			}),
		},
	};
});

const mutate = vi.fn();
vi.mock("./use-import-commit", () => ({
	useImportCommit: () => ({ mutate, isPending: false }),
}));

const { CommitBar } = await import("./commit-bar");

const ACCOUNT_ID = 7 as AccountId;

function record(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
	return {
		accountId: ACCOUNT_ID,
		date: new Date("2026-01-15T10:00:00Z"),
		amount: -10,
		rawIssuerString: "SHOP",
		importMonth: "2026-01",
		importBatchId: "batch-1",
		...overrides,
	};
}

beforeEach(() => {
	count.mockReset().mockResolvedValue({ count: 0, total: 0 });
	bundleImpact.mockReset().mockResolvedValue({ count: 0 });
	mutate.mockReset();
});

describe("CommitBar bundle warning (issue #77)", () => {
	it("warns how many bundles the commit dissolves, and that re-bundling is manual", async () => {
		bundleImpact.mockResolvedValue({ count: 2 });

		render(
			<CommitBar
				records={[record()]}
				accountId={ACCOUNT_ID}
				onBack={vi.fn()}
			/>,
		);

		const warning = await screen.findByText(/2 bundles/i);
		expect(warning).toHaveAttribute("role", "alert");
		expect(warning.textContent).toMatch(/manual/i);
	});

	// The count is asked per month, for the account being imported into — the
	// same statement the commit's delete names.
	it("asks the server per month of the batch", async () => {
		render(
			<CommitBar
				records={[record(), record({ importMonth: "2026-02" })]}
				accountId={ACCOUNT_ID}
				onBack={vi.fn()}
			/>,
		);

		await screen.findByRole("button", { name: /commit import/i });
		expect(bundleImpact).toHaveBeenCalledWith({
			accountId: ACCOUNT_ID,
			importMonth: "2026-01",
		});
		expect(bundleImpact).toHaveBeenCalledWith({
			accountId: ACCOUNT_ID,
			importMonth: "2026-02",
		});
	});

	// Nothing bundled in the month → no warning at all. The bar must not imply a
	// loss that is not coming.
	it("says nothing when the commit dissolves no bundle", async () => {
		count.mockResolvedValue({ count: 4, total: -40 });

		render(
			<CommitBar
				records={[record()]}
				accountId={ACCOUNT_ID}
				onBack={vi.fn()}
			/>,
		);

		// The row-replacement notice still shows; the bundle one does not.
		await screen.findByText(/replace 4 existing rows/i);
		expect(screen.queryByText(/bundle/i)).toBeNull();
	});

	// The two notices are independent reads: a bundle can be dissolved by a month
	// whose replacement notice is showing, and each must stand on its own answer.
	it("shows the bundle warning beside the row-replacement notice", async () => {
		count.mockResolvedValue({ count: 3, total: -30 });
		bundleImpact.mockResolvedValue({ count: 1 });

		render(
			<CommitBar
				records={[record()]}
				accountId={ACCOUNT_ID}
				onBack={vi.fn()}
			/>,
		);

		await screen.findByText(/replace 3 existing rows/i);
		await screen.findByText(/1 bundle\b/i);
	});
});
