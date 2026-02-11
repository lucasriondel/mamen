// In-memory mock database for tests.
// Provides a Dexie-like API so test files can seed/query data using the
// same db.TABLE.method() calls they always used, while the source code
// (which now calls API client functions) is mocked to use this same store.

type WhereClause<T> = {
	equals: (value: unknown) => {
		first: () => Promise<T | undefined>;
		toArray: () => Promise<T[]>;
		count: () => Promise<number>;
		delete: () => Promise<number>;
	};
};

class Table<T extends { id?: number }> {
	private records: Map<number, T> = new Map();
	private nextId = 1;

	async add(record: Omit<T, "id"> & { id?: number }): Promise<number> {
		const id = record.id ?? this.nextId++;
		if (id >= this.nextId) this.nextId = id + 1;
		const entry = { ...record, id } as T;
		this.records.set(id, entry);
		return id;
	}

	async bulkAdd(
		records: Array<Omit<T, "id"> & { id?: number }>,
	): Promise<number[]> {
		const ids: number[] = [];
		for (const record of records) {
			ids.push(await this.add(record));
		}
		return ids;
	}

	async get(id: number): Promise<T | undefined> {
		return this.records.get(id) ? { ...this.records.get(id)! } : undefined;
	}

	async bulkGet(ids: number[]): Promise<(T | undefined)[]> {
		return ids.map((id) => {
			const r = this.records.get(id);
			return r ? { ...r } : undefined;
		});
	}

	async toArray(): Promise<T[]> {
		return [...this.records.values()].map((r) => ({ ...r }));
	}

	async update(id: number, changes: Partial<T>): Promise<void> {
		const existing = this.records.get(id);
		if (existing) {
			this.records.set(id, { ...existing, ...changes });
		}
	}

	async put(record: T & { id?: number }): Promise<number> {
		if (record.id !== undefined) {
			const existing = this.records.get(record.id);
			if (existing) {
				this.records.set(record.id, { ...record });
				return record.id;
			}
		}
		return this.add(record);
	}

	async bulkPut(records: T[]): Promise<void> {
		for (const record of records) {
			await this.put(record);
		}
	}

	async delete(id: number): Promise<void> {
		this.records.delete(id);
	}

	async bulkDelete(ids: number[]): Promise<void> {
		for (const id of ids) {
			this.records.delete(id);
		}
	}

	async clear(): Promise<void> {
		this.records.clear();
		this.nextId = 1;
	}

	async count(): Promise<number> {
		return this.records.size;
	}

	where(field: string): WhereClause<T> {
		return {
			equals: (value: unknown) => ({
				first: async () => {
					for (const record of this.records.values()) {
						if ((record as Record<string, unknown>)[field] === value) {
							return { ...record };
						}
					}
					return undefined;
				},
				toArray: async () => {
					return [...this.records.values()]
						.filter((r) => (r as Record<string, unknown>)[field] === value)
						.map((r) => ({ ...r }));
				},
				count: async () => {
					return [...this.records.values()].filter(
						(r) => (r as Record<string, unknown>)[field] === value,
					).length;
				},
				delete: async () => {
					let deleted = 0;
					for (const [id, record] of this.records.entries()) {
						if ((record as Record<string, unknown>)[field] === value) {
							this.records.delete(id);
							deleted++;
						}
					}
					return deleted;
				},
			}),
		};
	}

	filter(predicate: (record: T) => boolean) {
		return {
			first: async () => {
				for (const record of this.records.values()) {
					if (predicate(record)) return { ...record };
				}
				return undefined;
			},
			toArray: async () => {
				return [...this.records.values()]
					.filter(predicate)
					.map((r) => ({ ...r }));
			},
			count: async () => {
				return [...this.records.values()].filter(predicate).length;
			},
		};
	}

	// Expose raw store for API mocks
	_getAll(): T[] {
		return [...this.records.values()].map((r) => ({ ...r }));
	}

	_getStore(): Map<number, T> {
		return this.records;
	}
}

import type {
	Account,
	AppSettings,
	Category,
	Merchant,
	Rule,
	Setting,
	Subscription,
	Transaction,
} from "@mamen/shared";

export const db = {
	accounts: new Table<Account>(),
	transactions: new Table<Transaction>(),
	merchants: new Table<Merchant>(),
	rules: new Table<Rule>(),
	settings: new Table<Setting>(),
	appSettings: new Table<AppSettings>(),
	categories: new Table<Category>(),
	subscriptions: new Table<Subscription>(),
};
