import type { Transaction } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { isBundleEligible, isTransferEligible } from "./grouping-eligibility";

/** A row carrying only the fields the two predicates read. */
const row = (over: Partial<Transaction> = {}): Transaction =>
  ({
    id: 1,
    accountId: 1,
    date: new Date("2026-03-01T00:00:00.000Z"),
    amount: -20,
    rawIssuerString: "ACME",
    kind: "bank",
    importedAt: new Date("2026-03-02T00:00:00.000Z"),
    importMonth: "2026-03",
    ...over,
  }) as Transaction;

// The two halves of ONE rule (issue #75): a row is claimed by at most one
// grouping, because the two decide how it reaches the recap and decide it
// differently. Pinned directly, since both predicates are what every surface
// gates on — and what the server independently refuses.
describe("bundle / transfer-group exclusivity", () => {
  it("lets an ordinary row be either", () => {
    expect(isTransferEligible(row())).toBe(true);
    expect(isBundleEligible(row())).toBe(true);
  });

  it("refuses a transfer leg the bundle, and a bundle the transfer", () => {
    const leg = row({ transferGroupId: 7 } as Partial<Transaction>);
    expect(isBundleEligible(leg)).toBe(false);
    expect(isTransferEligible(leg)).toBe(false);

    const member = row({ bundleId: 300 } as Partial<Transaction>);
    expect(isTransferEligible(member)).toBe(false);
    // Being in a bundle is not what stops it joining one — `already-bundled` is
    // the server's answer to that, and it is about the bundle, not this rule.
    expect(isBundleEligible(member)).toBe(true);
  });

  // A parent's amount is derived and moves with its members, so a zero-sum group
  // validated at link time could silently stop summing to zero.
  it("refuses a bundle parent the transfer", () => {
    expect(isTransferEligible(row({ kind: "bundle" } as Partial<Transaction>))).toBe(false);
  });

  // The rules this one joins rather than replaces.
  it("keeps refusing an already-grouped row and a refund", () => {
    expect(isTransferEligible(row({ transferGroupId: 7 } as Partial<Transaction>))).toBe(false);
    expect(isTransferEligible(row({ isRefund: true } as Partial<Transaction>))).toBe(false);
    expect(isTransferEligible(row({ linkedRefundId: 9 } as Partial<Transaction>))).toBe(false);
  });
});
