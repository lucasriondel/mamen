import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/test-app";

describe("settings routes", () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		await app.close();
	});

	describe("GET /api/settings", () => {
		it("returns empty list initially", async () => {
			const res = await app.inject({ method: "GET", url: "/api/settings" });
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual([]);
		});
	});

	describe("PUT /api/settings/by-key", () => {
		it("creates or updates a setting by key", async () => {
			const res = await app.inject({
				method: "PUT",
				url: "/api/settings/by-key",
				payload: { key: "currency_symbol", value: "€" },
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ ok: true });
		});
	});

	describe("GET /api/settings/by-key/:key", () => {
		it("returns a setting by key", async () => {
			await app.inject({
				method: "PUT",
				url: "/api/settings/by-key",
				payload: { key: "currency_symbol", value: "€" },
			});

			const res = await app.inject({
				method: "GET",
				url: "/api/settings/by-key/currency_symbol",
			});
			expect(res.statusCode).toBe(200);
			expect(res.json().key).toBe("currency_symbol");
			expect(res.json().value).toBe("€");
		});

		it("returns 404 for missing key", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/api/settings/by-key/currency_symbol",
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe("DELETE /api/settings/:id", () => {
		it("deletes a setting", async () => {
			await app.inject({
				method: "PUT",
				url: "/api/settings/by-key",
				payload: { key: "currency_symbol", value: "€" },
			});

			const getRes = await app.inject({
				method: "GET",
				url: "/api/settings/by-key/currency_symbol",
			});
			const { id } = getRes.json();

			const res = await app.inject({
				method: "DELETE",
				url: `/api/settings/${id}`,
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ ok: true });
		});

		it("returns 400 for invalid id", async () => {
			const res = await app.inject({
				method: "DELETE",
				url: "/api/settings/abc",
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe("POST /api/settings/clear", () => {
		it("clears all settings", async () => {
			await app.inject({
				method: "PUT",
				url: "/api/settings/by-key",
				payload: { key: "currency_symbol", value: "€" },
			});

			const res = await app.inject({
				method: "POST",
				url: "/api/settings/clear",
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ ok: true });

			const list = await app.inject({ method: "GET", url: "/api/settings" });
			expect(list.json()).toEqual([]);
		});
	});
});
