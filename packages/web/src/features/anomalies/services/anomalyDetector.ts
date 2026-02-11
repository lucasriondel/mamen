import {
	categoriesApi,
	merchantsApi,
	settingsApi,
	transactionsApi,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import { formatDate } from "@/lib/utils/formatDate";
import type { AnomalyFlag, AnomalySettings, Transaction } from "@/types";

export const NEW_MERCHANT_THRESHOLD_DAYS = 30;
export const DUPLICATE_WINDOW_DAYS = 3;

const DEFAULT_SETTINGS: AnomalySettings = {
	multiplierThreshold: 2,
	absoluteThreshold: null,
	minTransactionsForDetection: 5,
};

export const getAnomalySettings = async (): Promise<AnomalySettings> => {
	try {
		const stored = await settingsApi.getByKey("anomaly_settings");
		if (!stored) return DEFAULT_SETTINGS;
		try {
			return JSON.parse(stored.value) as AnomalySettings;
		} catch {
			return DEFAULT_SETTINGS;
		}
	} catch {
		return DEFAULT_SETTINGS;
	}
};

export const buildReason = (
	amount: number,
	avg: number,
	categoryName: string,
): string => {
	const multiplier = Math.round((Math.abs(amount) / avg) * 10) / 10;
	return `${formatCurrency(Math.abs(amount))} is ${multiplier}x your average for ${categoryName} (${formatCurrency(avg)})`;
};

export const detectHighAmountAnomalies = async (): Promise<{
	flagged: number;
	skippedCategories: number;
}> => {
	const settings = await getAnomalySettings();
	const allTransactions = await transactionsApi.getAll();
	const categories = await categoriesApi.getAll();

	const categoryMap = new Map(categories.map((c) => [c.id!, c.name]));

	// Filter to categorized, non-refund, non-excluded, expense transactions
	const eligible = allTransactions.filter(
		(tx) =>
			tx.categoryId != null &&
			!tx.isRefund &&
			!tx.isDuplicateExcluded &&
			tx.amount < 0,
	);

	// Group by categoryId
	const byCategoryId = new Map<number, Transaction[]>();
	for (const tx of eligible) {
		const group = byCategoryId.get(tx.categoryId!) ?? [];
		group.push(tx);
		byCategoryId.set(tx.categoryId!, group);
	}

	let flagged = 0;
	let skippedCategories = 0;
	const updatedTransactions: { id: number; anomalyFlags: AnomalyFlag[] }[] = [];

	for (const [categoryId, transactions] of byCategoryId) {
		if (transactions.length < settings.minTransactionsForDetection) {
			skippedCategories++;
			continue;
		}

		const categoryName = categoryMap.get(categoryId) ?? "Unknown";

		for (const tx of transactions) {
			// Skip if already has a high-amount flag (dismissed or active)
			if (tx.anomalyFlags?.some((f) => f.type === "high-amount")) continue;

			// Calculate average excluding the current transaction (avoid self-inflation)
			const others = transactions.filter((t) => t.id !== tx.id);
			const avg =
				others.reduce((sum, t) => sum + Math.abs(t.amount), 0) / others.length;

			const absAmount = Math.abs(tx.amount);
			const exceedsMultiplier = absAmount > avg * settings.multiplierThreshold;
			const exceedsAbsolute =
				settings.absoluteThreshold != null &&
				absAmount > settings.absoluteThreshold;

			if (exceedsMultiplier || exceedsAbsolute) {
				const reason = buildReason(tx.amount, avg, categoryName);
				const newFlag: AnomalyFlag = {
					type: "high-amount",
					reason,
					detectedAt: new Date().toISOString(),
					dismissed: false,
				};

				const existingFlags = tx.anomalyFlags ?? [];
				updatedTransactions.push({
					id: tx.id!,
					anomalyFlags: [...existingFlags, newFlag],
				});
				flagged++;
			}
		}
	}

	// Batch update
	for (const update of updatedTransactions) {
		await transactionsApi.update(update.id, {
			anomalyFlags: update.anomalyFlags,
		});
	}

	return { flagged, skippedCategories };
};

export const dismissAnomaly = async (
	transactionId: number,
	anomalyType: string,
): Promise<void> => {
	const tx = await transactionsApi.get(transactionId);
	if (!tx?.anomalyFlags) return;

	const updatedFlags = tx.anomalyFlags.map((flag) =>
		flag.type === anomalyType
			? { ...flag, dismissed: true, dismissedAt: new Date().toISOString() }
			: flag,
	);

	await transactionsApi.update(transactionId, { anomalyFlags: updatedFlags });
};

export const undoDismissAnomaly = async (
	transactionId: number,
	anomalyType: string,
): Promise<void> => {
	const tx = await transactionsApi.get(transactionId);
	if (!tx?.anomalyFlags) return;

	const updatedFlags = tx.anomalyFlags.map((flag) =>
		flag.type === anomalyType
			? { ...flag, dismissed: false, dismissedAt: undefined }
			: flag,
	);

	await transactionsApi.update(transactionId, { anomalyFlags: updatedFlags });
};

export const removeHighAmountFlags = async (
	transactionId: number,
): Promise<void> => {
	const tx = await transactionsApi.get(transactionId);
	if (!tx?.anomalyFlags) return;

	const updatedFlags = tx.anomalyFlags.filter((f) => f.type !== "high-amount");
	await transactionsApi.update(transactionId, {
		anomalyFlags: updatedFlags.length > 0 ? updatedFlags : undefined,
	});
};

export const cleanExpiredNewMerchantFlags = async (): Promise<{
	cleaned: number;
}> => {
	const threshold = new Date();
	threshold.setDate(threshold.getDate() - NEW_MERCHANT_THRESHOLD_DAYS);

	// Get merchants that are no longer "new" (createdAt <= threshold)
	const allMerchants = await merchantsApi.getAll();
	const expiredMerchantIds = new Set(
		allMerchants.filter((m) => m.createdAt <= threshold).map((m) => m.id!),
	);

	if (expiredMerchantIds.size === 0) return { cleaned: 0 };

	const allTransactions = await transactionsApi.getAll();
	let cleaned = 0;
	const updates: { id: number; anomalyFlags: AnomalyFlag[] | undefined }[] = [];

	for (const tx of allTransactions) {
		if (!tx.merchantId || !expiredMerchantIds.has(tx.merchantId)) continue;
		if (
			!tx.anomalyFlags?.some((f) => f.type === "new-merchant" && !f.dismissed)
		)
			continue;

		const updatedFlags = tx.anomalyFlags.filter(
			(f) => !(f.type === "new-merchant" && !f.dismissed),
		);
		updates.push({
			id: tx.id!,
			anomalyFlags: updatedFlags.length > 0 ? updatedFlags : undefined,
		});
		cleaned++;
	}

	for (const update of updates) {
		await transactionsApi.update(update.id, {
			anomalyFlags: update.anomalyFlags,
		});
	}

	return { cleaned };
};

export const detectNewMerchantAnomalies = async (): Promise<{
	flagged: number;
}> => {
	const threshold = new Date();
	threshold.setDate(threshold.getDate() - NEW_MERCHANT_THRESHOLD_DAYS);

	// Get new merchants (createdAt > threshold, i.e., less than 30 days old)
	const allMerchants = await merchantsApi.getAll();
	const newMerchants = allMerchants.filter((m) => m.createdAt > threshold);

	if (newMerchants.length === 0) return { flagged: 0 };

	const newMerchantMap = new Map(newMerchants.map((m) => [m.id!, m]));

	const allTransactions = await transactionsApi.getAll();
	let flagged = 0;
	const updates: { id: number; anomalyFlags: AnomalyFlag[] }[] = [];

	for (const tx of allTransactions) {
		if (!tx.merchantId || !newMerchantMap.has(tx.merchantId)) continue;
		// Skip if already has a new-merchant flag (dismissed or active)
		if (tx.anomalyFlags?.some((f) => f.type === "new-merchant")) continue;

		const merchant = newMerchantMap.get(tx.merchantId)!;
		const ageInDays = Math.floor(
			(Date.now() - merchant.createdAt.getTime()) / (1000 * 60 * 60 * 24),
		);
		const reason = `First seen merchant - ${merchant.name} created ${ageInDays} days ago`;

		const newFlag: AnomalyFlag = {
			type: "new-merchant",
			reason,
			detectedAt: new Date().toISOString(),
			dismissed: false,
		};

		const existingFlags = tx.anomalyFlags ?? [];
		updates.push({
			id: tx.id!,
			anomalyFlags: [...existingFlags, newFlag],
		});
		flagged++;
	}

	for (const update of updates) {
		await transactionsApi.update(update.id, {
			anomalyFlags: update.anomalyFlags,
		});
	}

	return { flagged };
};

const isWithinDays = (dateA: Date, dateB: Date, days: number): boolean => {
	const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
	return diffMs <= days * 24 * 60 * 60 * 1000;
};

const hasDuplicateFlagForPair = (tx: Transaction, otherId: number): boolean => {
	if (!tx.anomalyFlags) return false;
	return tx.anomalyFlags.some(
		(f) =>
			f.type === "potential-duplicate" && f.linkedTransactionId === otherId,
	);
};

export const detectPotentialDuplicates = async (): Promise<{
	flagged: number;
	pairs: number;
}> => {
	const allTransactions = await transactionsApi.getAll();

	// Filter out refunds and excluded duplicates
	const eligible = allTransactions.filter(
		(tx) => !tx.isRefund && !tx.isDuplicateExcluded,
	);

	// Group by merchantId (matched transactions)
	const byMerchantId = new Map<number, Transaction[]>();
	// Group by rawMerchantString (unmatched transactions)
	const byRawString = new Map<string, Transaction[]>();

	for (const tx of eligible) {
		if (tx.merchantId) {
			const group = byMerchantId.get(tx.merchantId) ?? [];
			group.push(tx);
			byMerchantId.set(tx.merchantId, group);
		} else {
			const key = tx.rawMerchantString;
			const group = byRawString.get(key) ?? [];
			group.push(tx);
			byRawString.set(key, group);
		}
	}

	// Combine all groups for processing
	const allGroups = [...byMerchantId.values(), ...byRawString.values()];

	// Load merchant names for reason strings
	const merchants = await merchantsApi.getAll();
	const merchantNameMap = new Map(merchants.map((m) => [m.id!, m.name]));

	let pairs = 0;
	// Map from txId -> list of new flags to add
	const newFlagsMap = new Map<number, AnomalyFlag[]>();

	for (const group of allGroups) {
		if (group.length < 2) continue;

		// Sort by date ascending
		group.sort((a, b) => a.date.getTime() - b.date.getTime());

		// Sliding window comparison within group
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const txA = group[i];
				const txB = group[j];

				// If txB is more than DUPLICATE_WINDOW_DAYS after txA, skip all further
				if (!isWithinDays(txA.date, txB.date, DUPLICATE_WINDOW_DAYS)) break;

				// Check same amount (exact match)
				if (txA.amount !== txB.amount) continue;

				// Skip if this pair already has flags (active or dismissed)
				if (
					hasDuplicateFlagForPair(txA, txB.id!) ||
					hasDuplicateFlagForPair(txB, txA.id!)
				)
					continue;

				// Determine merchant name
				const merchantName = txA.merchantId
					? (merchantNameMap.get(txA.merchantId) ?? txA.rawMerchantString)
					: txA.rawMerchantString;

				const flagA: AnomalyFlag = {
					type: "potential-duplicate",
					reason: `Same amount (${formatCurrency(Math.abs(txA.amount))}) as transaction on ${formatDate(txB.date)} at ${merchantName}`,
					detectedAt: new Date().toISOString(),
					dismissed: false,
					linkedTransactionId: txB.id!,
				};

				const flagB: AnomalyFlag = {
					type: "potential-duplicate",
					reason: `Same amount (${formatCurrency(Math.abs(txB.amount))}) as transaction on ${formatDate(txA.date)} at ${merchantName}`,
					detectedAt: new Date().toISOString(),
					dismissed: false,
					linkedTransactionId: txA.id!,
				};

				const flagsA = newFlagsMap.get(txA.id!) ?? [];
				flagsA.push(flagA);
				newFlagsMap.set(txA.id!, flagsA);

				const flagsB = newFlagsMap.get(txB.id!) ?? [];
				flagsB.push(flagB);
				newFlagsMap.set(txB.id!, flagsB);

				pairs++;
			}
		}
	}

	// Batch update
	let flagged = 0;
	for (const [txId, newFlags] of newFlagsMap) {
		const tx = await transactionsApi.get(txId);
		if (!tx) continue;
		const existingFlags = tx.anomalyFlags ?? [];
		await transactionsApi.update(txId, {
			anomalyFlags: [...existingFlags, ...newFlags],
		});
		flagged++;
	}

	return { flagged, pairs };
};

