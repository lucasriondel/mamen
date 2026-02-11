import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/test-app";

const makeAccount = (overrides: Record<string, unknown> = {}) => ({
	name: "Test Account",
	type: "checking",
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	...overrides,
});

const makeCategory = (overrides: Record<string, unknown> = {}) => ({
	name: "Food",
	slug: "food",
	color: "#ff0000",
	icon: "utensils",
	parentId: null,
	sortOrder: 0,
	createdAt: new Date().toISOString(),
	...overrides,
});

describe("database routes", () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		await app.close();
	});

	describe("POST /api/database/reset", () => {
		it("clears all tables", async () => {
			await app.inject({
				method: "POST",
				url: "/api/accounts",
				payload: makeAccount(),
			});
			await app.inject({
				method: "POST",
				url: "/api/categories",
				payload: makeCategory(),
			});

			const res = await app.inject({
				method: "POST",
				url: "/api/database/reset",
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ ok: true });

			const accounts = await app.inject({
				method: "GET",
				url: "/api/accounts",
			});
			expect(accounts.json()).toEqual([]);

			const categories = await app.inject({
				method: "GET",
				url: "/api/categories",
			});
			expect(categories.json()).toEqual([]);
		});
	});

	describe("POST /api/database/export", () => {
		it("exports all data", async () => {
			await app.inject({
				method: "POST",
				url: "/api/accounts",
				payload: makeAccount(),
			});

			const res = await app.inject({
				method: "POST",
				url: "/api/database/export",
			});
			expect(res.statusCode).toBe(200);

			const data = res.json();
			expect(data).toHaveProperty("accounts");
			expect(data).toHaveProperty("transactions");
			expect(data).toHaveProperty("merchants");
			expect(data).toHaveProperty("rules");
			expect(data).toHaveProperty("categories");
			expect(data).toHaveProperty("subscriptions");
			expect(data).toHaveProperty("settings");
			expect(data).toHaveProperty("appSettings");
			expect(data.accounts).toHaveLength(1);
		});
	});

	describe("POST /api/database/import", () => {
		it("import round-trips with export", async () => {
			await app.inject({
				method: "POST",
				url: "/api/accounts",
				payload: makeAccount({ name: "A" }),
			});
			await app.inject({
				method: "POST",
				url: "/api/categories",
				payload: makeCategory({ name: "C", slug: "c" }),
			});

			const exported = await app.inject({
				method: "POST",
				url: "/api/database/export",
			});
			const data = exported.json();

			await app.inject({ method: "POST", url: "/api/database/reset" });

			const res = await app.inject({
				method: "POST",
				url: "/api/database/import",
				payload: data,
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ ok: true });

			const accounts = await app.inject({
				method: "GET",
				url: "/api/accounts",
			});
			expect(accounts.json()).toHaveLength(1);
			expect(accounts.json()[0].name).toBe("A");

			const categories = await app.inject({
				method: "GET",
				url: "/api/categories",
			});
			expect(categories.json()).toHaveLength(1);
			expect(categories.json()[0].name).toBe("C");
		});
	});
});
