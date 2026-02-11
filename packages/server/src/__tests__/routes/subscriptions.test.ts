import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/test-app";

const makeMerchant = (overrides: Record<string, unknown> = {}) => ({
	name: "Netflix",
	createdAt: new Date().toISOString(),
	firstSeen: new Date().toISOString(),
	...overrides,
});

const makeSubscription = (
	merchantId: number,
	overrides: Record<string, unknown> = {},
) => ({
	merchantId,
	merchantName: "Netflix",
	typicalAmount: 15.99,
	frequency: "monthly",
	intervalDays: 30,
	lastChargeDate: "2025-01-15",
	firstChargeDate: "2024-01-15",
	chargeCount: 12,
	status: "active",
	transactionIds: [1, 2, 3],
	detectedAt: "2025-01-15",
	updatedAt: "2025-01-15",
	...overrides,
});

describe("subscriptions routes", () => {
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

	describe("GET /api/subscriptions", () => {
		it("returns empty list initially", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/subscriptions",
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual([]);
		});

		it("filters by merchantId", async () => {
			await app.inject({
				method: "POST",
				url: "/api/subscriptions",
				payload: makeSubscription(merchantId),
			});

			const res = await app.inject({
				method: "GET",
				url: `/api/subscriptions?merchantId=${merchantId}`,
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toHaveLength(1);
		});

		it("filters by status", async () => {
			await app.inject({
				method: "POST",
				url: "/api/subscriptions",
				payload: makeSubscription(merchantId, { status: "active" }),
			});

			const res = await app.inject({
				method: "GET",
				url: "/api/subscriptions?status=active",
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toHaveLength(1);
		});
	});

	describe("POST /api/subscriptions", () => {
		it("creates a subscription and returns 201", async () => {
			const res = await app.inject({
				method: "POST",
				url: "/api/subscriptions",
				payload: makeSubscription(merchantId),
			});
			expect(res.statusCode).toBe(201);
			expect(res.json()).toHaveProperty("id");
		});
	});

	describe("GET /api/subscriptions/:id", () => {
		it("returns a subscription by id", async () => {
			const create = await app.inject({
				method: "POST",
				url: "/api/subscriptions",
				payload: makeSubscription(merchantId),
			});
			const { id } = create.json();

			const res = await app.inject({
				method: "GET",
				url: `/api/subscriptions/${id}`,
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().merchantName).toBe("Netflix");
		});

		it("returns 400 for invalid id", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/subscriptions/abc",
			});
			expect(res.statusCode).toBe(400);
		});

		it("returns 404 for non-existent id", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/subscriptions/999",
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe("PUT /api/subscriptions/:id", () => {
		it("updates a subscription", async () => {
			const create = await app.inject({
				method: "POST",
				url: "/api/subscriptions",
				payload: makeSubscription(merchantId),
			});
			const { id } = create.json();

			const res = await app.inject({
				method: "PUT",
				url: `/api/subscriptions/${id}`,
				payload: { typicalAmount: 19.99 },
			});
			expect(res.statusCode).toBe(200);

			const get = await app.inject({
				method: "GET",
				url: `/api/subscriptions/${id}`,
			});
			expect(get.json().typicalAmount).toBe(19.99);
		});

		it("returns 400 for invalid id", async () => {
			const res = await app.inject({
				method: "PUT",
				url: "/api/subscriptions/abc",
				payload: {},
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe("DELETE /api/subscriptions/:id", () => {
		it("deletes a subscription", async () => {
			const create = await app.inject({
				method: "POST",
				url: "/api/subscriptions",
				payload: makeSubscription(merchantId),
			});
			const { id } = create.json();

			const res = await app.inject({
				method: "DELETE",
				url: `/api/subscriptions/${id}`,
			});
			expect(res.statusCode).toBe(200);

			const get = await app.inject({
				method: "GET",
				url: `/api/subscriptions/${id}`,
			});
			expect(get.statusCode).toBe(404);
		});

		it("returns 400 for invalid id", async () => {
			const res = await app.inject({
				method: "DELETE",
				url: "/api/subscriptions/abc",
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe("GET /api/subscriptions/first-by-merchant/:merchantId", () => {
		it("returns first subscription for a merchant", async () => {
			await app.inject({
				method: "POST",
				url: "/api/subscriptions",
				payload: makeSubscription(merchantId),
			});

			const res = await app.inject({
				method: "GET",
				url: `/api/subscriptions/first-by-merchant/${merchantId}`,
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().merchantId).toBe(merchantId);
		});

		it("returns 400 for invalid merchantId", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/subscriptions/first-by-merchant/abc",
			});
			expect(res.statusCode).toBe(400);
		});

		it("returns 404 when not found", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/subscriptions/first-by-merchant/999",
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe("GET /api/subscriptions/by-merchant-frequency/:merchantId/:frequency", () => {
		it("returns subscription by merchant and frequency", async () => {
			await app.inject({
				method: "POST",
				url: "/api/subscriptions",
				payload: makeSubscription(merchantId, { frequency: "monthly" }),
			});

			const res = await app.inject({
				method: "GET",
				url: `/api/subscriptions/by-merchant-frequency/${merchantId}/monthly`,
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().frequency).toBe("monthly");
		});

		it("returns 400 for invalid merchantId", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/subscriptions/by-merchant-frequency/abc/monthly",
			});
			expect(res.statusCode).toBe(400);
		});

		it("returns 404 when not found", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/api/subscriptions/by-merchant-frequency/${merchantId}/yearly`,
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe("PUT /api/subscriptions/bulk-put", () => {
		it("bulk upserts subscriptions", async () => {
			const res = await app.inject({
				method: "PUT",
				url: "/api/subscriptions/bulk-put",
				payload: {
					records: [
						{ id: 1, ...makeSubscription(merchantId, { merchantName: "A" }) },
						{ id: 2, ...makeSubscription(merchantId, { merchantName: "B" }) },
					],
				},
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ ok: true });
		});
	});

	describe("POST /api/subscriptions/clear", () => {
		it("clears all subscriptions", async () => {
			await app.inject({
				method: "POST",
				url: "/api/subscriptions",
				payload: makeSubscription(merchantId),
			});

			const res = await app.inject({
				method: "POST",
				url: "/api/subscriptions/clear",
			});
			expect(res.statusCode).toBe(200);

			const list = await app.inject({
				method: "GET",
				url: "/api/subscriptions",
			});
			expect(list.json()).toEqual([]);
		});
	});
});