export const dismissDuplicateAnomaly = async (
	transactionId: number,
): Promise<void> => {
	const tx = await transactionsApi.get(transactionId);
	if (!tx?.anomalyFlags) return;

	const dupFlag = tx.anomalyFlags.find(
		(f) => f.type === "potential-duplicate" && !f.dismissed,
	);
	if (!dupFlag) return;

	// Dismiss on this transaction
	await dismissAnomaly(transactionId, "potential-duplicate");

	// Also dismiss on the linked transaction
	if (dupFlag.linkedTransactionId) {
		const linkedTx = await transactionsApi.get(dupFlag.linkedTransactionId);
		if (linkedTx?.anomalyFlags) {
			// Only dismiss the specific flag pointing back to this transaction
			const updatedFlags = linkedTx.anomalyFlags.map((f) =>
				f.type === "potential-duplicate" &&
				!f.dismissed &&
				f.linkedTransactionId === transactionId
					? { ...f, dismissed: true, dismissedAt: new Date().toISOString() }
					: f,
			);
			await transactionsApi.update(dupFlag.linkedTransactionId, {
				anomalyFlags: updatedFlags,
			});
		}
	}
};

export const undoDismissDuplicateAnomaly = async (
	transactionId: number,
	linkedTransactionId: number,
): Promise<void> => {
	// Restore on this transaction
	await undoDismissAnomaly(transactionId, "potential-duplicate");

	// Restore on linked transaction - only the flag pointing back to this tx
	const linkedTx = await transactionsApi.get(linkedTransactionId);
	if (linkedTx?.anomalyFlags) {
		const updatedFlags = linkedTx.anomalyFlags.map((f) =>
			f.type === "potential-duplicate" &&
			f.dismissed &&
			f.linkedTransactionId === transactionId
				? { ...f, dismissed: false, dismissedAt: undefined }
				: f,
		);
		await transactionsApi.update(linkedTransactionId, {
			anomalyFlags: updatedFlags,
		});
	}
};

