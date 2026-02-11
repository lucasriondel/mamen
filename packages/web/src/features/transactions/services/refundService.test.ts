import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
	linkRefund,
	markAsOrphanRefund,
	replaceLinkRefund,
	undoLinkRefund,
	undoOrphanRefund,
	undoReplaceLinkRefund,
	undoUnlinkRefund,
	unlinkRefund,
} from "./refundService";

const createTransaction = (
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

describe("linkRefund", () => {
	it("sets isRefund true and linkedRefundId on refund transaction", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99, rawMerchantString: "AMAZON REFUND" }),
		);

		await linkRefund(refundId, purchaseId);

		const refund = await db.transactions.get(refundId);
		expect(refund!.isRefund).toBe(true);
		expect(refund!.linkedRefundId).toBe(purchaseId);
	});

	it("sets linkedRefundId on purchase transaction (back-reference)", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99, rawMerchantString: "AMAZON REFUND" }),
		);

		await linkRefund(refundId, purchaseId);

		const purchase = await db.transactions.get(purchaseId);
		expect(purchase!.linkedRefundId).toBe(refundId);
	});

	it("cannot link a transaction to itself", async () => {
		const txId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await expect(linkRefund(txId, txId)).rejects.toThrow(
			"Cannot link a transaction to itself",
		);
	});

	it("prevents double-linking when purchase already has a linked refund", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refund1Id = await db.transactions.add(
			createTransaction({ amount: 29.99, rawMerchantString: "REFUND 1" }),
		);
		const refund2Id = await db.transactions.add(
			createTransaction({ amount: 29.99, rawMerchantString: "REFUND 2" }),
		);

		await linkRefund(refund1Id, purchaseId);

		await expect(linkRefund(refund2Id, purchaseId)).rejects.toThrow(
			"This purchase already has a linked refund",
		);
	});

	it("is atomic — both updates succeed together", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, purchaseId);

		const refund = await db.transactions.get(refundId);
		const purchase = await db.transactions.get(purchaseId);

		// Both should be updated
		expect(refund!.linkedRefundId).toBe(purchaseId);
		expect(purchase!.linkedRefundId).toBe(refundId);
	});

	it("returns previous state for undo", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		const result = await linkRefund(refundId, purchaseId);

		expect(result.refundPrevious.isRefund).toBeUndefined();
		expect(result.refundPrevious.linkedRefundId).toBeUndefined();
		expect(result.purchasePrevious.linkedRefundId).toBeUndefined();
	});
});

describe("undoLinkRefund", () => {
	it("restores both transactions to unlinked state", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, purchaseId);
		await undoLinkRefund(refundId, purchaseId);

		const refund = await db.transactions.get(refundId);
		const purchase = await db.transactions.get(purchaseId);

		expect(refund!.isRefund).toBe(false);
		expect(refund!.linkedRefundId).toBeUndefined();
		expect(purchase!.linkedRefundId).toBeUndefined();
	});
});

describe("markAsOrphanRefund", () => {
	it("sets isRefund true with no linkedRefundId", async () => {
		const txId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await markAsOrphanRefund(txId);

		const tx = await db.transactions.get(txId);
		expect(tx!.isRefund).toBe(true);
		expect(tx!.linkedRefundId).toBeUndefined();
	});

	it("returns previous state", async () => {
		const txId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		const result = await markAsOrphanRefund(txId);
		expect(result.previousIsRefund).toBeUndefined();
	});
});

describe("undoOrphanRefund", () => {
	it("restores isRefund to false", async () => {
		const txId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await markAsOrphanRefund(txId);
		await undoOrphanRefund(txId);

		const tx = await db.transactions.get(txId);
		expect(tx!.isRefund).toBe(false);
	});
});

describe("unlinkRefund", () => {
	it("clears isRefund and linkedRefundId on refund", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, purchaseId);
		await unlinkRefund(refundId, purchaseId);

		const refund = await db.transactions.get(refundId);
		expect(refund!.isRefund).toBe(false);
		expect(refund!.linkedRefundId).toBeUndefined();
	});

	it("clears linkedRefundId on purchase", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, purchaseId);
		await unlinkRefund(refundId, purchaseId);

		const purchase = await db.transactions.get(purchaseId);
		expect(purchase!.linkedRefundId).toBeUndefined();
	});

	it("is atomic — both updates succeed or both fail", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, purchaseId);
		await unlinkRefund(refundId, purchaseId);

		const refund = await db.transactions.get(refundId);
		const purchase = await db.transactions.get(purchaseId);
		expect(refund!.linkedRefundId).toBeUndefined();
		expect(purchase!.linkedRefundId).toBeUndefined();
	});
});

