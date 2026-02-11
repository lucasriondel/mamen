import type { Database } from "bun:sqlite";
import type { Category } from "@mamen/shared";
import type { CategoryRepository } from "../../ports";

type CategoryRow = {
	id: number;
	name: string;
	slug: string;
	color: string;
	icon: string;
	parentId: number | null;
	sortOrder: number;
	createdAt: string;
};

const toEntity = (row: CategoryRow): Category => ({
	id: row.id,
	name: row.name,
	slug: row.slug,
	color: row.color,
	icon: row.icon,
	parentId: row.parentId,
	sortOrder: row.sortOrder,
	createdAt: new Date(row.createdAt),
});

export const createCategoryAdapter = (db: Database): CategoryRepository => ({
	get: async (id) => {
		const row = db
			.query<CategoryRow, [number]>("SELECT * FROM categories WHERE id = ?")
			.get(id);
		return row ? toEntity(row) : undefined;
	},

	getAll: async () => {
		return db
			.query<CategoryRow, []>("SELECT * FROM categories")
			.all()
			.map(toEntity);
	},

	add: async (record) => {
		const now = new Date().toISOString();
		const result = db
			.query<
				{ id: number },
				[string, string, string, string, number | null, number, string]
			>(
				"INSERT INTO categories (name, slug, color, icon, parentId, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
			)
			.get(
				record.name,
				record.slug,
				record.color,
				record.icon,
				record.parentId ?? null,
				record.sortOrder,
				(record as Category).createdAt?.toISOString() ?? now,
			);
		return result!.id;
	},

	bulkAdd: async (records) => {
		const stmt = db.query<
			{ id: number },
			[string, string, string, string, number | null, number, string]
		>(
			"INSERT INTO categories (name, slug, color, icon, parentId, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
		);
		const now = new Date().toISOString();
		return records.map((record) => {
			return stmt.get(
				record.name,
				record.slug,
				record.color,
				record.icon,
				record.parentId ?? null,
				record.sortOrder,
				(record as Category).createdAt?.toISOString() ?? now,
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
		if (changes.slug !== undefined) {
			fields.push("slug = ?");
			values.push(changes.slug);
		}
		if (changes.color !== undefined) {
			fields.push("color = ?");
			values.push(changes.color);
		}
		if (changes.icon !== undefined) {
			fields.push("icon = ?");
			values.push(changes.icon);
		}
		if (changes.parentId !== undefined) {
			fields.push("parentId = ?");
			values.push(changes.parentId);
		}
		if (changes.sortOrder !== undefined) {
			fields.push("sortOrder = ?");
			values.push(changes.sortOrder);
		}
		if (changes.createdAt !== undefined) {
			fields.push("createdAt = ?");
			values.push(changes.createdAt.toISOString());
		}
		if (fields.length === 0) return;
		values.push(id);
		db.run(`UPDATE categories SET ${fields.join(", ")} WHERE id = ?`, values);
	},

	bulkPut: async (records) => {
		const stmt = db.prepare(
			"INSERT OR REPLACE INTO categories (id, name, slug, color, icon, parentId, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		);
		const tx = db.transaction(() => {
			for (const record of records) {
				stmt.run(
					record.id!,
					record.name,
					record.slug,
					record.color,
					record.icon,
					record.parentId,
					record.sortOrder,
					record.createdAt.toISOString(),
				);
			}
		});
		tx();
	},

	delete: async (id) => {
		db.run("DELETE FROM categories WHERE id = ?", [id]);
	},

	bulkDelete: async (ids) => {
		if (ids.length === 0) return;
		const placeholders = ids.map(() => "?").join(",");
		db.run(`DELETE FROM categories WHERE id IN (${placeholders})`, ids);
	},

	bulkGet: async (ids) => {
		if (ids.length === 0) return [];
		const placeholders = ids.map(() => "?").join(",");
		const rows = db
			.query<CategoryRow, number[]>(
				`SELECT * FROM categories WHERE id IN (${placeholders})`,
			)
			.all(...ids);
		const map = new Map(rows.map((r) => [r.id, toEntity(r)]));
		return ids.map((id) => map.get(id));
	},

	count: async () => {
		return db
			.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM categories")
			.get()!.cnt;
	},

	clear: async () => {
		db.run("DELETE FROM categories");
	},

	getBySlug: async (slug) => {
		const row = db
			.query<CategoryRow, [string]>("SELECT * FROM categories WHERE slug = ?")
			.get(slug);
		return row ? toEntity(row) : undefined;
	},

	getByParentId: async (parentId) => {
		return db
			.query<CategoryRow, [number]>(
				"SELECT * FROM categories WHERE parentId = ?",
			)
			.all(parentId)
			.map(toEntity);
	},

	getByParentIdOrderedBySortOrder: async (parentId) => {
		return db
			.query<CategoryRow, [number]>(
				"SELECT * FROM categories WHERE parentId = ? ORDER BY sortOrder ASC",
			)
			.all(parentId)
			.map(toEntity);
	},

	getRootCategories: async () => {
		return db
			.query<CategoryRow, []>("SELECT * FROM categories WHERE parentId IS NULL")
			.all()
			.map(toEntity);
	},

	getAllOrderedBySortOrder: async () => {
		return db
			.query<CategoryRow, []>("SELECT * FROM categories ORDER BY sortOrder ASC")
			.all()
			.map(toEntity);
	},
});
