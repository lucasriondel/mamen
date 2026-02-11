import type { AppSettings } from "@mamen/shared";

export type AppSettingsRepository = {
	get: () => Promise<AppSettings | undefined>;
	put: (settings: AppSettings) => Promise<void>;
	clear: () => Promise<void>;
};
