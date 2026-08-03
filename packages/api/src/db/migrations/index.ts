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
import addRulesMatchValue from "./0013_add_rules_match_value";
import addTransactionsTransferGroup from "./0014_add_transactions_transfer_group";
import categoryColourInheritLucideIcons from "./0015_category_colour_inherit_lucide_icons";
import addIssuersNotes from "./0016_add_issuers_notes";
import dropRulesMatchCount from "./0017_drop_rules_match_count";
import addTransactionsRecapExclusion from "./0018_add_transactions_recap_exclusion";
import addIssuersRecapExclusion from "./0019_add_issuers_recap_exclusion";

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
	"0013_add_rules_match_value": addRulesMatchValue,
	"0014_add_transactions_transfer_group": addTransactionsTransferGroup,
	"0015_category_colour_inherit_lucide_icons": categoryColourInheritLucideIcons,
	"0016_add_issuers_notes": addIssuersNotes,
	"0017_drop_rules_match_count": dropRulesMatchCount,
	"0018_add_transactions_recap_exclusion": addTransactionsRecapExclusion,
	"0019_add_issuers_recap_exclusion": addIssuersRecapExclusion,
} as const;
