import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
	areAmountsSimilar,
	detectSubscriptions,
	runDetection,
} from "./subscriptionDetector";

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

describe("areAmountsSimilar", () => {
	it("returns true for identical amounts", () => {
		expect(areAmountsSimilar(-15.99, -15.99)).toBe(true);
	});

	it("returns true for amounts within 10% tolerance", () => {
		// 15.99 vs 16.49: diff = 0.50, avg = 16.24, ratio = 0.0308 < 0.1
		expect(areAmountsSimilar(-15.99, -16.49)).toBe(true);
	});

	it("returns false for amounts outside 10% tolerance", () => {
		// 9.99 vs 99.99: way outside 10%
		expect(areAmountsSimilar(-9.99, -99.99)).toBe(false);
	});

	it("returns true for both zero", () => {
		expect(areAmountsSimilar(0, 0)).toBe(true);
	});
});

describe("detectSubscriptions", () => {
	it("detects 3 monthly Netflix charges at ~30 day intervals", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Netflix");

		await addTransaction(accountId, merchantId, -15.99, "2025-10-15");
		await addTransaction(accountId, merchantId, -15.99, "2025-11-14");
		await addTransaction(accountId, merchantId, -15.99, "2025-12-15");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(1);
		expect(subs[0].merchantName).toBe("Netflix");
		expect(subs[0].frequency).toBe("monthly");
		expect(subs[0].chargeCount).toBe(3);
		expect(subs[0].typicalAmount).toBe(-15.99);
	});

	it("detects 2 yearly charges at ~365 day intervals", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Domain Registrar");

		await addTransaction(accountId, merchantId, -99.99, "2024-01-10");
		await addTransaction(accountId, merchantId, -99.99, "2025-01-08");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(1);
		expect(subs[0].frequency).toBe("yearly");
		expect(subs[0].chargeCount).toBe(2);
	});

	it("detects weekly charges correctly", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Gym");

		await addTransaction(accountId, merchantId, -5.0, "2025-12-01");
		await addTransaction(accountId, merchantId, -5.0, "2025-12-08");
		await addTransaction(accountId, merchantId, -5.0, "2025-12-15");
		await addTransaction(accountId, merchantId, -5.0, "2025-12-22");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(1);
		expect(subs[0].frequency).toBe("weekly");
	});

	it("detects subscription with amounts within +-10% tolerance", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Streaming");

		await addTransaction(accountId, merchantId, -15.99, "2025-10-15");
		await addTransaction(accountId, merchantId, -16.49, "2025-11-15");
		await addTransaction(accountId, merchantId, -15.99, "2025-12-15");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(1);
		// Median of [-16.49, -15.99, -15.99] sorted = [-15.99, -15.99, -16.49] -> median = -15.99
		expect(subs[0].typicalAmount).toBe(-15.99);
	});

	it("does not detect when amounts are outside +-10% tolerance", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Shop");

		await addTransaction(accountId, merchantId, -9.99, "2025-10-15");
		await addTransaction(accountId, merchantId, -99.99, "2025-11-15");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(0);
	});

	it("detects irregular intervals within tolerance (28, 31, 30 days)", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("ISP");

		await addTransaction(accountId, merchantId, -49.99, "2025-10-01");
		await addTransaction(accountId, merchantId, -49.99, "2025-10-29"); // 28 days
		await addTransaction(accountId, merchantId, -49.99, "2025-11-29"); // 31 days
		await addTransaction(accountId, merchantId, -49.99, "2025-12-29"); // 30 days

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(1);
		expect(subs[0].frequency).toBe("monthly");
	});

	it("does not detect when intervals are too irregular", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Random");

		await addTransaction(accountId, merchantId, -20.0, "2025-10-01");
		await addTransaction(accountId, merchantId, -20.0, "2025-10-16"); // 15 days
		await addTransaction(accountId, merchantId, -20.0, "2025-12-01"); // 46 days

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(0);
	});

	it("does not detect with single transaction per merchant", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("OneTime");

		await addTransaction(accountId, merchantId, -50.0, "2025-12-01");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(0);
	});

	it("detects multiple subscriptions per merchant with different frequencies", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Apple");

		// Monthly iCloud
		await addTransaction(accountId, merchantId, -2.99, "2025-10-15");
		await addTransaction(accountId, merchantId, -2.99, "2025-11-15");
		await addTransaction(accountId, merchantId, -2.99, "2025-12-15");

		// Yearly Apple One
		await addTransaction(accountId, merchantId, -99.99, "2024-01-10");
		await addTransaction(accountId, merchantId, -99.99, "2025-01-08");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(2);

		const monthly = subs.find((s) => s.frequency === "monthly");
		const yearly = subs.find((s) => s.frequency === "yearly");
		expect(monthly).toBeDefined();
		expect(yearly).toBeDefined();
		expect(monthly!.typicalAmount).toBe(-2.99);
	});

	it("excludes refund transactions from detection", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Store");

		await addTransaction(accountId, merchantId, -25.0, "2025-10-15");
		await addTransaction(accountId, merchantId, 25.0, "2025-11-01", {
			isRefund: true,
		});
		await addTransaction(accountId, merchantId, -25.0, "2025-11-15");

		// Only 2 expense transactions 31 days apart, which is monthly
		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(1);
		expect(subs[0].chargeCount).toBe(2);
	});

	it("excludes positive amounts (income) from detection", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Employer");

		// Positive amounts = income, not subscriptions
		await addTransaction(accountId, merchantId, 3000.0, "2025-10-01");
		await addTransaction(accountId, merchantId, 3000.0, "2025-11-01");
		await addTransaction(accountId, merchantId, 3000.0, "2025-12-01");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(0);
	});

	it("returns empty results for empty database", async () => {
		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(0);
	});

	it("uses most recent amount as typical for 2-transaction subscription", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Service");

		await addTransaction(accountId, merchantId, -10.0, "2024-01-15");
		await addTransaction(accountId, merchantId, -10.5, "2025-01-15");

		const subs = await detectSubscriptions();
		expect(subs).toHaveLength(1);
		expect(subs[0].typicalAmount).toBe(-10.5);
	});
});

