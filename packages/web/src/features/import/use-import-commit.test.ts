import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";

// The commit itself (one bulk insert) has its own suite in `commit.test.ts`;
// here it is stubbed so the hook's post-write bookkeeping — which query families
// a landed import marks stale — is what's under test.
const commitImportFn = vi.fn();
vi.mock("./commit", () => ({
  commitImport: (records: unknown) => commitImportFn(records),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

const { ruleKeys, transactionKeys, accountKeys } = await import("@/lib/sdk");
const { useImportCommit } = await import("./use-import-commit");

const RULES_KEY = ruleKeys.list({});
const TX_KEY = transactionKeys.all;
const ACCOUNTS_KEY = accountKeys.all;

const isStale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated === true;

describe("useImportCommit", () => {
  beforeEach(() => {
    commitImportFn.mockReset().mockResolvedValue({ count: 2, months: ["2026-01"] });
    queryClient.setQueryData(RULES_KEY, { items: [], total: 0 });
    queryClient.setQueryData(TX_KEY, { items: [], total: 0 });
    queryClient.setQueryData(ACCOUNTS_KEY, { items: [], total: 0 });
  });

  const commit = async () => {
    const { result } = renderHook(() => useImportCommit());
    act(() => {
      result.current.mutate({ records: [] });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  };

  // The rows an import writes get claimed by whichever rules match them, which
  // moves rule owned counts (issue #63) — derived from the table on read.
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
