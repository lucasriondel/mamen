import type { Database } from "bun:sqlite";
import type { Transaction } from "@mamen/shared";
import type { TransactionRepository } from "../../ports";

type TransactionRow = {
	id: number;
	accountId: number;
	date: string;
	amount: number;
	rawMerchantString: string;
	merchantId: number | null;
	categoryId: number | null;
	subcategoryId: number | null;
	categoryOverride: string | null;
	manualCategory: number;
	isRefund: number;
	linkedRefundId: number | null;
	anomalyFlags: string | null;
	isDuplicateExcluded: number;
	duplicateNote: string | null;
	importedAt: string;
	importMonth: string;
	importBatchId: string | null;
};

const toEntity = (row: TransactionRow): Transaction => ({
	id: row.id,
	accountId: row.accountId,
	date: new Date(row.date),
	amount: row.amount,
	rawMerchantString: row.rawMerchantString,
	merchantId: row.merchantId ?? undefined,
	categoryId: row.categoryId ?? undefined,
	subcategoryId: row.subcategoryId ?? undefined,
	categoryOverride: row.categoryOverride ?? undefined,
	manualCategory: row.manualCategory === 1 ? true : undefined,
	isRefund: row.isRefund === 1 ? true : undefined,
	linkedRefundId: row.linkedRefundId ?? undefined,
	anomalyFlags: row.anomalyFlags ? JSON.parse(row.anomalyFlags) : undefined,
	isDuplicateExcluded: row.isDuplicateExcluded === 1 ? true : undefined,
	duplicateNote: row.duplicateNote ?? undefined,
	importedAt: new Date(row.importedAt),
	importMonth: row.importMonth,
	importBatchId: row.importBatchId ?? undefined,
});

const toParams = (
	record: Omit<Transaction, "id">,
): [
	number,
	string,
	number,
	string,
	number | null,
	number | null,
	number | null,
	string | null,
	number,
	number,
	number | null,
	string | null,
	number,
	string | null,
	string,
	string,
	string | null,
] => [
	record.accountId,
	record.date.toISOString(),
	record.amount,
	record.rawMerchantString,
	record.merchantId ?? null,
	record.categoryId ?? null,
	record.subcategoryId ?? null,
	record.categoryOverride ?? null,
	record.manualCategory ? 1 : 0,
	record.isRefund ? 1 : 0,
	record.linkedRefundId ?? null,
	record.anomalyFlags ? JSON.stringify(record.anomalyFlags) : null,
	record.isDuplicateExcluded ? 1 : 0,
	record.duplicateNote ?? null,
	record.importedAt.toISOString(),
	record.importMonth,
	record.importBatchId ?? null,
];

