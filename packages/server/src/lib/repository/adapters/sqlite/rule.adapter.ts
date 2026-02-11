import type { Database } from "bun:sqlite";
import type { Rule } from "@mamen/shared";
import type { RuleRepository } from "../../ports";

type RuleRow = {
	id: number;
	merchantId: number;
	pattern: string;
	categoryOverride: number | null;
	matchCount: number;
	createdAt: string;
};

const toEntity = (row: RuleRow): Rule => ({
	id: row.id,
	merchantId: row.merchantId,
	pattern: row.pattern,
	categoryOverride: row.categoryOverride ?? undefined,
	matchCount: row.matchCount,
	createdAt: new Date(row.createdAt),
});

export const createRuleAdapter = (db: Database): RuleRepository => ({
	get: async (id) => {
		const row = db
			.query<RuleRow, [number]>("SELECT * FROM rules WHERE id = ?")
			.get(id);
		return row ? toEntity(row) : undefined;
	},

	getAll: async () => {
		return db.query<RuleRow, []>("SELECT * FROM rules").all().map(toEntity);
	},

	add: async (record) => {
		const now = new Date().toISOString();
		const result = db
			.query<{ id: number }, [number, string, number | null, number, string]>(
				"INSERT INTO rules (merchantId, pattern, categoryOverride, matchCount, createdAt) VALUES (?, ?, ?, ?, ?) RETURNING id",
			)
			.get(
				record.merchantId,
				record.pattern,
				record.categoryOverride ?? null,
				(record as Rule).matchCount ?? 0,
				(record as Rule).createdAt?.toISOString() ?? now,
			);
		return result?.id;
	},

	bulkAdd: async (records) => {
		const stmt = db.query<
			{ id: number },
			[number, string, number | null, number, string]
		>(
			"INSERT INTO rules (merchantId, pattern, categoryOverride, matchCount, createdAt) VALUES (?, ?, ?, ?, ?) RETURNING id",
		);
		const now = new Date().toISOString();
		return records.map((record) => {
			return stmt.get(
				record.merchantId,
				record.pattern,
				record.categoryOverride ?? null,
				(record as Rule).matchCount ?? 0,
				(record as Rule).createdAt?.toISOString() ?? now,
			)?.id;
		});
	},

	update: async (id, changes) => {
		const fields: string[] = [];
		const values: (string | number | null)[] = [];
		if (changes.merchantId !== undefined) {
			fields.push("merchantId = ?");
			values.push(changes.merchantId);
		}
		if (changes.pattern !== undefined) {
			fields.push("pattern = ?");
			values.push(changes.pattern);
		}
		if (changes.categoryOverride !== undefined) {
			fields.push("categoryOverride = ?");
			values.push(changes.categoryOverride ?? null);
		}
		if (changes.matchCount !== undefined) {
			fields.push("matchCount = ?");
			values.push(changes.matchCount);
		}
		if (changes.createdAt !== undefined) {
			fields.push("createdAt = ?");
			values.push(changes.createdAt.toISOString());
		}
		if (fields.length === 0) return;
		values.push(id);
		db.run(`UPDATE rules SET ${fields.join(", ")} WHERE id = ?`, values);
	},

	bulkPut: async (records) => {
		const stmt = db.prepare(
			"INSERT OR REPLACE INTO rules (id, merchantId, pattern, categoryOverride, matchCount, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
		);
		const tx = db.transaction(() => {
			for (const record of records) {
				stmt.run(
					record.id!,
					record.merchantId,
					record.pattern,
					record.categoryOverride ?? null,
					record.matchCount,
					record.createdAt.toISOString(),
				);
			}
		});
		tx();
	},

	delete: async (id) => {
		db.run("DELETE FROM rules WHERE id = ?", [id]);
	},

	bulkDelete: async (ids) => {
		if (ids.length === 0) return;
		const placeholders = ids.map(() => "?").join(",");
		db.run(`DELETE FROM rules WHERE id IN (${placeholders})`, ids);
	},

	bulkGet: async (ids) => {
		if (ids.length === 0) return [];
		const placeholders = ids.map(() => "?").join(",");
		const rows = db
			.query<RuleRow, number[]>(
				`SELECT * FROM rules WHERE id IN (${placeholders})`,
			)
			.all(...ids);
		const map = new Map(rows.map((r) => [r.id, toEntity(r)]));
		return ids.map((id) => map.get(id));
	},

	count: async () => {
		return db
			.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM rules")
			.get()?.cnt;
	},

	clear: async () => {
		db.run("DELETE FROM rules");
	},

	getByMerchantId: async (merchantId) => {
		return db
			.query<RuleRow, [number]>("SELECT * FROM rules WHERE merchantId = ?")
			.all(merchantId)
			.map(toEntity);
	},

	countByMerchantId: async (merchantId) => {
		return db
			.query<{ cnt: number }, [number]>(
				"SELECT COUNT(*) as cnt FROM rules WHERE merchantId = ?",
			)
			.get(merchantId)?.cnt;
	},

	getByMerchantIdAndPattern: async (merchantId, pattern) => {
		const row = db
			.query<RuleRow, [number, string]>(
				"SELECT * FROM rules WHERE merchantId = ? AND pattern = ?",
			)
			.get(merchantId, pattern);
		return row ? toEntity(row) : undefined;
	},
});
