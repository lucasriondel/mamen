import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";

// A signed-amount record; reconcile only reads `amount`.
const row = (amount: number) => ({ amount });

describe("reconcile", () => {
  it("reconciles when the extracted sums match the declared totals", () => {
    const result = reconcile([row(-10), row(-5), row(20)], {
      debit: 15,
      credit: 20,
    });

    expect(result.ok).toBe(true);
    expect(result.debitOk).toBe(true);
    expect(result.creditOk).toBe(true);
    expect(result.extractedDebit).toBe(15);
    expect(result.extractedCredit).toBe(20);
  });

  it("flags a mismatch when a debit row is missing", () => {
    // Declared debit is 25 but only 15 of outflows were extracted (dropped row).
    const result = reconcile([row(-10), row(-5), row(20)], {
      debit: 25,
      credit: 20,
    });

    expect(result.ok).toBe(false);
    expect(result.debitOk).toBe(false);
    expect(result.creditOk).toBe(true);
    expect(result.extractedDebit).toBe(15);
    expect(result.declaredDebit).toBe(25);
  });

  it("flags a mismatch when a summary line was read as a credit", () => {
    const result = reconcile([row(-10), row(20), row(999)], {
      debit: 10,
      credit: 20,
    });

    expect(result.ok).toBe(false);
    expect(result.creditOk).toBe(false);
    expect(result.extractedCredit).toBe(1019);
  });

  it("tolerates sub-cent float drift", () => {
    const result = reconcile([row(-10.1), row(-20.2), row(-0.3)], {
      debit: 30.6,
      credit: 0,
    });

    expect(result.ok).toBe(true);
  });
});
