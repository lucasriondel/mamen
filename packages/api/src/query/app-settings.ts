import type { AppSettings } from "@mamen/shared";
import { appSettingsApi } from "../app-settings";
import { queryKeys } from "../queryKeys";
import { defineQueries, defineMutations } from "./factory";

export const appSettingQueries = defineQueries({
	get: {
		queryKey: () => queryKeys.appSettings.all,
		queryFn: () => appSettingsApi.get(),
	},
});

export const appSettingMutations = defineMutations({
	put: {
		mutationFn: (settings: AppSettings) => appSettingsApi.put(settings),
		invalidates: ["appSettings"],
	},
	clear: {
		mutationFn: () => appSettingsApi.clear(),
		invalidates: ["appSettings"],
	},
});
