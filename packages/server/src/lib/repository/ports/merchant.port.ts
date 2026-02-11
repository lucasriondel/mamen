import type { Merchant } from "@mamen/shared";
import type { BaseRepository } from "./base.port";

export type MerchantRepository = BaseRepository<Merchant> & {
	getByName: (name: string) => Promise<Merchant | undefined>;
	getByNameCaseInsensitive: (name: string) => Promise<Merchant | undefined>;
	getAllOrderedByName: () => Promise<Merchant[]>;
};
