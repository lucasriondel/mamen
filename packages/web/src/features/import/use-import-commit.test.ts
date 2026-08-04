import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";

// The commit itself (delete-then-create per month) has its own suite in
// `commit.test.ts`; here it is stubbed so the hook's post-write bookkeeping —
// which query families a landed import marks stale — is what's under test.
const commitImportFn = vi.fn();
vi.mock("./commit", () => ({
	commitImport: (records: unknown, accountId: unknown) =>
		commitImportFn(records, accountId),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

const { ruleKeys, transactionKeys, accountKeys } = await import("@/lib/sdk");
const { useImportCommit } = await import("./use-import-commit");

const RULES_KEY = ruleKeys.list({});
const TX_KEY = transactionKeys.all;
const ACCOUNTS_KEY = accountKeys.all;

const isStale = (key: readonly unknown[]) =>
	queryClient.getQueryState(key)?.isInvalidated === true;

describe("useImportCommit", () => {
	beforeEach(() => {
		commitImportFn
			.mockReset()
			.mockResolvedValue({ count: 2, months: ["2026-01"] });
		queryClient.setQueryData(RULES_KEY, { items: [], total: 0 });
		queryClient.setQueryData(TX_KEY, { items: [], total: 0 });
		queryClient.setQueryData(ACCOUNTS_KEY, { items: [], total: 0 });
	});

	const commit = async () => {
		const { result } = renderHook(() => useImportCommit());
		act(() => {
			result.current.mutate({ records: [], accountId: 1 as never });
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
	};

	// An import both deletes the month's rows and writes new ones, and the new
	// ones get claimed by whichever rules match. Both halves move rule owned
	// counts (issue #63), which are derived from the table on read.
	it("invalidates the rules cache after an import lands", async () => {
		await commit();
		expect(isStale(RULES_KEY)).toBe(true);
	});

	it("still invalidates the transactions and accounts caches", async () => {
		await commit();
		expect(isStale(TX_KEY)).toBe(true);
		expect(isStale(ACCOUNTS_KEY)).toBe(true);
	});
});