describe("runDetection", () => {
	it("creates new subscription records on first detection", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Netflix");

		await addTransaction(accountId, merchantId, -15.99, "2025-10-15");
		await addTransaction(accountId, merchantId, -15.99, "2025-11-15");
		await addTransaction(accountId, merchantId, -15.99, "2025-12-15");

		const result = await runDetection();
		expect(result.created).toBe(1);
		expect(result.updated).toBe(0);

		const subs = await db.subscriptions.toArray();
		expect(subs).toHaveLength(1);
		expect(subs[0].status).toBe("active");
		expect(subs[0].merchantName).toBe("Netflix");
	});

	it("updates existing subscriptions on re-detection without duplicates", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Netflix");

		await addTransaction(accountId, merchantId, -15.99, "2025-10-15");
		await addTransaction(accountId, merchantId, -15.99, "2025-11-15");
		await addTransaction(accountId, merchantId, -15.99, "2025-12-15");

		// First detection
		await runDetection();

		// Add new transaction
		await addTransaction(accountId, merchantId, -15.99, "2026-01-15");

		// Re-run detection
		const result = await runDetection();
		expect(result.created).toBe(0);
		expect(result.updated).toBe(1);

		const subs = await db.subscriptions.toArray();
		expect(subs).toHaveLength(1);
		expect(subs[0].chargeCount).toBe(4);
		expect(subs[0].lastChargeDate).toBe("2026-01-15");
	});

	it("extends transactionIds list as new charges are detected", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Spotify");

		const tx1 = await addTransaction(
			accountId,
			merchantId,
			-9.99,
			"2025-10-15",
		);
		const tx2 = await addTransaction(
			accountId,
			merchantId,
			-9.99,
			"2025-11-15",
		);

		await runDetection();
		let subs = await db.subscriptions.toArray();
		expect(subs[0].transactionIds).toHaveLength(2);
		expect(subs[0].transactionIds).toContain(tx1);
		expect(subs[0].transactionIds).toContain(tx2);

		const tx3 = await addTransaction(
			accountId,
			merchantId,
			-9.99,
			"2025-12-15",
		);
		await runDetection();

		subs = await db.subscriptions.toArray();
		expect(subs[0].transactionIds).toHaveLength(3);
		expect(subs[0].transactionIds).toContain(tx3);
	});

	it("marks subscription as possibly-cancelled when 2+ cycles missed", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("OldService");

		// Monthly subscription with last charge 90 days ago
		await addTransaction(accountId, merchantId, -10.0, "2025-07-01");
		await addTransaction(accountId, merchantId, -10.0, "2025-08-01");
		await addTransaction(accountId, merchantId, -10.0, "2025-09-01");

		await runDetection();

		const subs = await db.subscriptions.toArray();
		expect(subs[0].status).toBe("possibly-cancelled");
	});

	it("reactivates possibly-cancelled subscription when new charge detected", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Reactivated");

		const now = new Date();
		const oneMonthAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
		const twoMonthsAgo = new Date(now.getTime() - 60 * MS_PER_DAY);

		// Pre-create a subscription marked as possibly-cancelled
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

		// New monthly charges arrive
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

		// Re-run detection - finds a valid pattern and reactivates
		await runDetection();
		const subs = await db.subscriptions.toArray();
		expect(subs).toHaveLength(1);
		expect(subs[0].status).toBe("active");
	});

	it("keeps active subscription when recent charge exists", async () => {
		const accountId = await createAccount();
		const merchantId = await createMerchant("Current");

		const now = new Date();
		const oneMonthAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
		const twoMonthsAgo = new Date(now.getTime() - 60 * MS_PER_DAY);
		const threeMonthsAgo = new Date(now.getTime() - 90 * MS_PER_DAY);

		await addTransaction(
			accountId,
			merchantId,
			-12.99,
			threeMonthsAgo.toISOString().split("T")[0],
		);
		await addTransaction(
			accountId,
			merchantId,
			-12.99,
			twoMonthsAgo.toISOString().split("T")[0],
		);
		await addTransaction(
			accountId,
			merchantId,
			-12.99,
			oneMonthAgo.toISOString().split("T")[0],
		);

		const result = await runDetection();
		expect(result.markedCancelled).toBe(0);

		const subs = await db.subscriptions.toArray();
		expect(subs[0].status).toBe("active");
	});
});

const MS_PER_DAY = 86400000;
