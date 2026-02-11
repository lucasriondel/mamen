import type { Database } from "bun:sqlite";
import type {
	AccountRepository,
	AppSettingsRepository,
	CategoryRepository,
	MerchantRepository,
	RuleRepository,
	SettingRepository,
	SubscriptionRepository,
	TransactionRepository,
	UnitOfWork,
} from "../../ports";
import { createAccountAdapter } from "./account.adapter";
import { createAppSettingsAdapter } from "./app-settings.adapter";
import { createCategoryAdapter } from "./category.adapter";
import { createMerchantAdapter } from "./merchant.adapter";
import { createRuleAdapter } from "./rule.adapter";
import { createSettingAdapter } from "./setting.adapter";
import { createSubscriptionAdapter } from "./subscription.adapter";
import { createTransactionAdapter } from "./transaction.adapter";
import { createUnitOfWork } from "./unit-of-work.adapter";

export type DatabaseInstance = {
	accounts: AccountRepository;
	transactions: TransactionRepository;
	merchants: MerchantRepository;
	rules: RuleRepository;
	settings: SettingRepository;
	appSettings: AppSettingsRepository;
	categories: CategoryRepository;
	subscriptions: SubscriptionRepository;
	unitOfWork: UnitOfWork;
};

export const createDatabase = (db: Database): DatabaseInstance => ({
	accounts: createAccountAdapter(db),
	transactions: createTransactionAdapter(db),
	merchants: createMerchantAdapter(db),
	rules: createRuleAdapter(db),
	settings: createSettingAdapter(db),
	appSettings: createAppSettingsAdapter(db),
	categories: createCategoryAdapter(db),
	subscriptions: createSubscriptionAdapter(db),
	unitOfWork: createUnitOfWork(db),
});
