// Domain types. The API contract (Effect Schema) lives under `@mamen/shared/contract`.

// Deployment constant, not a domain type: where the SPA is served from. Kept
// dependency-free so a build config can import it (see `./app-base-path`).
export { APP_BASE_PATH, APP_BASE_PATH_SLASH } from "./app-base-path.ts";
// The ports mamen binds, mamen's rows of the machine's registry (see
// `./ports`). Dependency-free for the same reason, and reachable on its own
// path so a build config need not pull the contract in behind a number.
export {
	API_DEV_PORT,
	DEMO_STACK_API_PORT,
	DEMO_STACK_WEB_PORT,
	DOCKER_HOST_PORT_FLOOR,
	LANDING_PAGE_DEV_PORT,
	PORT_TAKEN_ELSEWHERE,
	PORTS,
	type PortKind,
	type PortRow,
	portsOfKind,
	WEB_DEV_PORT,
} from "./ports.ts";
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
	Setting,
	SettingKey,
} from "./types/settings.types";
export type {
	Subscription,
	SubscriptionFrequency,
	SubscriptionStatus,
} from "./types/subscription.types";
export type { Transaction } from "./types/transaction.types";
