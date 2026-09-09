// The `LLMSettings` block and the three `llm_*` keys were deleted with the rest
// of the dead LLM settings surface (issue #116). The contract under
// `../contract/` is the live definition of both shapes; these types mirror it.

export type AppSettings = {
  id: "app";
};

export type SettingKey =
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
