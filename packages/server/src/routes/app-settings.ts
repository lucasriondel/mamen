import type { AppSettings } from "@mamen/shared";
import type { FastifyInstance } from "fastify";

export default async function appSettingsRoutes(fastify: FastifyInstance) {
	fastify.get("/app-settings", async (_request, reply) => {
		const settings = await fastify.db.appSettings.get();
		if (!settings) return reply.status(404).send({ error: "Not found" });
		return settings;
	});

	fastify.put<{ Body: AppSettings }>("/app-settings", async (request) => {
		await fastify.db.appSettings.put(request.body);
		return { ok: true };
	});

	fastify.post("/app-settings/clear", async () => {
		await fastify.db.appSettings.clear();
		return { ok: true };
	});
}