export const confirmDuplicate = async (
	transactionId: number,
	action: "exclude" | "keep",
): Promise<void> => {
	if (action === "keep") {
		await dismissDuplicateAnomaly(transactionId);
		return;
	}

	// action === 'exclude'
	const tx = await transactionsApi.get(transactionId);
	if (!tx) return;

	const dupFlag = tx.anomalyFlags?.find(
		(f) => f.type === "potential-duplicate" && !f.dismissed,
	);

	const linkedId = dupFlag?.linkedTransactionId;

	// Mark transaction as excluded
	let note = "Excluded as duplicate";
	if (linkedId) {
		const linkedTx = await transactionsApi.get(linkedId);
		note = `Excluded as duplicate of transaction on ${formatDate(linkedTx?.date ?? new Date())}`;
	}

	await transactionsApi.update(transactionId, {
		isDuplicateExcluded: true,
		duplicateNote: note,
	});

	// Dismiss flags on both sides
	await dismissDuplicateAnomaly(transactionId);
};

export const undoConfirmDuplicate = async (
	transactionId: number,
	linkedTransactionId?: number,
): Promise<void> => {
	// Remove exclusion
	await transactionsApi.update(transactionId, {
		isDuplicateExcluded: undefined,
		duplicateNote: undefined,
	});

	// Restore flags on both sides
	if (linkedTransactionId) {
		await undoDismissDuplicateAnomaly(transactionId, linkedTransactionId);
	}
};
