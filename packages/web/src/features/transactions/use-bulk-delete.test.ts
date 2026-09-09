import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";

// Mock the SDK boundary: this hook only *writes*, and what is under test here is
// what it sends and which query families the write marks stale. The real key
// factories are kept so the invalidation resolves.
const bulkDeleteFn = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    transactionMutations: {
      bulkDelete: (ids: unknown) => bulkDeleteFn(ids),
    },
  };
});

// Imported after the mock so it binds to the mocked SDK surface.
const { ruleKeys, transactionKeys } = await import("@/lib/sdk");
const { useBulkDelete } = await import("./use-bulk-delete");

const RULES_KEY = ruleKeys.list({});
const TX_KEY = transactionKeys.all;

const isStale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated === true;

describe("useBulkDelete", () => {
  beforeEach(() => {
    bulkDeleteFn.mockReset().mockResolvedValue({ count: 2 });
    queryClient.setQueryData(RULES_KEY, { items: [], total: 0 });
    queryClient.setQueryData(TX_KEY, { items: [], total: 0 });
  });

  it("sends exactly the ids it was given", async () => {
    const { result } = renderHook(() => useBulkDelete());

    act(() => {
      result.current.bulkDelete.mutate({ ids: [100, 101] as never });
    });

    await waitFor(() => expect(result.current.bulkDelete.isSuccess).toBe(true));
    expect(bulkDeleteFn).toHaveBeenCalledWith([100, 101]);
  });

  it("invalidates the transactions cache", async () => {
    const { result } = renderHook(() => useBulkDelete());

    act(() => {
      result.current.bulkDelete.mutate({ ids: [100] as never });
    });

    await waitFor(() => expect(result.current.bulkDelete.isSuccess).toBe(true));
    expect(isStale(TX_KEY)).toBe(true);
  });

  /**
   * A rule's `ownedCount` is derived from the live transactions table on every
   * read (issue #63), so deleting rows takes rows away from whichever rules
   * owned them — including a **bundle parent**, an ordinary row carrying the
   * user's label as its `rawIssuerString` (issue #78).
   */
  it("invalidates the rules cache", async () => {
    const { result } = renderHook(() => useBulkDelete());

    act(() => {
      result.current.bulkDelete.mutate({ ids: [100] as never });
    });

    await waitFor(() => expect(result.current.bulkDelete.isSuccess).toBe(true));
    expect(isStale(RULES_KEY)).toBe(true);
  });
});
