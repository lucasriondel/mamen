import type { Rule } from "@mamen/shared";
import type { BaseRepository } from "./base.port";

export type RuleRepository = BaseRepository<Rule> & {
	getByMerchantId: (merchantId: number) => Promise<Rule[]>;
	countByMerchantId: (merchantId: number) => Promise<number>;
	getByMerchantIdAndPattern: (
		merchantId: number,
		pattern: string,
	) => Promise<Rule | undefined>;
};
