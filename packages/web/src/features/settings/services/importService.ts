import {
	ApiError,
	accountsApi,
	appSettingsApi,
	categoriesApi,
	databaseApi,
	merchantsApi,
	rulesApi,
	settingsApi,
	subscriptionsApi,
	transactionsApi,
} from "@/lib/api";
import { APP_VERSION } from "@/lib/constants";
import { exportDataSchema } from "../schemas/import.schema";
import type { ExportData } from "../types/export.types";
import type { ImportPreview, ImportResult } from "../types/import.types";
import { compareVersions } from "./versionCompare";

const ZERO_COUNTS = {
	accounts: 0,
	transactions: 0,
	merchants: 0,
	rules: 0,
	categories: 0,
	subscriptions: 0,
	settings: 0,
	appSettings: 0,
};

const formatZodErrors = (error: {
	issues: Array<{ path: Array<string | number>; message: string }>;
}): string[] => {
	return error.issues.map((issue) => {
		const path = issue.path.join(".");
		return path ? `${path}: ${issue.message}` : issue.message;
	});
};

export const parseBackupFile = async (file: File): Promise<ImportPreview> => {
	let text: string;
	try {
		text = await file.text();
	} catch {
		return {
			metadata: null,
			recordCounts: { ...ZERO_COUNTS },
			isNewerVersion: false,
			isValidFormat: false,
			validationErrors: ["Could not read file"],
		};
	}

	if (!text.trim()) {
		return {
			metadata: null,
			recordCounts: { ...ZERO_COUNTS },
			isNewerVersion: false,
			isValidFormat: false,
			validationErrors: ["File is empty"],
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return {
			metadata: null,
			recordCounts: { ...ZERO_COUNTS },
			isNewerVersion: false,
			isValidFormat: false,
			validationErrors: ["File is not valid JSON"],
		};
	}

	const result = exportDataSchema.safeParse(parsed);
	if (!result.success) {
		return {
			metadata: null,
			recordCounts: { ...ZERO_COUNTS },
			isNewerVersion: false,
			isValidFormat: false,
			validationErrors: formatZodErrors(result.error),
		};
	}

	const isNewerVersion =
		compareVersions(result.data.metadata.appVersion, APP_VERSION) > 0;

	return {
		metadata: result.data.metadata,
		recordCounts: result.data.metadata.recordCounts,
		isNewerVersion,
		isValidFormat: true,
		validationErrors: [],
	};
};

export const parseBackupData = (text: string): ExportData | null => {
	const result = exportDataSchema.safeParse(JSON.parse(text));
	if (!result.success) return null;
	return result.data as ExportData;
};

export const importDataReplace = async (
	data: ExportData,
): Promise<ImportResult> => {
	const result: ImportResult = {
		success: true,
		mode: "replace",
		added: { ...ZERO_COUNTS },
		skipped: { transactions: 0 },
		errors: [],
	};

	try {
		await databaseApi.reset();

		await databaseApi.import({
			accounts: data.accounts,
			transactions: data.transactions,
			merchants: data.merchants,
			rules: data.rules,
			categories: data.categories,
			subscriptions: data.subscriptions,
			settings: data.settings,
			appSettings:
				data.appSettings.length > 0 ? data.appSettings[0] : undefined,
		});

		result.added.accounts = data.accounts.length;
		result.added.transactions = data.transactions.length;
		result.added.merchants = data.merchants.length;
		result.added.rules = data.rules.length;
		result.added.categories = data.categories.length;
		result.added.subscriptions = data.subscriptions.length;
		result.added.settings = data.settings.length;
		result.added.appSettings = data.appSettings.length;
	} catch (error) {
		result.success = false;
		result.errors.push(
			error instanceof Error
				? error.message
				: "Unknown database error during replace import",
		);
	}

	return result;
};

export const importDataMerge = async (
	data: ExportData,
): Promise<ImportResult> => {
	const result: ImportResult = {
		success: true,
		mode: "merge",
		added: { ...ZERO_COUNTS },
		skipped: { transactions: 0 },
		errors: [],
	};

	try {
		// Build ID mappings for foreign key remapping
		const accountIdMap = new Map<number, number>();
		const merchantIdMap = new Map<number, number>();
		const transactionIdMap = new Map<number, number>();

		// 1. Merge accounts (match by name)
		for (const account of data.accounts) {
			let existing: { id?: number } | null = null;
			try {
				existing = await accountsApi.getByName(account.name);
			} catch (e) {
				if (!(e instanceof ApiError && e.status === 404)) throw e;
			}
			if (existing) {
				accountIdMap.set(account.id, existing.id!);
			} else {
				const { id: oldId, ...accountWithoutId } = account;
				const newId = await accountsApi.create(accountWithoutId);
				accountIdMap.set(oldId, newId);
				result.added.accounts++;
			}
		}

		// 2. Merge merchants (match by name)
		for (const merchant of data.merchants) {
			let existing: { id?: number } | null = null;
			try {
				existing = await merchantsApi.getByName(merchant.name);
			} catch (e) {
				if (!(e instanceof ApiError && e.status === 404)) throw e;
			}
			if (existing) {
				merchantIdMap.set(merchant.id, existing.id!);
			} else {
				const { id: oldId, ...merchantWithoutId } = merchant;
				const newId = await merchantsApi.create(merchantWithoutId);
				merchantIdMap.set(oldId, newId);
				result.added.merchants++;
			}
		}

		// 3. Merge categories (match by slug)
		for (const category of data.categories) {
			let existing: { id?: number } | null = null;
			try {
				existing = await categoriesApi.getBySlug(category.slug);
			} catch (e) {
				if (!(e instanceof ApiError && e.status === 404)) throw e;
			}
			if (!existing) {
				const { id: _oldId, ...categoryWithoutId } = category;
				await categoriesApi.create(categoryWithoutId);
				result.added.categories++;
			}
		}

		// 4. Merge rules (match by merchantId + pattern, remap merchantId)
		for (const rule of data.rules) {
			const remappedMerchantId =
				merchantIdMap.get(rule.merchantId) ?? rule.merchantId;
			let existing: { id?: number } | null = null;
			try {
				existing = await rulesApi.getByMerchantIdAndPattern(
					remappedMerchantId,
					rule.pattern,
				);
			} catch (e) {
				if (!(e instanceof ApiError && e.status === 404)) throw e;
			}
			if (!existing) {
				const { id: _oldId, ...ruleWithoutId } = rule;
				await rulesApi.create({
					...ruleWithoutId,
					merchantId: remappedMerchantId,
				});
				result.added.rules++;
			}
		}

		// 5. Merge transactions (dedup by accountId + date + amount + rawMerchantString, remap foreign keys)
		for (const txn of data.transactions) {
			const remappedAccountId =
				accountIdMap.get(txn.accountId) ?? txn.accountId;
			const remappedMerchantId = txn.merchantId
				? (merchantIdMap.get(txn.merchantId) ?? txn.merchantId)
				: txn.merchantId;

			// Normalize date for comparison -- imported dates are ISO strings, DB dates may be Date objects
			const normalizeDate = (d: unknown): string =>
				d instanceof Date ? d.toISOString() : String(d);
			const txnDateStr = normalizeDate(txn.date);

			// Check for existing transaction with same key fields
			const existingTxns = await transactionsApi.getAll({
				accountId: remappedAccountId,
			});
			const existing = existingTxns.find((t) => {
				return (
					normalizeDate(t.date) === txnDateStr &&
					t.amount === txn.amount &&
					t.rawMerchantString === txn.rawMerchantString
				);
			});

			if (!existing) {
				const { id: oldId, ...txnWithoutId } = txn;
				const newId = await transactionsApi.create({
					...txnWithoutId,
					accountId: remappedAccountId,
					merchantId: remappedMerchantId,
				});
				transactionIdMap.set(oldId, newId);
				result.added.transactions++;
			} else {
				transactionIdMap.set(txn.id, existing.id!);
				result.skipped.transactions++;
			}
		}

		// 6. Remap linkedRefundId for transactions that have refund links
		for (const txn of data.transactions) {
			if (txn.linkedRefundId != null) {
				const newTxnId = transactionIdMap.get(txn.id);
				const newLinkedId = transactionIdMap.get(txn.linkedRefundId);
				if (newTxnId && newLinkedId) {
					await transactionsApi.update(newTxnId, {
						linkedRefundId: newLinkedId,
					});
				}
			}
		}

		// 7. Merge subscriptions (match by merchantId)
		for (const sub of data.subscriptions) {
			const remappedMerchantId =
				merchantIdMap.get(sub.merchantId) ?? sub.merchantId;
			let existing: { id?: number } | null = null;
			try {
				existing =
					await subscriptionsApi.getFirstByMerchant(remappedMerchantId);
			} catch (e) {
				if (!(e instanceof ApiError && e.status === 404)) throw e;
			}
			if (!existing) {
				const { id: _oldId, ...subWithoutId } = sub;
				await subscriptionsApi.create({
					...subWithoutId,
					merchantId: remappedMerchantId,
				});
				result.added.subscriptions++;
			}
		}

		// 8. Merge settings (overwrite with imported)
		for (const setting of data.settings) {
			await settingsApi.putByKey(setting);
			result.added.settings++;
		}

		// 9. Merge appSettings (overwrite with imported)
		for (const appSetting of data.appSettings) {
			await appSettingsApi.put(appSetting);
			result.added.appSettings++;
		}
	} catch (error) {
		result.success = false;
		result.errors.push(
			error instanceof Error
				? error.message
				: "Unknown database error during merge import",
		);
	}

	return result;
};
