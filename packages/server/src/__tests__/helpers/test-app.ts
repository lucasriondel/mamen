import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app";
import { createDatabase } from "../../lib/repository/adapters/sqlite";
import { getInMemoryConnection } from "../../lib/repository/adapters/sqlite/connection";

export const createTestApp = async (): Promise<FastifyInstance> => {
	const connection = getInMemoryConnection();
	const db = createDatabase(connection);
	const uploadsDir = mkdtempSync(join(tmpdir(), "mamen-test-uploads-"));
	const app = buildApp({ db, uploadsDir });
	await app.ready();
	return app;
};
