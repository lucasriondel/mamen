export type LLMProvider =
	| "ollama"
	| "lm-studio"
	| "openai"
	| "anthropic"
	| "custom";

export type LLMSettings = {
	endpoint: string;
	apiKey?: string;
	modelName: string;
	provider: LLMProvider;
	lastTestedAt?: Date;
	lastTestSuccess?: boolean;
};

export type AppSettings = {
	id: "app";
	llm: LLMSettings;
};

export type SettingKey =
	| "llm_endpoint"
	| "llm_api_key"
	| "llm_model"
	| "currency_symbol"
	| "date_format"
	| "anomaly_threshold"
	| "anomaly_settings"
	| "displayPreferences";

export type Setting = {
	id?: number;
	key: SettingKey;
	value: string;
};
