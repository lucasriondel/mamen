import type {
	Account,
	AppSettings,
	Category,
	Merchant,
	Rule,
	Setting,
	Subscription,
	Transaction,
} from "@/types";

export type ExportMetadata = {
	exportDate: string;
	appVersion: string;
	exportFormat: string;
	recordCounts: {
		accounts: number;
		transactions: number;
		merchants: number;
		rules: number;
		categories: number;
		subscriptions: number;
		settings: number;
		appSettings: number;
	};
};

export type ExportData = {
	metadata: ExportMetadata;
	accounts: Account[];
	transactions: Transaction[];
	merchants: Merchant[];
	rules: Rule[];
	categories: Category[];
	subscriptions: Subscription[];
	settings: Setting[];
	appSettings: AppSettings[];
};

export type ExportOptions = {
	includeAccounts: boolean;
	includeTransactions: boolean;
	includeMerchants: boolean;
	includeRules: boolean;
	includeCategories: boolean;
	includeSubscriptions: boolean;
	includeSettings: boolean;
};
