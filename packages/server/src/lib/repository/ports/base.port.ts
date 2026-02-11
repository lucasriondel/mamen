export type BaseRepository<T extends { id?: number }> = {
	get: (id: number) => Promise<T | undefined>;
	getAll: () => Promise<T[]>;
	add: (record: Omit<T, "id">) => Promise<number>;
	bulkAdd: (records: Omit<T, "id">[]) => Promise<number[]>;
	update: (id: number, changes: Partial<T>) => Promise<void>;
	bulkPut: (records: T[]) => Promise<void>;
	delete: (id: number) => Promise<void>;
	bulkDelete: (ids: number[]) => Promise<void>;
	bulkGet: (ids: number[]) => Promise<(T | undefined)[]>;
	count: () => Promise<number>;
	clear: () => Promise<void>;
};
