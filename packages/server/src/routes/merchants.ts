import type { Merchant } from "@mamen/shared";
import type { FastifyInstance } from "fastify";

export default async function merchantRoutes(fastify: FastifyInstance) {
	fastify.get<{ Querystring: { orderBy?: string } }>(
		"/merchants",
		async (request) => {
			if (request.query.orderBy === "name") {
				return fastify.db.merchants.getAllOrderedByName();
			}
			return fastify.db.merchants.getAll();
		},
	);

	fastify.get<{ Params: { id: string } }>(
		"/merchants/:id",
		async (request, reply) => {
			const id = Number(request.params.id);
			if (Number.isNaN(id))
				return reply.status(400).send({ error: "Invalid id" });

			const merchant = await fastify.db.merchants.get(id);
			if (!merchant) return reply.status(404).send({ error: "Not found" });
			return merchant;
		},
	);

	fastify.post<{ Body: Omit<Merchant, "id"> }>(
		"/merchants",
		async (request, reply) => {
			const id = await fastify.db.merchants.add(request.body);
			return reply.status(201).send({ id });
		},
	);

	fastify.put<{ Params: { id: string }; Body: Partial<Merchant> }>(
		"/merchants/:id",
		async (request, reply) => {
			const id = Number(request.params.id);
			if (Number.isNaN(id))
				return reply.status(400).send({ error: "Invalid id" });

			await fastify.db.merchants.update(id, request.body);
			return { ok: true };
		},
	);

	fastify.delete<{ Params: { id: string } }>(
		"/merchants/:id",
		async (request, reply) => {
			const id = Number(request.params.id);
			if (Number.isNaN(id))
				return reply.status(400).send({ error: "Invalid id" });

			await fastify.db.merchants.delete(id);
			return { ok: true };
		},
	);

	fastify.get<{ Params: { name: string } }>(
		"/merchants/by-name/:name",
		async (request, reply) => {
			const merchant = await fastify.db.merchants.getByName(
				decodeURIComponent(request.params.name),
			);
			if (!merchant) return reply.status(404).send({ error: "Not found" });
			return merchant;
		},
	);

	fastify.get<{ Params: { name: string } }>(
		"/merchants/by-name-ci/:name",
		async (request, reply) => {
			const merchant = await fastify.db.merchants.getByNameCaseInsensitive(
				decodeURIComponent(request.params.name),
			);
			if (!merchant) return reply.status(404).send({ error: "Not found" });
			return merchant;
		},
	);

	fastify.put<{ Body: { records: Merchant[] } }>(
		"/merchants/bulk-put",
		async (request) => {
			await fastify.db.merchants.bulkPut(request.body.records);
			return { ok: true };
		},
	);
}
