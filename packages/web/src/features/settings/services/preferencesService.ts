import { invalidateEntity, settingsApi } from "@/lib/api";
import type { DisplayPreferences } from "../types/preferences.types";
import { DEFAULT_DISPLAY_PREFERENCES } from "../types/preferences.types";

export const getDisplayPreferences = async (): Promise<DisplayPreferences> => {
	try {
		const record = await settingsApi.getByKey("displayPreferences");
		return { ...DEFAULT_DISPLAY_PREFERENCES, ...JSON.parse(record.value) };
	} catch {
		return DEFAULT_DISPLAY_PREFERENCES;
	}
};

export const updateDisplayPreferences = async (
	prefs: Partial<DisplayPreferences>,
): Promise<void> => {
	const current = await getDisplayPreferences();
	const merged = { ...current, ...prefs };
	await settingsApi.putByKey({
		key: "displayPreferences",
		value: JSON.stringify(merged),
	});
	invalidateEntity("settings");
};
