import type { DatabasePort } from "../../ports";
import { closeConnection, deleteDatabase, getConnection } from "./connection";

export const createDatabaseAdapter = (dbPath?: string): DatabasePort => ({
	open: async () => {
		getConnection(dbPath);
	},

	close: async () => {
		closeConnection();
	},

	delete: async () => {
		deleteDatabase(dbPath);
	},
});
