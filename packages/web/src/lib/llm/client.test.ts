import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMSettings } from "@/types";
import {
	getLLMError,
	getProviderDefaults,
	isLLMConfigured,
	testConnection,
} from "./client";

const ollamaSettings: LLMSettings = {
	endpoint: "http://localhost:11434/v1",
	modelName: "llama3.2",
	provider: "ollama",
};

const openaiSettings: LLMSettings = {
	endpoint: "https://api.openai.com/v1",
	apiKey: "sk-test-key",
	modelName: "gpt-4o-mini",
	provider: "openai",
};

describe("isLLMConfigured", () => {
	it("returns false when settings is undefined", () => {
		expect(isLLMConfigured(undefined)).toBe(false);
	});

	it("returns false when endpoint is empty", () => {
		expect(isLLMConfigured({ ...ollamaSettings, endpoint: "" })).toBe(false);
	});

	it("returns false when modelName is empty", () => {
		expect(isLLMConfigured({ ...ollamaSettings, modelName: "" })).toBe(false);
	});

	it("returns true for ollama without API key", () => {
		expect(isLLMConfigured(ollamaSettings)).toBe(true);
	});

	it("returns true for lm-studio without API key", () => {
		expect(isLLMConfigured({ ...ollamaSettings, provider: "lm-studio" })).toBe(
			true,
		);
	});

	it("returns false for openai without API key", () => {
		expect(isLLMConfigured({ ...openaiSettings, apiKey: undefined })).toBe(
			false,
		);
	});

	it("returns true for openai with API key", () => {
		expect(isLLMConfigured(openaiSettings)).toBe(true);
	});

	it("returns false for anthropic without API key", () => {
		expect(
			isLLMConfigured({
				endpoint: "https://api.anthropic.com/v1",
				modelName: "claude-3-5-haiku-latest",
				provider: "anthropic",
			}),
		).toBe(false);
	});
});

describe("getLLMError", () => {
	it("returns error when settings is undefined", () => {
		expect(getLLMError(undefined)).toBe(
			"LLM not configured. Set up in Settings first.",
		);
	});

	it("returns error when endpoint is empty", () => {
		expect(getLLMError({ ...ollamaSettings, endpoint: "" })).toBe(
			"LLM endpoint not configured.",
		);
	});

	it("returns error when modelName is empty", () => {
		expect(getLLMError({ ...ollamaSettings, modelName: "" })).toBe(
			"LLM model not selected.",
		);
	});

	it("returns error for cloud provider without API key", () => {
		expect(getLLMError({ ...openaiSettings, apiKey: undefined })).toBe(
			"API key required for cloud providers.",
		);
	});

	it("returns null when properly configured", () => {
		expect(getLLMError(ollamaSettings)).toBeNull();
	});

	it("returns null for openai with API key", () => {
		expect(getLLMError(openaiSettings)).toBeNull();
	});
});

describe("getProviderDefaults", () => {
	it("returns ollama defaults", () => {
		const defaults = getProviderDefaults("ollama");
		expect(defaults.endpoint).toBe("http://localhost:11434/v1");
		expect(defaults.modelName).toBe("llama3.2");
	});

	it("returns openai defaults", () => {
		const defaults = getProviderDefaults("openai");
		expect(defaults.endpoint).toBe("https://api.openai.com/v1");
		expect(defaults.modelName).toBe("gpt-4o-mini");
	});

	it("returns anthropic defaults", () => {
		const defaults = getProviderDefaults("anthropic");
		expect(defaults.endpoint).toBe("https://api.anthropic.com/v1");
		expect(defaults.modelName).toBe("claude-3-5-haiku-latest");
	});

	it("returns custom defaults for unknown provider", () => {
		const defaults = getProviderDefaults("unknown");
		expect(defaults.endpoint).toBe("");
	});
});

describe("testConnection", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("handles successful Ollama connection", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				models: [{ name: "llama3.2" }, { name: "mistral" }],
			}),
		} as Response);

		const result = await testConnection(ollamaSettings);

		expect(result.success).toBe(true);
		expect(result.message).toContain("2 models available");
		expect(globalThis.fetch).toHaveBeenCalledWith(
			"http://localhost:11434/api/tags",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("handles Ollama not reachable", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			status: 500,
		} as Response);

		const result = await testConnection(ollamaSettings);

		expect(result.success).toBe(false);
		expect(result.message).toContain("Cannot connect to Ollama");
	});

	it("handles successful OpenAI connection", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
		} as Response);

		const result = await testConnection(openaiSettings);

		expect(result.success).toBe(true);
		expect(result.message).toContain("2 models available");
	});

	it("handles invalid API key (401)", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			status: 401,
		} as Response);

		const result = await testConnection(openaiSettings);

		expect(result.success).toBe(false);
		expect(result.message).toContain("Invalid API key");
	});

	it("handles network error", async () => {
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(
			new TypeError("Failed to fetch"),
		);

		const result = await testConnection(ollamaSettings);

		expect(result.success).toBe(false);
		expect(result.message).toContain("Cannot connect to LLM");
	});

	it("handles timeout", async () => {
		const abortError = new DOMException(
			"The operation was aborted",
			"AbortError",
		);
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(abortError);

		const result = await testConnection(ollamaSettings);

		expect(result.success).toBe(false);
		expect(result.message).toContain("timed out");
	});
});
