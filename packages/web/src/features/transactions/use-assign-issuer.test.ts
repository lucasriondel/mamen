import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query-client";

// Mock the SDK boundary (PRD "Seam 2"): this hook only *writes* — the issuers
// `create` and the transactions `update` / `removeManualIssuer`. The real key
// factories are kept, since what's under test here is which query families a
// write invalidates.
const createIssuer = vi.fn();
const updateTransaction = vi.fn();
const removeManualIssuerFn = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerMutations: { create: (payload: unknown) => createIssuer(payload) },
		transactionMutations: {
			update: (id: unknown, payload: unknown) => updateTransaction(id, payload),
			removeManualIssuer: (id: unknown) => removeManualIssuerFn(id),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { ruleKeys, transactionKeys, issuerKeys } = await import("@/lib/sdk");
const { useAssignIssuer } = await import("./use-assign-issuer");

/**
 * Seed one cached entry per family this hook is expected to invalidate, then
 * report which of them a write marked stale. `isInvalidated` is what drives the
 * refetch, so it is the honest thing to assert — a hook that never names the
 * family leaves its entry fresh.
 */
const RULES_KEY = ruleKeys.list({});
const TX_KEY = transactionKeys.all;
const ISSUERS_KEY = issuerKeys.all;

const seedCaches = () => {
	queryClient.setQueryData(RULES_KEY, { items: [], total: 0 });
	queryClient.setQueryData(TX_KEY, { items: [], total: 0 });
	queryClient.setQueryData(ISSUERS_KEY, { items: [], total: 0 });
};

const isStale = (key: readonly unknown[]) =>
	queryClient.getQueryState(key)?.isInvalidated === true;

describe("useAssignIssuer", () => {
	beforeEach(() => {
		createIssuer.mockReset().mockResolvedValue({ id: 10, name: "Spotify" });
		updateTransaction.mockReset().mockResolvedValue({ id: 100 });
		removeManualIssuerFn.mockReset().mockResolvedValue({ id: 100 });
		seedCaches();
	});

	// A rule's owned count is derived server-side from the live table (issue
	// #63), so hand-assigning a row *away* from the rule that held it drops that
	// rule's count. A cached rules list would keep rendering the old number.
	it("invalidates the rules cache after a hand assignment", async () => {
		const { result } = renderHook(() => useAssignIssuer());

		act(() => {
			result.current.assignExisting.mutate({
				transactionId: 100 as never,
				issuerId: 10 as never,
			});
		});

		await waitFor(() =>
			expect(result.current.assignExisting.isSuccess).toBe(true),
		);
		expect(isStale(RULES_KEY)).toBe(true);
	});

	// The mirror case: dropping a hand pick hands the row back to whichever rule
	// claims it, so that rule's owned count goes *up*.
	it("invalidates the rules cache after a manual issuer is removed", async () => {
		const { result } = renderHook(() => useAssignIssuer());

		act(() => {
			result.current.removeManualIssuer.mutate({ transactionId: 100 as never });
		});

		await waitFor(() =>
			expect(result.current.removeManualIssuer.isSuccess).toBe(true),
		);
		expect(isStale(RULES_KEY)).toBe(true);
	});

	// The families that were already invalidated stay invalidated.
	it("still invalidates the transactions and issuers caches", async () => {
		const { result } = renderHook(() => useAssignIssuer());

		act(() => {
			result.current.assignExisting.mutate({
				transactionId: 100 as never,
				issuerId: 10 as never,
			});
		});

		await waitFor(() =>
			expect(result.current.assignExisting.isSuccess).toBe(true),
		);
		expect(isStale(TX_KEY)).toBe(true);
		expect(isStale(ISSUERS_KEY)).toBe(true);
	});
});
