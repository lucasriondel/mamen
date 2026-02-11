import type { LLMSettings } from "@/types";

export type TestConnectionResult = {
	success: boolean;
	message: string;
	modelInfo?: string;
};

export type LLMChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type LLMChatResponse = {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
};

const PROVIDER_DEFAULTS: Record<string, Partial<LLMSettings>> = {
	ollama: {
		endpoint: "http://localhost:11434/v1",
		modelName: "llama3.2",
	},
	"lm-studio": {
		endpoint: "http://localhost:1234/v1",
		modelName: "",
	},
	openai: {
		endpoint: "https://api.openai.com/v1",
		modelName: "gpt-4o-mini",
	},
	anthropic: {
		endpoint: "https://api.anthropic.com/v1",
		modelName: "claude-3-5-haiku-latest",
	},
	custom: {
		endpoint: "",
		modelName: "",
	},
};

export const getProviderDefaults = (provider: string): Partial<LLMSettings> => {
	return PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.custom;
};

export const MODEL_SUGGESTIONS: Record<string, string[]> = {
	ollama: [
		"llama3.2",
		"llama3.1",
		"mistral",
		"mistral-nemo",
		"qwen2.5",
		"qwen2.5-coder",
		"deepseek-r1",
		"phi-4",
	],
	"lm-studio": [],
	openai: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "gpt-4-turbo"],
	anthropic: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
	custom: [],
};

export const isLLMConfigured = (settings?: LLMSettings): boolean => {
	if (!settings) return false;
	if (!settings.endpoint || !settings.modelName) return false;
	const needsKey =
		settings.provider !== "ollama" && settings.provider !== "lm-studio";
	if (needsKey && !settings.apiKey) return false;
	return true;
};

export const getLLMError = (settings?: LLMSettings): string | null => {
	if (!settings) return "LLM not configured. Set up in Settings first.";
	if (!settings.endpoint) return "LLM endpoint not configured.";
	if (!settings.modelName) return "LLM model not selected.";
	const needsKey =
		settings.provider !== "ollama" && settings.provider !== "lm-studio";
	if (needsKey && !settings.apiKey)
		return "API key required for cloud providers.";
	return null;
};

const getBaseUrl = (endpoint: string): string => {
	return endpoint.replace(/\/v1\/?$/, "");
};

export const testConnection = async (
	settings: LLMSettings,
): Promise<TestConnectionResult> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000);

	try {
		if (settings.provider === "ollama") {
			const baseUrl = getBaseUrl(settings.endpoint);
			const response = await fetch(`${baseUrl}/api/tags`, {
				signal: controller.signal,
			});
			if (!response.ok)
				return {
					success: false,
					message: "Cannot connect to Ollama. Check if it's running.",
				};
			const data = await response.json();
			const models = (data.models ?? []).map((m: { name: string }) => m.name);
			return {
				success: true,
				message: `Connected to Ollama. ${models.length} models available.`,
				modelInfo: models.join(", "),
			};
		}

		const headers: Record<string, string> = {};
		if (settings.apiKey) {
			headers.Authorization = `Bearer ${settings.apiKey}`;
		}

		const response = await fetch(`${settings.endpoint}/models`, {
			headers,
			signal: controller.signal,
		});

		if (!response.ok) {
			if (response.status === 401) {
				return {
					success: false,
					message: "Invalid API key. Check your key in settings.",
				};
			}
			return {
				success: false,
				message: `API returned status ${response.status}`,
			};
		}

		const data = await response.json();
		const modelCount = data.data?.length ?? 0;
		return {
			success: true,
			message: `Connected successfully. ${modelCount} models available.`,
		};
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return {
				success: false,
				message: "Connection timed out. LLM may be overloaded.",
			};
		}
		return {
			success: false,
			message: "Cannot connect to LLM. Check if it's running.",
		};
	} finally {
		clearTimeout(timeoutId);
	}
};

export const createLLMClient = (settings: LLMSettings) => {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (settings.apiKey) {
		headers.Authorization = `Bearer ${settings.apiKey}`;
	}

	return {
		chat: async (messages: LLMChatMessage[]): Promise<LLMChatResponse> => {
			const response = await fetch(`${settings.endpoint}/chat/completions`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					model: settings.modelName,
					messages,
				}),
			});

			if (!response.ok) {
				if (response.status === 401) throw new Error("Invalid API key");
				throw new Error(`LLM request failed with status ${response.status}`);
			}

			return response.json();
		},
	};
};
