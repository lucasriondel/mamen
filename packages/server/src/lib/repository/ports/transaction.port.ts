import type { Transaction } from "@mamen/shared";
import type { BaseRepository } from "./base.port";

export type TransactionRepository = BaseRepository<Transaction> & {
	getByAccountId: (accountId: number) => Promise<Transaction[]>;
	getByAccountIdAndMonth: (
		accountId: number,
		importMonth: string,
	) => Promise<Transaction[]>;
	countByAccountIdAndMonth: (
		accountId: number,
		importMonth: string,
	) => Promise<number>;
	deleteByAccountIdAndMonth: (
		accountId: number,
		importMonth: string,
	) => Promise<void>;
	getByMerchantId: (merchantId: number) => Promise<Transaction[]>;
	getByCategoryId: (categoryId: number) => Promise<Transaction[]>;
	getByDateRange: (start: Date, end: Date) => Promise<Transaction[]>;
	getByImportBatchId: (importBatchId: string) => Promise<Transaction[]>;
	countByImportBatchId: (importBatchId: string) => Promise<number>;
	deleteByImportBatchId: (importBatchId: string) => Promise<void>;
	getByLinkedRefundId: (purchaseId: number) => Promise<Transaction[]>;
	getAllOrderedByDate: (direction?: "asc" | "desc") => Promise<Transaction[]>;
	bulkAddReturningIds: (
		records: Omit<Transaction, "id">[],
	) => Promise<number[]>;
	filterByPredicate: (
		predicate: (tx: Transaction) => boolean,
	) => Promise<Transaction[]>;
	filterIdsByPredicate: (
		predicate: (tx: Transaction) => boolean,
	) => Promise<number[]>;
};
