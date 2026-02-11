import type { AppSettings } from "@mamen/shared";
import { api } from "./client";

export const appSettingsApi = {
	get: () => api.get<AppSettings>("/app-settings"),

	put: async (settings: AppSettings) => {
		await api.put("/app-settings", settings);
	},

	clear: async () => {
		await api.post("/app-settings/clear");
	},
};
