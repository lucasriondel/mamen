import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Merchant } from "@mamen/shared";
import type { FastifyInstance } from "fastify";
import { deleteUpload } from "../lib/uploads";

const ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
];

const MIME_TO_EXT: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
};

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

			const merchant = await fastify.db.merchants.get(id);
			if (merchant?.imageUrl) {
				const filename = merchant.imageUrl.replace("/uploads/", "");
				deleteUpload(join(fastify.uploadsDir, filename));
			}

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

	fastify.post<{ Params: { id: string } }>(
		"/merchants/:id/image",
		async (request, reply) => {
			const id = Number(request.params.id);
			if (Number.isNaN(id))
				return reply.status(400).send({ error: "Invalid id" });

			const merchant = await fastify.db.merchants.get(id);
			if (!merchant) return reply.status(404).send({ error: "Not found" });

			const data = await request.file();
			if (!data) return reply.status(400).send({ error: "No file uploaded" });

			if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
				return reply
					.status(400)
					.send({ error: "Invalid file type. Allowed: jpeg, png, webp, gif" });
			}

			const ext = MIME_TO_EXT[data.mimetype];
			const filename = `merchant-${id}-${Date.now()}.${ext}`;
			const filepath = join(fastify.uploadsDir, "merchants", filename);

			const buffer = await data.toBuffer();
			writeFileSync(filepath, buffer);

			// Delete old image if exists
			if (merchant.imageUrl) {
				const oldFilename = merchant.imageUrl.replace("/uploads/", "");
				deleteUpload(join(fastify.uploadsDir, oldFilename));
			}

			const imageUrl = `/uploads/merchants/${filename}`;
			await fastify.db.merchants.update(id, { imageUrl } as Partial<Merchant>);

			return { imageUrl };
		},
	);

	fastify.delete<{ Params: { id: string } }>(
		"/merchants/:id/image",
		async (request, reply) => {
			const id = Number(request.params.id);
			if (Number.isNaN(id))
				return reply.status(400).send({ error: "Invalid id" });

			const merchant = await fastify.db.merchants.get(id);
			if (!merchant) return reply.status(404).send({ error: "Not found" });

			if (merchant.imageUrl) {
				const filename = merchant.imageUrl.replace("/uploads/", "");
				deleteUpload(join(fastify.uploadsDir, filename));
			}

			await fastify.db.merchants.update(id, {
				imageUrl: undefined,
			} as Partial<Merchant>);

			return { ok: true };
		},
	);
}
