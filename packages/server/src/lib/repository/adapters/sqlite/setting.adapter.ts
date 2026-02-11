import type { Database } from "bun:sqlite";
import type { Setting, SettingKey } from "@mamen/shared";
import type { SettingRepository } from "../../ports";

type SettingRow = {
	id: number;
	key: string;
	value: string;
};

const toEntity = (row: SettingRow): Setting => ({
	id: row.id,
	key: row.key as SettingKey,
	value: row.value,
});

export const createSettingAdapter = (db: Database): SettingRepository => ({
	get: async (id) => {
		const row = db
			.query<SettingRow, [number]>("SELECT * FROM settings WHERE id = ?")
			.get(id);
		return row ? toEntity(row) : undefined;
	},

	getAll: async () => {
		return db
			.query<SettingRow, []>("SELECT * FROM settings")
			.all()
			.map(toEntity);
	},

	add: async (record) => {
		const result = db
			.query<{ id: number }, [string, string]>(
				"INSERT INTO settings (key, value) VALUES (?, ?) RETURNING id",
			)
			.get(record.key, record.value);
		return result?.id;
	},

	bulkAdd: async (records) => {
		const stmt = db.query<{ id: number }, [string, string]>(
			"INSERT INTO settings (key, value) VALUES (?, ?) RETURNING id",
		);
		return records.map((record) => stmt.get(record.key, record.value)?.id);
	},

	update: async (id, changes) => {
		const fields: string[] = [];
		const values: (string | number | null)[] = [];
		if (changes.key !== undefined) {
			fields.push("key = ?");
			values.push(changes.key);
		}
		if (changes.value !== undefined) {
			fields.push("value = ?");
			values.push(changes.value);
		}
		if (fields.length === 0) return;
		values.push(id);
		db.run(`UPDATE settings SET ${fields.join(", ")} WHERE id = ?`, values);
	},

	bulkPut: async (records) => {
		const stmt = db.prepare(
			"INSERT OR REPLACE INTO settings (id, key, value) VALUES (?, ?, ?)",
		);
		const tx = db.transaction(() => {
			for (const record of records) {
				stmt.run(record.id!, record.key, record.value);
			}
		});
		tx();
	},

	delete: async (id) => {
		db.run("DELETE FROM settings WHERE id = ?", [id]);
	},

	bulkDelete: async (ids) => {
		if (ids.length === 0) return;
		const placeholders = ids.map(() => "?").join(",");
		db.run(`DELETE FROM settings WHERE id IN (${placeholders})`, ids);
	},

	bulkGet: async (ids) => {
		if (ids.length === 0) return [];
		const placeholders = ids.map(() => "?").join(",");
		const rows = db
			.query<SettingRow, number[]>(
				`SELECT * FROM settings WHERE id IN (${placeholders})`,
			)
			.all(...ids);
		const map = new Map(rows.map((r) => [r.id, toEntity(r)]));
		return ids.map((id) => map.get(id));
	},

	count: async () => {
		return db
			.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM settings")
			.get()?.cnt;
	},

	clear: async () => {
		db.run("DELETE FROM settings");
	},

	getByKey: async (key) => {
		const row = db
			.query<SettingRow, [string]>("SELECT * FROM settings WHERE key = ?")
			.get(key);
		return row ? toEntity(row) : undefined;
	},

	putByKey: async (setting) => {
		db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
			setting.key,
			setting.value,
		]);
	},
});
