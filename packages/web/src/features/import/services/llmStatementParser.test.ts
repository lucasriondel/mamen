import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMSettings } from "@/types";
import { parseStatementWithLLM } from "./llmStatementParser";

const mockSettings: LLMSettings = {
	endpoint: "http://localhost:11434/v1",
	modelName: "llama3.2",
	provider: "ollama",
};

const validLLMResponse = JSON.stringify([
	{ date: "2026-01-15", amount: -42.5, description: "AMAZON.COM*123ABC" },
	{ date: "2026-01-16", amount: 1500.0, description: "DIRECT DEPOSIT PAYROLL" },
]);

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("parseStatementWithLLM", () => {
	it("returns parsed transactions on successful LLM response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [{ message: { content: validLLMResponse } }],
					}),
			}),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.transactions).toHaveLength(2);
			expect(result.transactions[0].date).toBe("2026-01-15");
			expect(result.transactions[0].amount).toBe(-42.5);
			expect(result.transactions[0].description).toBe("AMAZON.COM*123ABC");
			expect(result.transactions[1].amount).toBe(1500.0);
		}
	});

	it("extracts JSON from response with surrounding text", async () => {
		const responseWithText = `Here are the transactions I found:\n${validLLMResponse}\nTotal: 2 transactions.`;

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [{ message: { content: responseWithText } }],
					}),
			}),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.transactions).toHaveLength(2);
		}
	});

	it("returns error when LLM returns empty response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [{ message: { content: "" } }],
					}),
			}),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errorType).toBe("invalid-response");
		}
	});

	it("returns error when LLM response has no JSON array", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [
							{
								message: { content: "No transactions found in this document." },
							},
						],
					}),
			}),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errorType).toBe("parse");
		}
	});

	it("returns error when LLM returns invalid JSON", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [{ message: { content: "[{invalid json}]" } }],
					}),
			}),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errorType).toBe("invalid-response");
		}
	});

	it("returns error when LLM response fails Zod validation", async () => {
		const invalidData = JSON.stringify([
			{ date: "not-a-date", amount: "not-a-number", description: "" },
		]);

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [{ message: { content: invalidData } }],
					}),
			}),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errorType).toBe("invalid-response");
		}
	});

	it("returns error when LLM returns empty array", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						choices: [{ message: { content: "[]" } }],
					}),
			}),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errorType).toBe("parse");
		}
	});

	it("returns network error on fetch failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValueOnce(new Error("Failed to fetch")),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errorType).toBe("network");
		}
	});

	it("returns network error on invalid API key", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValueOnce(new Error("Invalid API key")),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errorType).toBe("network");
			expect(result.error).toContain("Invalid API key");
		}
	});

	it("returns error on HTTP error response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: false,
				status: 500,
			}),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errorType).toBe("network");
		}
	});

	it("sends correct request to LLM endpoint", async () => {
		const mockFetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [{ message: { content: validLLMResponse } }],
				}),
		});
		vi.stubGlobal("fetch", mockFetch);

		await parseStatementWithLLM("my statement text", mockSettings);

		expect(mockFetch).toHaveBeenCalledWith(
			"http://localhost:11434/v1/chat/completions",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					"Content-Type": "application/json",
				}),
			}),
		);

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.model).toBe("llama3.2");
		expect(body.messages[0].content).toContain("my statement text");
	});

	it("includes API key in header for cloud providers", async () => {
		const cloudSettings: LLMSettings = {
			endpoint: "https://api.openai.com/v1",
			apiKey: "sk-test-key",
			modelName: "gpt-4o-mini",
			provider: "openai",
		};

		const mockFetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					choices: [{ message: { content: validLLMResponse } }],
				}),
		});
		vi.stubGlobal("fetch", mockFetch);

		await parseStatementWithLLM("text", cloudSettings);

		expect(mockFetch.mock.calls[0][1].headers).toHaveProperty(
			"Authorization",
			"Bearer sk-test-key",
		);
	});

	it("returns timeout error on abort", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockRejectedValueOnce(
					new DOMException("The operation was aborted", "AbortError"),
				),
		);

		const result = await parseStatementWithLLM("statement text", mockSettings);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.errorType).toBe("timeout");
			expect(result.error).toContain("timed out");
		}
	});
});
