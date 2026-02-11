import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/test-app";

const makeMerchant = (overrides: Record<string, unknown> = {}) => ({
	name: "Acme Corp",
	createdAt: new Date().toISOString(),
	firstSeen: new Date().toISOString(),
	...overrides,
});

describe("merchants routes", () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		await app.close();
	});

	describe("GET /api/merchants", () => {
		it("returns empty list initially", async () => {
			const res = await app.inject({ method: "GET", url: "/api/merchants" });
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual([]);
		});

		it("returns merchants ordered by name", async () => {
			await app.inject({
				method: "POST",
				url: "/api/merchants",
				payload: makeMerchant({ name: "Zebra" }),
			});
			await app.inject({
				method: "POST",
				url: "/api/merchants",
				payload: makeMerchant({ name: "Alpha" }),
			});

			const res = await app.inject({
				method: "GET",
				url: "/api/merchants?orderBy=name",
			});
			expect(res.statusCode).toBe(200);
			const names = res.json().map((m: { name: string }) => m.name);
			expect(names).toEqual(["Alpha", "Zebra"]);
		});
	});

	describe("POST /api/merchants", () => {
		it("creates a merchant and returns 201", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/api/merchants",
				payload: makeMerchant(),
			});
			expect(res.statusCode).toBe(201);
			expect(res.json()).toHaveProperty("id");
		});
	});

	describe("GET /api/merchants/:id", () => {
		it("returns a merchant by id", async () => {
			const create = await app.inject({
				method: "POST",
				url: "/api/merchants",
				payload: makeMerchant({ name: "Test" }),
			});
			const { id } = create.json();

			const res = await app.inject({
				method: "GET",
				url: `/api/merchants/${id}`,
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().name).toBe("Test");
		});

		it("returns 400 for invalid id", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/merchants/abc",
			});
			expect(res.statusCode).toBe(400);
		});

		it("returns 404 for non-existent id", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/merchants/999",
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe("PUT /api/merchants/:id", () => {
		it("updates a merchant", async () => {
			const create = await app.inject({
				method: "POST",
				url: "/api/merchants",
				payload: makeMerchant({ name: "Old" }),
			});
			const { id } = create.json();

			const res = await app.inject({
				method: "PUT",
				url: `/api/merchants/${id}`,
				payload: { name: "New" },
			});
			expect(res.statusCode).toBe(200);

			const get = await app.inject({
				method: "GET",
				url: `/api/merchants/${id}`,
			});
			expect(get.json().name).toBe("New");
		});

		it("returns 400 for invalid id", async () => {
			const res = await app.inject({
				method: "PUT",
				url: "/api/merchants/abc",
				payload: { name: "X" },
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe("DELETE /api/merchants/:id", () => {
		it("deletes a merchant", async () => {
			const create = await app.inject({
				method: "POST",
				url: "/api/merchants",
				payload: makeMerchant(),
			});
			const { id } = create.json();

			const res = await app.inject({
				method: "DELETE",
				url: `/api/merchants/${id}`,
			});
			expect(res.statusCode).toBe(200);

			const get = await app.inject({
				method: "GET",
				url: `/api/merchants/${id}`,
			});
			expect(get.statusCode).toBe(404);
		});

		it("returns 400 for invalid id", async () => {
			const res = await app.inject({
				method: "DELETE",
				url: "/api/merchants/abc",
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe("GET /api/merchants/by-name/:name", () => {
		it("returns merchant by exact name", async () => {
			await app.inject({
				method: "POST",
				url: "/api/merchants",
				payload: makeMerchant({ name: "Netflix" }),
			});

			const res = await app.inject({
				method: "GET",
				url: "/api/merchants/by-name/Netflix",
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().name).toBe("Netflix");
		});

		it("returns 404 when not found", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/merchants/by-name/Missing",
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe("GET /api/merchants/by-name-ci/:name", () => {
		it("returns merchant by case-insensitive name", async () => {
			await app.inject({
				method: "POST",
				url: "/api/merchants",
				payload: makeMerchant({ name: "Netflix" }),
			});

			const res = await app.inject({
				method: "GET",
				url: "/api/merchants/by-name-ci/netflix",
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().name).toBe("Netflix");
		});

		it("returns 404 when not found", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/merchants/by-name-ci/missing",
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe("PUT /api/merchants/bulk-put", () => {
		it("bulk upserts merchants", async () => {
			const res = await app.inject({
				method: "PUT",
				url: "/api/merchants/bulk-put",
				payload: {
					records: [
						{ id: 1, ...makeMerchant({ name: "A" }) },
						{ id: 2, ...makeMerchant({ name: "B" }) },
					],
				},
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ ok: true });

			const list = await app.inject({ method: "GET", url: "/api/merchants" });
			expect(list.json()).toHaveLength(2);
		});
	});
});
