import type { Database } from "bun:sqlite";
import type { AppSettings } from "@mamen/shared";
import type { AppSettingsRepository } from "../../ports";

type AppSettingsRow = {
	id: string;
	llm: string;
};

const toEntity = (row: AppSettingsRow): AppSettings => ({
	id: row.id as "app",
	llm: JSON.parse(row.llm),
});

export const createAppSettingsAdapter = (
	db: Database,
): AppSettingsRepository => ({
	get: async () => {
		const row = db
			.query<AppSettingsRow, [string]>("SELECT * FROM appSettings WHERE id = ?")
			.get("app");
		return row ? toEntity(row) : undefined;
	},

	put: async (settings) => {
		db.run("INSERT OR REPLACE INTO appSettings (id, llm) VALUES (?, ?)", [
			"app",
			JSON.stringify(settings.llm),
		]);
	},

	clear: async () => {
		db.run("DELETE FROM appSettings");
	},
});
