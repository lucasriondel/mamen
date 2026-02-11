import type { Account } from "@mamen/shared";
import type { BaseRepository } from "./base.port";

export type AccountRepository = BaseRepository<Account> & {
	getByName: (name: string) => Promise<Account | undefined>;
	getByType: (type: string) => Promise<Account[]>;
};
