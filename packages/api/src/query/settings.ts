import type { Setting, SettingKey } from "@mamen/shared";
import { settingsApi } from "../settings";
import { queryKeys } from "../queryKeys";
import { defineQueries, defineMutations } from "./factory";

export const settingQueries = defineQueries({
	list: {
		queryKey: () => queryKeys.settings.all,
		queryFn: () => settingsApi.getAll(),
	},
	byKey: {
		queryKey: (key: SettingKey) => ["settings", "by-key", key] as const,
		queryFn: (key: SettingKey) => settingsApi.getByKey(key),
	},
});

export const settingMutations = defineMutations({
	putByKey: {
		mutationFn: (setting: Setting) => settingsApi.putByKey(setting),
		invalidates: ["settings"],
	},
	remove: {
		mutationFn: (id: number) => settingsApi.delete(id),
		invalidates: ["settings"],
	},
	clear: {
		mutationFn: () => settingsApi.clear(),
		invalidates: ["settings"],
	},
});
