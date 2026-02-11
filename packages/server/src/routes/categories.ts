import type { Category } from "@mamen/shared";
import type { FastifyInstance } from "fastify";

export default async function categoryRoutes(fastify: FastifyInstance) {
	fastify.get<{ Querystring: { parentId?: string; orderBy?: string } }>(
		"/categories",
		async (request) => {
			const { parentId, orderBy } = request.query;

			if (parentId) {
				if (orderBy === "sortOrder") {
					return fastify.db.categories.getByParentIdOrderedBySortOrder(
						Number(parentId),
					);
				}
				return fastify.db.categories.getByParentId(Number(parentId));
			}
			if (orderBy === "sortOrder") {
				return fastify.db.categories.getAllOrderedBySortOrder();
			}
			return fastify.db.categories.getAll();
		},
	);

	fastify.get("/categories/root", async () => {
		return fastify.db.categories.getRootCategories();
	});

	fastify.get<{ Params: { id: string } }>(
		"/categories/:id",
		async (request, reply) => {
			const id = Number(request.params.id);
			if (Number.isNaN(id))
				return reply.status(400).send({ error: "Invalid id" });

			const category = await fastify.db.categories.get(id);
			if (!category) return reply.status(404).send({ error: "Not found" });
			return category;
		},
	);

	fastify.post<{ Body: Omit<Category, "id"> }>(
		"/categories",
		async (request, reply) => {
			const id = await fastify.db.categories.add(request.body);
			return reply.status(201).send({ id });
		},
	);

	fastify.post<{ Body: { records: Omit<Category, "id">[] } }>(
		"/categories/bulk-add",
		async (request, reply) => {
			const ids = await fastify.db.categories.bulkAdd(request.body.records);
			return reply.status(201).send({ ids });
		},
	);

	fastify.put<{ Params: { id: string }; Body: Partial<Category> }>(
		"/categories/:id",
		async (request, reply) => {
			const id = Number(request.params.id);
			if (Number.isNaN(id))
				return reply.status(400).send({ error: "Invalid id" });

			await fastify.db.categories.update(id, request.body);
			return { ok: true };
		},
	);

	fastify.put<{ Body: { records: Category[] } }>(
		"/categories/bulk-put",
		async (request) => {
			await fastify.db.categories.bulkPut(request.body.records);
			return { ok: true };
		},
	);

	fastify.delete<{ Params: { id: string } }>(
		"/categories/:id",
		async (request, reply) => {
			const id = Number(request.params.id);
			if (Number.isNaN(id))
				return reply.status(400).send({ error: "Invalid id" });

			await fastify.db.categories.delete(id);
			return { ok: true };
		},
	);

	fastify.get<{ Params: { slug: string } }>(
		"/categories/by-slug/:slug",
		async (request, reply) => {
			const category = await fastify.db.categories.getBySlug(
				request.params.slug,
			);
			if (!category) return reply.status(404).send({ error: "Not found" });
			return category;
		},
	);

	fastify.post("/categories/clear", async () => {
		await fastify.db.categories.clear();
		return { ok: true };
	});
}
