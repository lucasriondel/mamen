import type { Database } from "bun:sqlite";
import type { UnitOfWork } from "../../ports";

export const createUnitOfWork = (db: Database): UnitOfWork => ({
	run: async <T>(fn: () => Promise<T>): Promise<T> => {
		db.run("BEGIN");
		try {
			const result = await fn();
			db.run("COMMIT");
			return result;
		} catch (error) {
			db.run("ROLLBACK");
			throw error;
		}
	},
});
