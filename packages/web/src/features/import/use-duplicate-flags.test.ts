import type { AccountId } from "@mamen/shared/contract";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedTransaction } from "./parsers/types";

// SDK-boundary seam. The duplicate check reads the transactions list — one read
// per (account, month) the batch touches — and nothing else. `transactionQueries`
// is replaced wholesale so a read of any other endpoint fails as a missing
// function rather than slipping past an assertion nobody wrote.
const list = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    transactionQueries: {
      list: (params: Record<string, unknown>) => ({
        queryKey: ["transactions", "list", params],
        queryFn: async () => list(params),
      }),
    },
  };
});

const { useDuplicateFlags, DUPLICATE_SCAN_LIMIT } = await import("./use-duplicate-flags");

const ACCOUNT_ID = 7 as AccountId;
const OTHER_ACCOUNT_ID = 8 as AccountId;

function record(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    accountId: ACCOUNT_ID,
    date: new Date("2026-01-15T10:00:00Z"),
    amount: -10,
    rawIssuerString: "SHOP A",
    importMonth: "2026-01",
    importBatchId: "batch-1",
    ...overrides,
  };
}

const empty = { items: [], total: 0, bundleMembers: [] };

beforeEach(() => {
  list.mockReset().mockResolvedValue(empty);
});

describe("useDuplicateFlags", () => {
  it("reads once per distinct month in the batch, scoped to the account", async () => {
    const records = [
      record(),
      record({
        date: new Date("2026-02-03T10:00:00Z"),
        importMonth: "2026-02",
      }),
      record({ rawIssuerString: "SHOP C" }),
    ];
    const { result } = renderHook(() => useDuplicateFlags(records));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(list).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      importMonth: "2026-01",
      limit: DUPLICATE_SCAN_LIMIT,
    });
    expect(list).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      importMonth: "2026-02",
      limit: DUPLICATE_SCAN_LIMIT,
    });
    expect(result.current.flags).toEqual([false, false, false]);
  });

  it("flags the rows a stored row matches and counts them", async () => {
    list.mockResolvedValue({
      items: [{ ...record(), id: 1 }],
      total: 1,
      bundleMembers: [],
    });
    const records = [record(), record({ rawIssuerString: "SHOP B" })];

    const { result } = renderHook(() => useDuplicateFlags(records));

    await waitFor(() => expect(result.current.count).toBe(1));
    expect(result.current.flags).toEqual([true, false]);
  });

  // A statement overlapping an already-imported month, holding genuinely new
  // rows: the read happens, and it flags nothing.
  it("flags nothing when the month's stored rows are all different", async () => {
    list.mockResolvedValue({
      items: [{ ...record({ amount: -99, rawIssuerString: "OLD" }), id: 1 }],
      total: 1,
      bundleMembers: [],
    });

    const { result } = renderHook(() => useDuplicateFlags([record()]));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(result.current.flags).toEqual([false]);
    expect(result.current.count).toBe(0);
  });

  // A row that got bundled after its import is hidden from `items` — it rides
  // beside the page instead. It is still a stored row this statement's re-import
  // would duplicate.
  it("compares against the bundle members riding beside the page", async () => {
    list.mockResolvedValue({
      items: [],
      total: 0,
      bundleMembers: [{ ...record(), id: 1, bundleId: 2 }],
    });

    const { result } = renderHook(() => useDuplicateFlags([record()]));

    await waitFor(() => expect(result.current.count).toBe(1));
  });

  // The wizard writes into one account, and a row of another account is never
  // compared — so the read is never made for it either.
  it("never reads another account's month", async () => {
    renderHook(() => useDuplicateFlags([record({ accountId: OTHER_ACCOUNT_ID })]));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(list).not.toHaveBeenCalledWith(expect.objectContaining({ accountId: ACCOUNT_ID }));
  });

  it("asks nothing for an empty batch", async () => {
    const { result } = renderHook(() => useDuplicateFlags([]));

    await waitFor(() => expect(result.current.flags).toEqual([]));
    expect(list).not.toHaveBeenCalled();
    expect(result.current.count).toBe(0);
  });
});