describe("undoUnlinkRefund", () => {
	it("restores bidirectional link", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, purchaseId);
		await unlinkRefund(refundId, purchaseId);
		await undoUnlinkRefund(refundId, purchaseId);

		const refund = await db.transactions.get(refundId);
		const purchase = await db.transactions.get(purchaseId);
		expect(refund!.isRefund).toBe(true);
		expect(refund!.linkedRefundId).toBe(purchaseId);
		expect(purchase!.linkedRefundId).toBe(refundId);
	});
});

describe("replaceLinkRefund", () => {
	it("clears old purchase reference", async () => {
		const oldPurchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const newPurchaseId = await db.transactions.add(
			createTransaction({ amount: -31.5, rawMerchantString: "STORE" }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, oldPurchaseId);
		await replaceLinkRefund(refundId, oldPurchaseId, newPurchaseId);

		const oldPurchase = await db.transactions.get(oldPurchaseId);
		expect(oldPurchase!.linkedRefundId).toBeUndefined();
	});

	it("creates new bidirectional link", async () => {
		const oldPurchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const newPurchaseId = await db.transactions.add(
			createTransaction({ amount: -31.5, rawMerchantString: "STORE" }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, oldPurchaseId);
		await replaceLinkRefund(refundId, oldPurchaseId, newPurchaseId);

		const refund = await db.transactions.get(refundId);
		const newPurchase = await db.transactions.get(newPurchaseId);
		expect(refund!.isRefund).toBe(true);
		expect(refund!.linkedRefundId).toBe(newPurchaseId);
		expect(newPurchase!.linkedRefundId).toBe(refundId);
	});

	it("is atomic — all three updates succeed or all fail", async () => {
		const oldPurchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const newPurchaseId = await db.transactions.add(
			createTransaction({ amount: -31.5, rawMerchantString: "STORE" }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, oldPurchaseId);
		await replaceLinkRefund(refundId, oldPurchaseId, newPurchaseId);

		const oldPurchase = await db.transactions.get(oldPurchaseId);
		const newPurchase = await db.transactions.get(newPurchaseId);
		const refund = await db.transactions.get(refundId);

		expect(oldPurchase!.linkedRefundId).toBeUndefined();
		expect(newPurchase!.linkedRefundId).toBe(refundId);
		expect(refund!.linkedRefundId).toBe(newPurchaseId);
	});
});

describe("undoReplaceLinkRefund", () => {
	it("reverts to old purchase link", async () => {
		const oldPurchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const newPurchaseId = await db.transactions.add(
			createTransaction({ amount: -31.5, rawMerchantString: "STORE" }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, oldPurchaseId);
		await replaceLinkRefund(refundId, oldPurchaseId, newPurchaseId);
		await undoReplaceLinkRefund(refundId, oldPurchaseId, newPurchaseId);

		const refund = await db.transactions.get(refundId);
		const oldPurchase = await db.transactions.get(oldPurchaseId);
		const newPurchase = await db.transactions.get(newPurchaseId);

		expect(refund!.linkedRefundId).toBe(oldPurchaseId);
		expect(oldPurchase!.linkedRefundId).toBe(refundId);
		expect(newPurchase!.linkedRefundId).toBeUndefined();
	});
});

describe("category inheritance", () => {
	it("linkRefund inherits categoryId from purchase when refund has no category", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99, categoryId: 5 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, purchaseId);

		const refund = await db.transactions.get(refundId);
		expect(refund!.categoryId).toBe(5);
	});

	it("linkRefund does NOT override refund categoryId when refund already has a category", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99, categoryId: 5 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99, categoryId: 10 }),
		);

		await linkRefund(refundId, purchaseId);

		const refund = await db.transactions.get(refundId);
		expect(refund!.categoryId).toBe(10);
	});

	it("linkRefund does not change refund category when purchase has no category", async () => {
		const purchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, purchaseId);

		const refund = await db.transactions.get(refundId);
		expect(refund!.categoryId).toBeUndefined();
	});

	it("replaceLinkRefund inherits category from new purchase when refund has no manual category", async () => {
		const oldPurchaseId = await db.transactions.add(
			createTransaction({ amount: -29.99 }),
		);
		const newPurchaseId = await db.transactions.add(
			createTransaction({ amount: -31.5, categoryId: 7 }),
		);
		const refundId = await db.transactions.add(
			createTransaction({ amount: 29.99 }),
		);

		await linkRefund(refundId, oldPurchaseId);
		await replaceLinkRefund(refundId, oldPurchaseId, newPurchaseId);

		const refund = await db.transactions.get(refundId);
		expect(refund!.categoryId).toBe(7);
	});
});
