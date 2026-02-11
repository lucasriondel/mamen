import type { FastifyInstance } from "fastify";

export default async function databaseRoutes(fastify: FastifyInstance) {
	fastify.post("/database/reset", async () => {
		const db = fastify.db;

		await db.transactions.clear();
		await db.merchants.clear();
		await db.rules.clear();
		await db.subscriptions.clear();
		await db.categories.clear();
		await db.settings.clear();
		await db.appSettings.clear();
		await db.accounts.clear();

		return { ok: true };
	});

	fastify.post("/database/export", async () => {
		const db = fastify.db;

		const [
			accounts,
			transactions,
			merchants,
			rules,
			categories,
			subscriptions,
			settings,
			appSettings,
		] = await Promise.all([
			db.accounts.getAll(),
			db.transactions.getAll(),
			db.merchants.getAll(),
			db.rules.getAll(),
			db.categories.getAll(),
			db.subscriptions.getAll(),
			db.settings.getAll(),
			db.appSettings.get(),
		]);

		return {
			accounts,
			transactions,
			merchants,
			rules,
			categories,
			subscriptions,
			settings,
			appSettings: appSettings ? [appSettings] : [],
		};
	});

	fastify.post<{
		Body: {
			accounts?: unknown[];
			transactions?: unknown[];
			merchants?: unknown[];
			rules?: unknown[];
			categories?: unknown[];
			subscriptions?: unknown[];
			settings?: unknown[];
			appSettings?: unknown[];
		};
	}>("/database/import", async (request) => {
		const body = request.body;
		const db = fastify.db;

		// Clear all tables first
		await db.transactions.clear();
		await db.merchants.clear();
		await db.rules.clear();
		await db.subscriptions.clear();
		await db.categories.clear();
		await db.settings.clear();
		await db.appSettings.clear();
		await db.accounts.clear();

		// Import in dependency order
		if (body.accounts?.length) {
			await db.accounts.bulkPut(body.accounts as never[]);
		}
		if (body.categories?.length) {
			await db.categories.bulkPut(body.categories as never[]);
		}
		if (body.merchants?.length) {
			await db.merchants.bulkPut(body.merchants as never[]);
		}
		if (body.rules?.length) {
			await db.rules.bulkPut(body.rules as never[]);
		}
		if (body.transactions?.length) {
			await db.transactions.bulkPut(body.transactions as never[]);
		}
		if (body.subscriptions?.length) {
			await db.subscriptions.bulkPut(body.subscriptions as never[]);
		}
		if (body.settings?.length) {
			await db.settings.bulkPut(body.settings as never[]);
		}
		if (body.appSettings?.length) {
			const appSetting = body.appSettings[0];
			if (appSetting) {
				await db.appSettings.put(appSetting as never);
			}
		}

		return { ok: true };
	});
}
