import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { detectSubscriptions, runDetection } from "./subscriptionDetector";

const MS_PER_DAY = 86400000;

const createAccount = () =>
	db.accounts.add({
		name: "Test",
		type: "checking",
		createdAt: new Date(),
		updatedAt: new Date(),
	});

const createMerchant = (name: string) =>
	db.merchants.add({ name, createdAt: new Date(), firstSeen: new Date() });

const addTransaction = (
	accountId: number,
	merchantId: number,
	amount: number,
	date: string,
	extra?: Partial<{ isRefund: boolean }>,
) =>
	db.transactions.add({
		accountId,
		merchantId,
		date: new Date(date),
		amount,
		rawMerchantString: "TEST",
		importedAt: new Date(),
		importMonth: date.slice(0, 7),
		...extra,
	});

beforeEach(async () => {
	await db.transactions.clear();
	await db.merchants.clear();
	await db.accounts.clear();
	await db.subscriptions.clear();
});

describe("Subscription Detection Integration Tests", () => {
	it("full scenario: create merchant, add 3 monthly transactions, run detection -> subscription created", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Netflix");

		await addTransaction(accountId, merchantId, -15.99, "2025-10-15");
		await addTransaction(accountId, merchantId, -15.99, "2025-11-14");
		await addTransaction(accountId, merchantId, -15.99, "2025-12-15");

		const result = await runDetection();
		expect(result.created).toBe(1);

		const subs = await db.subscriptions.toArray();
		expect(subs).toHaveLength(1);
		expect(subs[0].merchantName).toBe("Netflix");
		expect(subs[0].frequency).toBe("monthly");
		expect(subs[0].status).toBe("active");
		expect(subs[0].chargeCount).toBe(3);
		expect(subs[0].transactionIds).toHaveLength(3);
	});

	it("amount tolerance: 3 charges within 10% -> single subscription with median amount", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Streaming");

		await addTransaction(accountId, merchantId, -15.99, "2025-10-15");
		await addTransaction(accountId, merchantId, -16.49, "2025-11-15");
		await addTransaction(accountId, merchantId, -15.99, "2025-12-15");

		const result = await runDetection();
		expect(result.created).toBe(1);

		const subs = await db.subscriptions.toArray();
		expect(subs).toHaveLength(1);
		// Median of [-15.99, -15.99, -16.49] sorted by abs = [-15.99, -15.99, -16.49] -> median = -15.99
		expect(subs[0].typicalAmount).toBe(-15.99);
	});

	it("multi-frequency: Apple merchant with monthly and yearly -> 2 separate subscriptions", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Apple");

		// Monthly iCloud
		await addTransaction(accountId, merchantId, -2.99, "2025-10-15");
		await addTransaction(accountId, merchantId, -2.99, "2025-11-15");
		await addTransaction(accountId, merchantId, -2.99, "2025-12-15");

		// Yearly Apple One
		await addTransaction(accountId, merchantId, -99.99, "2024-01-10");
		await addTransaction(accountId, merchantId, -99.99, "2025-01-08");

		const result = await runDetection();
		expect(result.created).toBe(2);

		const subs = await db.subscriptions.toArray();
		expect(subs).toHaveLength(2);

		const monthly = subs.find((s) => s.frequency === "monthly");
		const yearly = subs.find((s) => s.frequency === "yearly");
		expect(monthly).toBeDefined();
		expect(yearly).toBeDefined();
		expect(monthly!.merchantName).toBe("Apple");
		expect(yearly!.merchantName).toBe("Apple");
	});

	it("cancellation: monthly sub, no charge for 65 days -> marked possibly-cancelled", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("OldService");

		await addTransaction(accountId, merchantId, -10.0, "2025-07-01");
		await addTransaction(accountId, merchantId, -10.0, "2025-08-01");
		await addTransaction(accountId, merchantId, -10.0, "2025-09-01");

		const result = await runDetection();
		// The sub was created then immediately checked for cancellation
		expect(result.markedCancelled).toBeGreaterThanOrEqual(1);

		const subs = await db.subscriptions.toArray();
		expect(subs[0].status).toBe("possibly-cancelled");
	});

	it("reactivation: possibly-cancelled sub, new charges imported -> back to active", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Reactivated");

		const now = new Date();
		const oneMonthAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
		const twoMonthsAgo = new Date(now.getTime() - 60 * MS_PER_DAY);

		// Pre-create a possibly-cancelled subscription
		await db.subscriptions.add({
			merchantId,
			merchantName: "Reactivated",
			typicalAmount: -20.0,
			frequency: "monthly",
			intervalDays: 30,
			lastChargeDate: "2025-06-01",
			firstChargeDate: "2025-04-01",
			chargeCount: 3,
			status: "possibly-cancelled",
			transactionIds: [],
			detectedAt: "2025-06-01",
			updatedAt: "2025-06-01",
		});

		// New monthly charges
		await addTransaction(
			accountId,
			merchantId,
			-20.0,
			twoMonthsAgo.toISOString().split("T")[0],
		);
		await addTransaction(
			accountId,
			merchantId,
			-20.0,
			oneMonthAgo.toISOString().split("T")[0],
		);

		await runDetection();
		const subs = await db.subscriptions.toArray();
		expect(subs).toHaveLength(1);
		expect(subs[0].status).toBe("active");
	});

	it("no false positives: 2 transactions 90 days apart -> not monthly", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Irregular");

		await addTransaction(accountId, merchantId, -50.0, "2025-10-01");
		await addTransaction(accountId, merchantId, -50.0, "2025-12-30"); // ~90 days, not monthly or yearly

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(0);
	});

	it("minimum threshold: single transaction from merchant -> no subscription", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("OneTime");

		await addTransaction(accountId, merchantId, -50.0, "2025-12-01");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(0);
	});

	it("refund exclusion: refund transactions excluded from detection", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Store");

		// Only 2 expense transactions, 1 refund between them
		await addTransaction(accountId, merchantId, -25.0, "2025-10-15");
		await addTransaction(accountId, merchantId, 25.0, "2025-11-01", {
			isRefund: true,
		});
		await addTransaction(accountId, merchantId, -25.0, "2025-11-15");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(1);
		expect(subs[0].chargeCount).toBe(2); // Only expenses, not the refund
	});

	it("import trigger simulation: run detection after adding transactions", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Spotify");

		// Simulate first import
		await addTransaction(accountId, merchantId, -9.99, "2025-10-15");
		await addTransaction(accountId, merchantId, -9.99, "2025-11-15");

		const result1 = await runDetection();
		expect(result1.created).toBe(1);

		// Simulate second import with new transaction
		await addTransaction(accountId, merchantId, -9.99, "2025-12-15");

		const result2 = await runDetection();
		expect(result2.created).toBe(0);
		expect(result2.updated).toBe(1);

		const subs = await db.subscriptions.toArray();
		expect(subs).toHaveLength(1); // No duplicate
		expect(subs[0].chargeCount).toBe(3);
	});

	it("empty database: detection returns no results", async () => {
		const result = await runDetection();
		expect(result.created).toBe(0);
		expect(result.updated).toBe(0);
		expect(result.markedCancelled).toBe(0);

		const subs = await db.subscriptions.toArray();
		expect(subs).toHaveLength(0);
	});

	it("unmatched transactions (no merchantId) are excluded from detection", async () => {
		const accountId = await createAccount();

		// Transactions without merchantId
		await db.transactions.add({
			accountId,
			date: new Date("2025-10-15"),
			amount: -15.99,
			rawMerchantString: "UNKNOWN",
			importedAt: new Date(),
			importMonth: "2025-10",
		});
		await db.transactions.add({
			accountId,
			date: new Date("2025-11-15"),
			amount: -15.99,
			rawMerchantString: "UNKNOWN",
			importedAt: new Date(),
			importMonth: "2025-11",
		});

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(0);
	});
});
