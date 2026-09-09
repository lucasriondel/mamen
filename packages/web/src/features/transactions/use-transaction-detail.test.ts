import type { TransactionId } from "@mamen/shared/contract";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";

// ---- Canned SDK data --------------------------------------------------------

const ACCOUNTS = [{ id: 1, name: "Checking", type: "checking" }];

/** A high id, so a surface that read the issuer *list* would miss it (#62). */
const ISSUERS = [{ id: 812, name: "Spotify" }];

/** A leaf with no colour of its own — it inherits its parent's (#32). */
const CATEGORIES = [
  { id: 1, name: "Life", slug: "life", parentId: null, sortOrder: 0, color: "#336699" },
  { id: 5, name: "Subscriptions", slug: "subs", parentId: 1, sortOrder: 0 },
];

const TXN = {
  id: 100,
  accountId: 1,
  date: new Date("2026-01-20T00:00:00Z"),
  amount: -9.99,
  rawIssuerString: "SPOTIFY P2A34",
  issuerId: 812,
  categoryId: 5,
  linkedRefundId: 900,
  importedAt: new Date(),
  importMonth: "2026-01",
};

/** The counterpart a refunded row links, so the link can name it. */
const REFUND = {
  id: 900,
  accountId: 1,
  date: new Date("2026-02-02T00:00:00Z"),
  amount: 9.99,
  rawIssuerString: "SPOTIFY REMBOURSEMENT",
  importedAt: new Date(),
  importMonth: "2026-02",
};

/** A row whose read comes back empty — the id names nothing. */
const MISSING_ID = 404;

/**
 * An issuer whose read never settles, so a test can hold the hook in the state
 * where the row has landed but the name that titles it has not.
 */
const PENDING_ISSUER_ID = 999;

const TXN_PENDING_ISSUER = { ...TXN, id: 101, issuerId: PENDING_ISSUER_ID };

// ---- SDK seam mock ----------------------------------------------------------

vi.mock("@mamen/sdk", () => ({
  transactionQueries: {
    getById: (id: number) => ({
      queryKey: ["transactions", "detail", id],
      queryFn: async () =>
        id === TXN.id
          ? TXN
          : id === TXN_PENDING_ISSUER.id
            ? TXN_PENDING_ISSUER
            : id === REFUND.id
              ? REFUND
              : undefined,
    }),
  },
  accountQueries: {
    list: () => ({
      queryKey: ["accounts", "list"],
      queryFn: async () => ({ items: ACCOUNTS, total: ACCOUNTS.length }),
    }),
  },
  categoryQueries: {
    list: () => ({
      queryKey: ["categories", "list"],
      queryFn: async () => ({ items: CATEGORIES, total: CATEGORIES.length }),
    }),
  },
  issuerQueries: {
    byIds: (ids: Iterable<number>) => {
      const wanted = [...new Set(ids)].sort((a, b) => a - b);
      return {
        queryKey: ["issuers", "by-ids", wanted],
        queryFn: async () =>
          wanted.includes(PENDING_ISSUER_ID)
            ? new Promise<never>(() => {})
            : { items: ISSUERS.filter((i) => wanted.includes(i.id)), total: wanted.length },
      };
    },
  },
}));

const { useTransactionDetail } = await import("./use-transaction-detail");

const detail = (id: number) => renderHook(() => useTransactionDetail(id as TransactionId));

describe("useTransactionDetail", () => {
  it("resolves the row and every lookup its foreign keys need", async () => {
    const { result } = detail(TXN.id);

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.transaction?.id).toBe(TXN.id);
    expect(result.current.account?.name).toBe("Checking");
    expect(result.current.issuer?.name).toBe("Spotify");
    expect(result.current.category?.name).toBe("Subscriptions");
    // The leaf carries no colour of its own, so the resolved one is the
    // parent's — the same colour the grid's cell paints.
    expect(result.current.categoryColor).toBe("#336699");
    expect(result.current.linkedRefund?.id).toBe(REFUND.id);
    expect(result.current.isNotFound).toBe(false);
  });

  it("reports an id that names no row as not found", async () => {
    const { result } = detail(MISSING_ID);

    await waitFor(() => expect(result.current.isNotFound).toBe(true));
    expect(result.current.transaction).toBeUndefined();
  });

  // The issuer lookup reads the row's own `issuerId`, so it lands a beat after
  // the row. Both surfaces hold their placeholder until it does — a row shown
  // before its issuer arrives is a row titled by the raw bank string, which is
  // the state the by-ids read exists to prevent (#62).
  it("stays pending until the issuer that names the row lands", async () => {
    const { result } = detail(TXN_PENDING_ISSUER.id);

    await waitFor(() =>
      expect(
        queryClient.getQueryData(["transactions", "detail", TXN_PENDING_ISSUER.id]),
      ).toBeDefined(),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.isNotFound).toBe(false);
  });
});
