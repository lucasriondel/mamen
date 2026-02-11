import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/test-app";

describe("GET /api/health", () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		await app.close();
	});

	it("returns status ok", async () => {
		const res = await app.inject({ method: "GET", url: "/api/health" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ status: "ok" });
	});
});
