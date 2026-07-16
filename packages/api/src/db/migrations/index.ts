import createAccounts from "./0001_create_accounts";
import createCategories from "./0002_create_categories";
import createIssuers from "./0003_create_issuers";
import createTransactions from "./0004_create_transactions";
import createRules from "./0005_create_rules";
import createSubscriptions from "./0006_create_subscriptions";
import createSettings from "./0007_create_settings";
import dropRulesCategoryOverride from "./0008_drop_rules_category_override";
import addTransactionsManualIssuer from "./0009_add_transactions_manual_issuer";
import seedCategories from "./0010_seed_categories";
import dropTransactionsCategoryColumns from "./0011_drop_transactions_category_columns";
import addTransactionsNotes from "./0012_add_transactions_notes";

/**
 * The migration set, keyed `NNNN_name` (the Migrator parses the numeric prefix
 * for ordering). `fromRecord` is used over `fromFileSystem` so migrations are
 * statically imported — no runtime directory scan, works identically in the Bun
 * server and the Node-run test layer. Each resource port appends its file here.
 */
export const migrations = {
	"0001_create_accounts": createAccounts,
	"0002_create_categories": createCategories,
	"0003_create_issuers": createIssuers,
	"0004_create_transactions": createTransactions,
	"0005_create_rules": createRules,
	"0006_create_subscriptions": createSubscriptions,
	"0007_create_settings": createSettings,
	"0008_drop_rules_category_override": dropRulesCategoryOverride,
	"0009_add_transactions_manual_issuer": addTransactionsManualIssuer,
	"0010_seed_categories": seedCategories,
	"0011_drop_transactions_category_columns": dropTransactionsCategoryColumns,
	"0012_add_transactions_notes": addTransactionsNotes,
} as const;