const INSERT_SQL = `INSERT INTO transactions (
  accountId, date, amount, rawMerchantString,
  merchantId, categoryId, subcategoryId, categoryOverride,
  manualCategory, isRefund, linkedRefundId, anomalyFlags,
  isDuplicateExcluded, duplicateNote, importedAt, importMonth, importBatchId
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_RETURNING_SQL = `${INSERT_SQL} RETURNING id`;

export const createTransactionAdapter = (
	db: Database,
): TransactionRepository => ({
	get: async (id) => {
		const row = db
			.query<TransactionRow, [number]>(
				"SELECT * FROM transactions WHERE id = ?",
			)
			.get(id);
		return row ? toEntity(row) : undefined;
	},

	getAll: async () => {
		return db
			.query<TransactionRow, []>("SELECT * FROM transactions")
			.all()
			.map(toEntity);
	},

	add: async (record) => {
		const result = db
			.query<{ id: number }, (string | number | null)[]>(INSERT_RETURNING_SQL)
			.get(...toParams(record as Transaction));
		return result!.id;
	},

	bulkAdd: async (records) => {
		const stmt = db.query<{ id: number }, (string | number | null)[]>(
			INSERT_RETURNING_SQL,
		);
		const tx = db.transaction(() => {
			return records.map(
				(record) => stmt.get(...toParams(record as Transaction))!.id,
			);
		});
		return tx();
	},

	update: async (id, changes) => {
		const fields: string[] = [];
		const values: (string | number | null)[] = [];
		if (changes.accountId !== undefined) {
			fields.push("accountId = ?");
			values.push(changes.accountId);
		}
		if (changes.date !== undefined) {
			fields.push("date = ?");
			values.push(changes.date.toISOString());
		}
		if (changes.amount !== undefined) {
			fields.push("amount = ?");
			values.push(changes.amount);
		}
		if (changes.rawMerchantString !== undefined) {
			fields.push("rawMerchantString = ?");
			values.push(changes.rawMerchantString);
		}
		if (changes.merchantId !== undefined) {
			fields.push("merchantId = ?");
			values.push(changes.merchantId ?? null);
		}
		if (changes.categoryId !== undefined) {
			fields.push("categoryId = ?");
			values.push(changes.categoryId ?? null);
		}
		if (changes.subcategoryId !== undefined) {
			fields.push("subcategoryId = ?");
			values.push(changes.subcategoryId ?? null);
		}
		if (changes.categoryOverride !== undefined) {
			fields.push("categoryOverride = ?");
			values.push(changes.categoryOverride ?? null);
		}
		if (changes.manualCategory !== undefined) {
			fields.push("manualCategory = ?");
			values.push(changes.manualCategory ? 1 : 0);
		}
		if (changes.isRefund !== undefined) {
			fields.push("isRefund = ?");
			values.push(changes.isRefund ? 1 : 0);
		}
		if (changes.linkedRefundId !== undefined) {
			fields.push("linkedRefundId = ?");
			values.push(changes.linkedRefundId ?? null);
		}
		if (changes.anomalyFlags !== undefined) {
			fields.push("anomalyFlags = ?");
			values.push(
				changes.anomalyFlags ? JSON.stringify(changes.anomalyFlags) : null,
			);
		}
		if (changes.isDuplicateExcluded !== undefined) {
			fields.push("isDuplicateExcluded = ?");
			values.push(changes.isDuplicateExcluded ? 1 : 0);
		}
		if (changes.duplicateNote !== undefined) {
			fields.push("duplicateNote = ?");
			values.push(changes.duplicateNote ?? null);
		}
		if (changes.importedAt !== undefined) {
			fields.push("importedAt = ?");
			values.push(changes.importedAt.toISOString());
		}
		if (changes.importMonth !== undefined) {
			fields.push("importMonth = ?");
			values.push(changes.importMonth);
		}
		if (changes.importBatchId !== undefined) {
			fields.push("importBatchId = ?");
			values.push(changes.importBatchId ?? null);
		}
		if (fields.length === 0) return;
		values.push(id);
		db.run(`UPDATE transactions SET ${fields.join(", ")} WHERE id = ?`, values);
	},

	bulkPut: async (records) => {
		const stmt = db.prepare(
			`INSERT OR REPLACE INTO transactions (
        id, accountId, date, amount, rawMerchantString,
        merchantId, categoryId, subcategoryId, categoryOverride,
        manualCategory, isRefund, linkedRefundId, anomalyFlags,
        isDuplicateExcluded, duplicateNote, importedAt, importMonth, importBatchId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		const tx = db.transaction(() => {
			for (const record of records) {
				stmt.run(record.id!, ...toParams(record));
			}
		});
		tx();
	},

	delete: async (id) => {
		db.run("DELETE FROM transactions WHERE id = ?", [id]);
	},

	bulkDelete: async (ids) => {
		if (ids.length === 0) return;
		const placeholders = ids.map(() => "?").join(",");
		db.run(`DELETE FROM transactions WHERE id IN (${placeholders})`, ids);
	},

	bulkGet: async (ids) => {
		if (ids.length === 0) return [];
		const placeholders = ids.map(() => "?").join(",");
		const rows = db
			.query<TransactionRow, number[]>(
				`SELECT * FROM transactions WHERE id IN (${placeholders})`,
			)
			.all(...ids);
		const map = new Map(rows.map((r) => [r.id, toEntity(r)]));
		return ids.map((id) => map.get(id));
	},

	count: async () => {
		return db
			.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM transactions")
			.get()!.cnt;
	},

	clear: async () => {
		db.run("DELETE FROM transactions");
	},

	getByAccountId: async (accountId) => {
		return db
			.query<TransactionRow, [number]>(
				"SELECT * FROM transactions WHERE accountId = ?",
			)
			.all(accountId)
			.map(toEntity);
	},

	getByAccountIdAndMonth: async (accountId, importMonth) => {
		return db
			.query<TransactionRow, [number, string]>(
				"SELECT * FROM transactions WHERE accountId = ? AND importMonth = ?",
			)
			.all(accountId, importMonth)
			.map(toEntity);
	},

	countByAccountIdAndMonth: async (accountId, importMonth) => {
		return db
			.query<{ cnt: number }, [number, string]>(
				"SELECT COUNT(*) as cnt FROM transactions WHERE accountId = ? AND importMonth = ?",
			)
			.get(accountId, importMonth)!.cnt;
	},

	deleteByAccountIdAndMonth: async (accountId, importMonth) => {
		db.run("DELETE FROM transactions WHERE accountId = ? AND importMonth = ?", [
			accountId,
			importMonth,
		]);
	},

	getByMerchantId: async (merchantId) => {
		return db
			.query<TransactionRow, [number]>(
				"SELECT * FROM transactions WHERE merchantId = ?",
			)
			.all(merchantId)
			.map(toEntity);
	},

	getByCategoryId: async (categoryId) => {
		return db
			.query<TransactionRow, [number]>(
				"SELECT * FROM transactions WHERE categoryId = ?",
			)
			.all(categoryId)
			.map(toEntity);
	},

	getByDateRange: async (start, end) => {
		return db
			.query<TransactionRow, [string, string]>(
				"SELECT * FROM transactions WHERE date >= ? AND date <= ?",
			)
			.all(start.toISOString(), end.toISOString())
			.map(toEntity);
	},

	getByImportBatchId: async (importBatchId) => {
		return db
			.query<TransactionRow, [string]>(
				"SELECT * FROM transactions WHERE importBatchId = ?",
			)
			.all(importBatchId)
			.map(toEntity);
	},

	countByImportBatchId: async (importBatchId) => {
		return db
			.query<{ cnt: number }, [string]>(
				"SELECT COUNT(*) as cnt FROM transactions WHERE importBatchId = ?",
			)
			.get(importBatchId)!.cnt;
	},

	deleteByImportBatchId: async (importBatchId) => {
		db.run("DELETE FROM transactions WHERE importBatchId = ?", [importBatchId]);
	},

	getByLinkedRefundId: async (purchaseId) => {
		return db
			.query<TransactionRow, [number]>(
				"SELECT * FROM transactions WHERE linkedRefundId = ?",
			)
			.all(purchaseId)
			.map(toEntity);
	},

	getAllOrderedByDate: async (direction = "desc") => {
		const sql =
			direction === "asc"
				? "SELECT * FROM transactions ORDER BY date ASC"
				: "SELECT * FROM transactions ORDER BY date DESC";
		return db.query<TransactionRow, []>(sql).all().map(toEntity);
	},

	bulkAddReturningIds: async (records) => {
		const stmt = db.query<{ id: number }, (string | number | null)[]>(
			INSERT_RETURNING_SQL,
		);
		const tx = db.transaction(() => {
			return records.map(
				(record) => stmt.get(...toParams(record as Transaction))!.id,
			);
		});
		return tx();
	},

	filterByPredicate: async (predicate) => {
		const all = db
			.query<TransactionRow, []>("SELECT * FROM transactions")
			.all()
			.map(toEntity);
		return all.filter(predicate);
	},

	filterIdsByPredicate: async (predicate) => {
		const all = db
			.query<TransactionRow, []>("SELECT * FROM transactions")
			.all()
			.map(toEntity);
		return all.filter(predicate).map((tx) => tx.id!);
	},
});
