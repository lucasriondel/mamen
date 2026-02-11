import type { Setting, SettingKey } from "@mamen/shared";
import type { BaseRepository } from "./base.port";

export type SettingRepository = BaseRepository<Setting> & {
	getByKey: (key: SettingKey) => Promise<Setting | undefined>;
	putByKey: (setting: Setting) => Promise<void>;
};
