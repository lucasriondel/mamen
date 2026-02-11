import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/test-app";

const makeMerchant = (overrides: Record<string, unknown> = {}) => ({
	name: "Test Merchant",
	createdAt: new Date().toISOString(),
	firstSeen: new Date().toISOString(),
	...overrides,
});

const makeRule = (
	merchantId: number,
	overrides: Record<string, unknown> = {},
) => ({
	merchantId,
	pattern: "TEST*",
	matchCount: 0,
	createdAt: new Date().toISOString(),
	...overrides,
});

describe("rules routes", () => {
	let app: FastifyInstance;
	let merchantId: number;

	beforeEach(async () => {
		app = await createTestApp();
		const res = await app.inject({
			method: "POST",
			url: "/api/merchants",
			payload: makeMerchant(),
		});
		merchantId = res.json().id;
	});

	afterEach(async () => {
		await app.close();
	});

	describe("GET /api/rules", () => {
		it("returns empty list initially", async () => {
			const res = await app.inject({ method: "GET", url: "/api/rules" });
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual([]);
		});

		it("filters by merchantId", async () => {
			await app.inject({
				method: "POST",
				url: "/api/rules",
				payload: makeRule(merchantId),
			});

			const res = await app.inject({
				method: "GET",
				url: `/api/rules?merchantId=${merchantId}`,
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toHaveLength(1);
		});
	});

	describe("GET /api/rules/count", () => {
		it("returns total count", async () => {
			const res = await app.inject({ method: "GET", url: "/api/rules/count" });
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ count: 0 });
		});

		it("returns count by merchantId", async () => {
			await app.inject({
				method: "POST",
				url: "/api/rules",
				payload: makeRule(merchantId),
			});

			const res = await app.inject({
				method: "GET",
				url: `/api/rules/count?merchantId=${merchantId}`,
			});
			expect(res.json()).toEqual({ count: 1 });
		});
	});

	describe("POST /api/rules", () => {
		it("creates a rule and returns 201", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/api/rules",
				payload: makeRule(merchantId),
			});
			expect(res.statusCode).toBe(201);
			expect(res.json()).toHaveProperty("id");
		});
	});

	describe("GET /api/rules/:id", () => {
		it("returns a rule by id", async () => {
			const create = await app.inject({
				method: "POST",
				url: "/api/rules",
				payload: makeRule(merchantId, { pattern: "PAT1" }),
			});
			const { id } = create.json();

			const res = await app.inject({ method: "GET", url: `/api/rules/${id}` });
			expect(res.statusCode).toBe(200);
			expect(res.json().pattern).toBe("PAT1");
		});

		it("returns 400 for invalid id", async () => {
			const res = await app.inject({ method: "GET", url: "/api/rules/abc" });
			expect(res.statusCode).toBe(400);
		});

		it("returns 404 for non-existent id", async () => {
			const res = await app.inject({ method: "GET", url: "/api/rules/999" });
			expect(res.statusCode).toBe(404);
		});
	});

	describe("PUT /api/rules/:id", () => {
		it("updates a rule", async () => {
			const create = await app.inject({
				method: "POST",
				url: "/api/rules",
				payload: makeRule(merchantId),
			});
			const { id } = create.json();

			const res = await app.inject({
				method: "PUT",
				url: `/api/rules/${id}`,
				payload: { pattern: "UPDATED*" },
			});
			expect(res.statusCode).toBe(200);

			const get = await app.inject({ method: "GET", url: `/api/rules/${id}` });
			expect(get.json().pattern).toBe("UPDATED*");
		});

		it("returns 400 for invalid id", async () => {
			const res = await app.inject({
				method: "PUT",
				url: "/api/rules/abc",
				payload: { pattern: "X" },
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe("DELETE /api/rules/:id", () => {
		it("deletes a rule", async () => {
			const create = await app.inject({
				method: "POST",
				url: "/api/rules",
				payload: makeRule(merchantId),
			});
			const { id } = create.json();

			const res = await app.inject({
				method: "DELETE",
				url: `/api/rules/${id}`,
			});
			expect(res.statusCode).toBe(200);

			const get = await app.inject({ method: "GET", url: `/api/rules/${id}` });
			expect(get.statusCode).toBe(404);
		});

		it("returns 400 for invalid id", async () => {
			const res = await app.inject({ method: "DELETE", url: "/api/rules/abc" });
			expect(res.statusCode).toBe(400);
		});
	});

	describe("POST /api/rules/bulk-add", () => {
		it("creates multiple rules and returns 201", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/api/rules/bulk-add",
				payload: {
					records: [
						makeRule(merchantId, { pattern: "A*" }),
						makeRule(merchantId, { pattern: "B*" }),
					],
				},
			});
			expect(res.statusCode).toBe(201);
			expect(res.json().ids).toHaveLength(2);
		});
	});

	describe("POST /api/rules/bulk-delete", () => {
		it("deletes multiple rules", async () => {
			const r1 = await app.inject({
				method: "POST",
				url: "/api/rules",
				payload: makeRule(merchantId, { pattern: "X" }),
			});
			const r2 = await app.inject({
				method: "POST",
				url: "/api/rules",
				payload: makeRule(merchantId, { pattern: "Y" }),
			});

			const res = await app.inject({
				method: "POST",
				url: "/api/rules/bulk-delete",
				payload: { ids: [r1.json().id, r2.json().id] },
			});
			expect(res.statusCode).toBe(200);

			const list = await app.inject({ method: "GET", url: "/api/rules" });
			expect(list.json()).toEqual([]);
		});
	});

	describe("GET /api/rules/by-merchant-pattern/:merchantId/:pattern", () => {
		it("returns rule by merchant and pattern", async () => {
			await app.inject({
				method: "POST",
				url: "/api/rules",
				payload: makeRule(merchantId, { pattern: "UNIQUE" }),
			});

			const res = await app.inject({
				method: "GET",
				url: `/api/rules/by-merchant-pattern/${merchantId}/UNIQUE`,
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().pattern).toBe("UNIQUE");
		});

		it("returns 400 for invalid merchantId", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/rules/by-merchant-pattern/abc/PAT",
			});
			expect(res.statusCode).toBe(400);
		});

		it("returns 404 when not found", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/api/rules/by-merchant-pattern/${merchantId}/MISSING`,
			});
			expect(res.statusCode).toBe(404);
		});
	});
});
