import type { Transaction } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import {
	suggestTransferCounterparts,
	TRANSFER_DATE_WINDOW_DAYS,
} from "./transfer-suggestions";

let nextId = 1;

/** A minimal transaction carrying only the fields the suggestion util reads. */
function txn(partial: {
	amount: number;
	accountId?: number;
	date?: string;
	transferGroupId?: number;
	isRefund?: boolean;
	linkedRefundId?: number;
}): Transaction {
	return {
		id: nextId++,
		accountId: partial.accountId ?? 1,
		date: new Date(partial.date ?? "2026-07-10"),
		amount: partial.amount,
		rawIssuerString: "raw",
		transferGroupId: partial.transferGroupId,
		isRefund: partial.isRefund,
		linkedRefundId: partial.linkedRefundId,
		importedAt: new Date("2026-07-10"),
		importMonth: "2026-07",
	} as unknown as Transaction;
}

const ids = (rows: readonly Transaction[]) => rows.map((r) => r.id);

describe("suggestTransferCounterparts", () => {
	it("matches an opposite-sign, equal-magnitude, different-account, near-date leg", () => {
		const target = txn({ amount: -30, accountId: 1, date: "2026-07-10" });
		const match = txn({ amount: 30, accountId: 2, date: "2026-07-11" });
		const result = suggestTransferCounterparts(target, [match]);
		expect(ids(result)).toEqual([match.id]);
	});

	it("suggests a debit as the counterpart of a credit (both directions)", () => {
		const target = txn({ amount: 30, accountId: 2, date: "2026-07-10" });
		const match = txn({ amount: -30, accountId: 1, date: "2026-07-10" });
		expect(ids(suggestTransferCounterparts(target, [match]))).toEqual([
			match.id,
		]);
	});

	it("rejects a same-sign leg (no repayment direction)", () => {
		const target = txn({ amount: -30, accountId: 1 });
		const same = txn({ amount: -30, accountId: 2 });
		expect(suggestTransferCounterparts(target, [same])).toEqual([]);
	});

	it("rejects a leg of a different magnitude (compared to the cent)", () => {
		const target = txn({ amount: -30, accountId: 1 });
		const off = txn({ amount: 30.01, accountId: 2 });
		expect(suggestTransferCounterparts(target, [off])).toEqual([]);
	});

	it("matches magnitudes that are equal only to the cent (no float drift)", () => {
		const target = txn({ amount: -0.3, accountId: 1 });
		const match = txn({ amount: 0.1 + 0.2, accountId: 2 }); // 0.30000000000000004
		expect(ids(suggestTransferCounterparts(target, [match]))).toEqual([
			match.id,
		]);
	});

	it("rejects a same-account leg (a transfer moves between accounts)", () => {
		const target = txn({ amount: -30, accountId: 1 });
		const sameAccount = txn({ amount: 30, accountId: 1 });
		expect(suggestTransferCounterparts(target, [sameAccount])).toEqual([]);
	});

	it("rejects a leg outside the date window", () => {
		const target = txn({ amount: -30, accountId: 1, date: "2026-07-10" });
		const farOut = txn({
			amount: 30,
			accountId: 2,
			// One day past the window (6 days out; the window is 5).
			date: "2026-07-16",
		});
		expect(suggestTransferCounterparts(target, [farOut])).toEqual([]);

		const justInside = txn({
			amount: 30,
			accountId: 2,
			date: "2026-07-15", // exactly TRANSFER_DATE_WINDOW_DAYS away
		});
		expect(TRANSFER_DATE_WINDOW_DAYS).toBe(5);
		expect(ids(suggestTransferCounterparts(target, [justInside]))).toEqual([
			justInside.id,
		]);
	});

	it("never offers a row that is already grouped", () => {
		const target = txn({ amount: -30, accountId: 1 });
		const grouped = txn({ amount: 30, accountId: 2, transferGroupId: 7 });
		expect(suggestTransferCounterparts(target, [grouped])).toEqual([]);
	});

	it("never offers a row that is a refund or refund-paired", () => {
		const target = txn({ amount: -30, accountId: 1 });
		const refund = txn({ amount: 30, accountId: 2, isRefund: true });
		const paired = txn({ amount: 30, accountId: 3, linkedRefundId: 99 });
		expect(suggestTransferCounterparts(target, [refund, paired])).toEqual([]);
	});

	it("returns nothing when the target itself is grouped or a refund", () => {
		const match = txn({ amount: 30, accountId: 2 });
		const grouped = txn({ amount: -30, accountId: 1, transferGroupId: 3 });
		const refund = txn({ amount: -30, accountId: 1, isRefund: true });
		const refundPaired = txn({ amount: -30, accountId: 1, linkedRefundId: 99 });
		expect(suggestTransferCounterparts(grouped, [match])).toEqual([]);
		expect(suggestTransferCounterparts(refund, [match])).toEqual([]);
		expect(suggestTransferCounterparts(refundPaired, [match])).toEqual([]);
	});

	it("never offers the target itself", () => {
		const target = txn({ amount: -30, accountId: 1 });
		expect(suggestTransferCounterparts(target, [target])).toEqual([]);
	});

	it("returns all matching counterparts (a split transfer)", () => {
		const target = txn({ amount: -30, accountId: 1, date: "2026-07-10" });
		const a = txn({ amount: 30, accountId: 2, date: "2026-07-10" });
		const b = txn({ amount: 30, accountId: 3, date: "2026-07-12" });
		const noise = txn({ amount: -30, accountId: 2 }); // same sign, ignored
		const result = suggestTransferCounterparts(target, [a, noise, b]);
		expect(ids(result)).toEqual([a.id, b.id]);
	});
});
