import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app";
import { createDatabase } from "../../lib/repository/adapters/sqlite";
import { getInMemoryConnection } from "../../lib/repository/adapters/sqlite/connection";

export const createTestApp = async (): Promise<FastifyInstance> => {
	const connection = getInMemoryConnection();
	const db = createDatabase(connection);
	const app = buildApp({ db });
	await app.ready();
	return app;
};
