import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
	linkRefund,
	markAsOrphanRefund,
	undoLinkRefund,
	undoOrphanRefund,
} from "./refundService";

const createTx = (
	overrides: Partial<Parameters<typeof db.transactions.add>[0]> = {},
) => ({
	accountId: 1,
	date: new Date("2026-01-15"),
	amount: -29.99,
	rawMerchantString: "AMAZON",
	importedAt: new Date(),
	importMonth: "2026-01",
	...overrides,
});

beforeEach(async () => {
	await db.transactions.clear();
	await db.accounts.clear();
	await db.accounts.add({
		id: 1,
		name: "Test",
		type: "checking",
		createdAt: new Date(),
		updatedAt: new Date(),
	});
});

describe("Refund integration flows", () => {
	it("full flow: link refund → verify bidirectional → undo → verify restored", async () => {
		const purchaseId = await db.transactions.add(createTx({ amount: -29.99 }));
		const refundId = await db.transactions.add(
			createTx({ amount: 29.99, rawMerchantString: "AMAZON REFUND" }),
		);

		// Link
		await linkRefund(refundId, purchaseId);

		let refund = await db.transactions.get(refundId);
		let purchase = await db.transactions.get(purchaseId);
		expect(refund?.isRefund).toBe(true);
		expect(refund?.linkedRefundId).toBe(purchaseId);
		expect(purchase?.linkedRefundId).toBe(refundId);

		// Undo
		await undoLinkRefund(refundId, purchaseId);

		refund = await db.transactions.get(refundId);
		purchase = await db.transactions.get(purchaseId);
		expect(refund?.isRefund).toBe(false);
		expect(refund?.linkedRefundId).toBeUndefined();
		expect(purchase?.linkedRefundId).toBeUndefined();
	});

	it("orphan flow: mark as refund without linking → undo → verify restored", async () => {
		const txId = await db.transactions.add(createTx({ amount: 29.99 }));

		// Mark as orphan refund
		await markAsOrphanRefund(txId);

		let tx = await db.transactions.get(txId);
		expect(tx?.isRefund).toBe(true);
		expect(tx?.linkedRefundId).toBeUndefined();

		// Undo
		await undoOrphanRefund(txId);

		tx = await db.transactions.get(txId);
		expect(tx?.isRefund).toBe(false);
	});

	it("data integrity: linked transactions reference each other bidirectionally", async () => {
		const purchaseId = await db.transactions.add(createTx({ amount: -50.0 }));
		const refundId = await db.transactions.add(createTx({ amount: 50.0 }));

		await linkRefund(refundId, purchaseId);

		// Verify from refund side
		const refund = await db.transactions.get(refundId);
		expect(refund?.linkedRefundId).toBe(purchaseId);

		// Verify from purchase side
		const purchase = await db.transactions.get(purchaseId);
		expect(purchase?.linkedRefundId).toBe(refundId);

		// Verify can navigate both directions
		const linkedFromRefund = await db.transactions.get(refund!.linkedRefundId!);
		expect(linkedFromRefund?.id).toBe(purchaseId);

		const linkedFromPurchase = await db.transactions.get(
			purchase!.linkedRefundId!,
		);
		expect(linkedFromPurchase?.id).toBe(refundId);
	});

	it("prevents self-linking", async () => {
		const txId = await db.transactions.add(createTx({ amount: 29.99 }));
		await expect(linkRefund(txId, txId)).rejects.toThrow(
			"Cannot link a transaction to itself",
		);
	});

	it("prevents double-linking (purchase already linked)", async () => {
		const purchaseId = await db.transactions.add(createTx({ amount: -29.99 }));
		const refund1Id = await db.transactions.add(
			createTx({ amount: 29.99, rawMerchantString: "REFUND 1" }),
		);
		const refund2Id = await db.transactions.add(
			createTx({ amount: 29.99, rawMerchantString: "REFUND 2" }),
		);

		await linkRefund(refund1Id, purchaseId);
		await expect(linkRefund(refund2Id, purchaseId)).rejects.toThrow(
			"already has a linked refund",
		);
	});

	it("can query linked transactions via linkedRefundId index", async () => {
		const purchaseId = await db.transactions.add(createTx({ amount: -29.99 }));
		const refundId = await db.transactions.add(createTx({ amount: 29.99 }));

		await linkRefund(refundId, purchaseId);

		// Query by index
		const linkedToPurchase = await db.transactions
			.where("linkedRefundId")
			.equals(purchaseId)
			.toArray();
		expect(linkedToPurchase).toHaveLength(1);
		expect(linkedToPurchase[0].id).toBe(refundId);
	});
});
