import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/test-app";

const makeAppSettings = () => ({
	id: "app",
	llm: {
		endpoint: "http://localhost:11434",
		modelName: "llama3",
		provider: "ollama",
	},
});

describe("app-settings routes", () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		await app.close();
	});

	describe("GET /api/app-settings", () => {
		it("returns 404 when no settings exist", async () => {
			const res = await app.inject({ method: "GET", url: "/api/app-settings" });
			expect(res.statusCode).toBe(404);
		});
	});

	describe("PUT /api/app-settings", () => {
		it("creates app settings", async () => {
			const res = await app.inject({
				method: "PUT",
				url: "/api/app-settings",
				payload: makeAppSettings(),
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ ok: true });

			const get = await app.inject({ method: "GET", url: "/api/app-settings" });
			expect(get.statusCode).toBe(200);
			expect(get.json().id).toBe("app");
			expect(get.json().llm.provider).toBe("ollama");
		});
	});

	describe("POST /api/app-settings/clear", () => {
		it("clears app settings", async () => {
			await app.inject({
				method: "PUT",
				url: "/api/app-settings",
				payload: makeAppSettings(),
			});

			const res = await app.inject({
				method: "POST",
				url: "/api/app-settings/clear",
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ ok: true });

			const get = await app.inject({ method: "GET", url: "/api/app-settings" });
			expect(get.statusCode).toBe(404);
		});
	});
});
