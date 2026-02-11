import type { Database } from "bun:sqlite";
import type { Merchant } from "@mamen/shared";
import type { MerchantRepository } from "../../ports";

type MerchantRow = {
	id: number;
	name: string;
	imageUrl: string | null;
	defaultCategoryId: number | null;
	createdAt: string;
	firstSeen: string;
};

const toEntity = (row: MerchantRow): Merchant => ({
	id: row.id,
	name: row.name,
	imageUrl: row.imageUrl ?? undefined,
	defaultCategoryId: row.defaultCategoryId ?? undefined,
	createdAt: new Date(row.createdAt),
	firstSeen: new Date(row.firstSeen),
});

export const createMerchantAdapter = (db: Database): MerchantRepository => ({
	get: async (id) => {
		const row = db
			.query<MerchantRow, [number]>("SELECT * FROM merchants WHERE id = ?")
			.get(id);
		return row ? toEntity(row) : undefined;
	},

	getAll: async () => {
		return db
			.query<MerchantRow, []>("SELECT * FROM merchants")
			.all()
			.map(toEntity);
	},

	add: async (record) => {
		const now = new Date().toISOString();
		const result = db
			.query<
				{ id: number },
				[string, string | null, number | null, string, string]
			>(
				"INSERT INTO merchants (name, imageUrl, defaultCategoryId, createdAt, firstSeen) VALUES (?, ?, ?, ?, ?) RETURNING id",
			)
			.get(
				record.name,
				(record as Merchant).imageUrl ?? null,
				record.defaultCategoryId ?? null,
				(record as Merchant).createdAt?.toISOString() ?? now,
				(record as Merchant).firstSeen?.toISOString() ?? now,
			);
		return result!.id;
	},

	bulkAdd: async (records) => {
		const stmt = db.query<
			{ id: number },
			[string, string | null, number | null, string, string]
		>(
			"INSERT INTO merchants (name, imageUrl, defaultCategoryId, createdAt, firstSeen) VALUES (?, ?, ?, ?, ?) RETURNING id",
		);
		const now = new Date().toISOString();
		return records.map((record) => {
			return stmt.get(
				record.name,
				(record as Merchant).imageUrl ?? null,
				record.defaultCategoryId ?? null,
				(record as Merchant).createdAt?.toISOString() ?? now,
				(record as Merchant).firstSeen?.toISOString() ?? now,
			)!.id;
		});
	},

	update: async (id, changes) => {
		const fields: string[] = [];
		const values: (string | number | null)[] = [];
		if (changes.name !== undefined) {
			fields.push("name = ?");
			values.push(changes.name);
		}
		if (changes.imageUrl !== undefined) {
			fields.push("imageUrl = ?");
			values.push(changes.imageUrl ?? null);
		}
		if (changes.defaultCategoryId !== undefined) {
			fields.push("defaultCategoryId = ?");
			values.push(changes.defaultCategoryId ?? null);
		}
		if (changes.createdAt !== undefined) {
			fields.push("createdAt = ?");
			values.push(changes.createdAt.toISOString());
		}
		if (changes.firstSeen !== undefined) {
			fields.push("firstSeen = ?");
			values.push(changes.firstSeen.toISOString());
		}
		if (fields.length === 0) return;
		values.push(id);
		db.run(`UPDATE merchants SET ${fields.join(", ")} WHERE id = ?`, values);
	},

	bulkPut: async (records) => {
		const stmt = db.prepare(
			"INSERT OR REPLACE INTO merchants (id, name, imageUrl, defaultCategoryId, createdAt, firstSeen) VALUES (?, ?, ?, ?, ?, ?)",
		);
		const tx = db.transaction(() => {
			for (const record of records) {
				stmt.run(
					record.id!,
					record.name,
					record.imageUrl ?? null,
					record.defaultCategoryId ?? null,
					record.createdAt.toISOString(),
					record.firstSeen.toISOString(),
				);
			}
		});
		tx();
	},

	delete: async (id) => {
		db.run("DELETE FROM merchants WHERE id = ?", [id]);
	},

	bulkDelete: async (ids) => {
		if (ids.length === 0) return;
		const placeholders = ids.map(() => "?").join(",");
		db.run(`DELETE FROM merchants WHERE id IN (${placeholders})`, ids);
	},

	bulkGet: async (ids) => {
		if (ids.length === 0) return [];
		const placeholders = ids.map(() => "?").join(",");
		const rows = db
			.query<MerchantRow, number[]>(
				`SELECT * FROM merchants WHERE id IN (${placeholders})`,
			)
			.all(...ids);
		const map = new Map(rows.map((r) => [r.id, toEntity(r)]));
		return ids.map((id) => map.get(id));
	},

	count: async () => {
		return db
			.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM merchants")
			.get()!.cnt;
	},

	clear: async () => {
		db.run("DELETE FROM merchants");
	},

	getByName: async (name) => {
		const row = db
			.query<MerchantRow, [string]>("SELECT * FROM merchants WHERE name = ?")
			.get(name);
		return row ? toEntity(row) : undefined;
	},

	getByNameCaseInsensitive: async (name) => {
		const row = db
			.query<MerchantRow, [string]>(
				"SELECT * FROM merchants WHERE name COLLATE NOCASE = ?",
			)
			.get(name);
		return row ? toEntity(row) : undefined;
	},

	getAllOrderedByName: async () => {
		return db
			.query<MerchantRow, []>(
				"SELECT * FROM merchants ORDER BY name COLLATE NOCASE ASC",
			)
			.all()
			.map(toEntity);
	},
});
