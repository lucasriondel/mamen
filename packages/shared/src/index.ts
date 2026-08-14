// Domain types. The API contract (Effect Schema) lives under `@mamen/shared/contract`.

// Deployment constant, not a domain type: where the SPA is served from. Kept
// dependency-free so a build config can import it (see `./app-base-path`).
export { APP_BASE_PATH, APP_BASE_PATH_SLASH } from "./app-base-path";
export type { Account, AccountType } from "./types/account.types";
export type {
	AnomalyFlag,
	AnomalySettings,
	AnomalyType,
} from "./types/anomaly.types";
export type {
	Category,
	CategorySelection,
	CategoryTreeNode,
	CategoryWithSubcategories,
} from "./types/category.types";
export type { Issuer } from "./types/issuer.types";
export type { Rule } from "./types/rule.types";
export type {
	AppSettings,
	LLMProvider,
	LLMSettings,
	Setting,
	SettingKey,
} from "./types/settings.types";
export type {
	Subscription,
	SubscriptionFrequency,
	SubscriptionStatus,
} from "./types/subscription.types";
export type { Transaction } from "./types/transaction.types";
