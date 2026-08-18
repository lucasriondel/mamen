import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";

// Mock the SDK boundary: this hook only *writes*, and what is under test here is
// which query families each write marks stale. The real key factories are kept.
const createBundleFn = vi.fn();
const addBundleMemberFn = vi.fn();
const removeBundleMemberFn = vi.fn();
const dissolveBundleFn = vi.fn();
const updateTransaction = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    transactionMutations: {
      createBundle: (ids: unknown, label: unknown) => createBundleFn(ids, label),
      addBundleMember: (bundleId: unknown, id: unknown) => addBundleMemberFn(bundleId, id),
      removeBundleMember: (id: unknown) => removeBundleMemberFn(id),
      dissolveBundle: (id: unknown) => dissolveBundleFn(id),
      update: (id: unknown, payload: unknown) => updateTransaction(id, payload),
    },
  };
});

// Imported after the mock so it binds to the mocked SDK surface.
const { ruleKeys, transactionKeys } = await import("@/lib/sdk");
const { useBundle } = await import("./use-bundle");

const RULES_KEY = ruleKeys.list({});
const TX_KEY = transactionKeys.all;

const isStale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated === true;

describe("useBundle", () => {
  beforeEach(() => {
    createBundleFn.mockReset().mockResolvedValue({ id: 100 });
    addBundleMemberFn.mockReset().mockResolvedValue({ id: 100 });
    removeBundleMemberFn.mockReset().mockResolvedValue({ id: 101 });
    dissolveBundleFn.mockReset().mockResolvedValue(undefined);
    updateTransaction.mockReset().mockResolvedValue({ id: 100 });
    queryClient.setQueryData(RULES_KEY, { items: [], total: 0 });
    queryClient.setQueryData(TX_KEY, { items: [], total: 0 });
  });

  /**
   * A rule's owned count is derived from the live table on every read (issue
   * #63), and a bundle parent is an ordinary row in it — carrying the label the
   * user typed as its `rawIssuerString`, which is exactly what the matcher
   * reads. So creating a bundle can hand a rule a row it did not have before.
   */
  it("invalidates the rules cache after a bundle is created", async () => {
    const { result } = renderHook(() => useBundle());

    act(() => {
      result.current.createBundle.mutate({
        ids: [1, 2] as never,
        label: "Weekend away",
      });
    });

    await waitFor(() => expect(result.current.createBundle.isSuccess).toBe(true));
    expect(isStale(RULES_KEY)).toBe(true);
  });

  // The mirror case: dissolving deletes the parent row, so a rule that owned it
  // loses one — a cached rules list would keep rendering the old number.
  it("invalidates the rules cache after a bundle is dissolved", async () => {
    const { result } = renderHook(() => useBundle());

    act(() => {
      result.current.dissolveBundle.mutate({ bundleId: 100 as never });
    });

    await waitFor(() => expect(result.current.dissolveBundle.isSuccess).toBe(true));
    expect(isStale(RULES_KEY)).toBe(true);
  });

  // Removing the second-to-last member dissolves the bundle server-side, which
  // takes the parent row with it — same fallout, reached from the other end.
  it("invalidates the rules cache after a member leaves", async () => {
    const { result } = renderHook(() => useBundle());

    act(() => {
      result.current.removeFromBundle.mutate({ transactionId: 101 as never });
    });

    await waitFor(() => expect(result.current.removeFromBundle.isSuccess).toBe(true));
    expect(isStale(RULES_KEY)).toBe(true);
  });

  it("invalidates the rules cache after a member is added", async () => {
    const { result } = renderHook(() => useBundle());

    act(() => {
      result.current.addToBundle.mutate({
        bundleId: 100 as never,
        transactionId: 101 as never,
      });
    });

    await waitFor(() => expect(result.current.addToBundle.isSuccess).toBe(true));
    expect(isStale(RULES_KEY)).toBe(true);
  });

  it("invalidates the rules cache after the parent is edited", async () => {
    const { result } = renderHook(() => useBundle());

    act(() => {
      result.current.setBundleDate.mutate({
        transactionId: 100 as never,
        date: new Date("2026-03-01"),
      });
    });

    await waitFor(() => expect(result.current.setBundleDate.isSuccess).toBe(true));
    expect(isStale(RULES_KEY)).toBe(true);
  });

  // The family that was already invalidated stays invalidated.
  it("still invalidates the transactions cache", async () => {
    const { result } = renderHook(() => useBundle());

    act(() => {
      result.current.createBundle.mutate({
        ids: [1, 2] as never,
        label: "Weekend away",
      });
    });

    await waitFor(() => expect(result.current.createBundle.isSuccess).toBe(true));
    expect(isStale(TX_KEY)).toBe(true);
  });
});
