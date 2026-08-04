import type { AccountId } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedTransaction } from "./parsers/types";

// SDK-boundary seam. The bar used to read two per-month numbers — how many rows
// the commit replaces, and how many BUNDLES it dissolves — and warn about each.
// Committing is purely additive now (issue #88), so it must read neither: both
// stubs answer with a number that would produce a notice, and the point of the
// suite is that no notice appears and neither read is made.
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
	count.mockReset().mockResolvedValue({ count: 4, total: -40 });
	bundleImpact.mockReset().mockResolvedValue({ count: 2 });
	mutate.mockReset();
});

describe("CommitBar", () => {
	it("commits the parsed records", async () => {
		const records = [record(), record({ importMonth: "2026-02" })];
		render(<CommitBar records={records} onBack={vi.fn()} />);

		(await screen.findByRole("button", { name: /commit import/i })).click();

		expect(mutate).toHaveBeenCalledWith({ records });
	});

	// A warning about a loss that can no longer happen is worse than none: it
	// teaches the user to fear an import that is now safe.
	it("warns about neither replacement nor dissolution", async () => {
		render(
			<CommitBar
				records={[record(), record({ importMonth: "2026-02" })]}
				onBack={vi.fn()}
			/>,
		);

		await screen.findByRole("button", { name: /commit import/i });
		// The stubs would answer 4 rows and 2 bundles — nothing on screen says so.
		await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
		expect(screen.queryByText(/replace/i)).toBeNull();
		expect(screen.queryByText(/bundle/i)).toBeNull();
	});

	// Not merely unrendered — unasked. The notices were the only reason the
	// preview knew which account it was writing into.
	it("asks the server nothing", async () => {
		render(<CommitBar records={[record()]} onBack={vi.fn()} />);

		await screen.findByRole("button", { name: /commit import/i });
		expect(count).not.toHaveBeenCalled();
		expect(bundleImpact).not.toHaveBeenCalled();
	});
});
