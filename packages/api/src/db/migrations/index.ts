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
import addTransactionsBundle from "./0020_add_transactions_bundle";
import addTransactionsManualDate from "./0021_add_transactions_manual_date";
import addAccountsColor from "./0022_add_accounts_color";
import addTransactionsAccountDateIndex from "./0023_add_transactions_account_date_index";
import addRulesMatchAccountAndSign from "./0024_add_rules_match_account_and_sign";
import createTransferDismissals from "./0025_create_transfer_dismissals";
import dropAppSettingsLlm from "./0026_drop_app_settings_llm";
import createEncryptedSecrets from "./0027_create_encrypted_secrets";
import createAiTaskSettings from "./0028_create_ai_task_settings";
import addAccountsIban from "./0029_add_accounts_iban";
import addTransactionsRawSource from "./0030_add_transactions_raw_source";
import addTransactionsCounterpartyIban from "./0031_add_transactions_counterparty_iban";
import createStatementFormats from "./0032_create_statement_formats";
import normalizeAccountsIban from "./0033_normalize_accounts_iban";

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
  "0020_add_transactions_bundle": addTransactionsBundle,
  "0021_add_transactions_manual_date": addTransactionsManualDate,
  "0022_add_accounts_color": addAccountsColor,
  "0023_add_transactions_account_date_index": addTransactionsAccountDateIndex,
  "0024_add_rules_match_account_and_sign": addRulesMatchAccountAndSign,
  "0025_create_transfer_dismissals": createTransferDismissals,
  "0026_drop_app_settings_llm": dropAppSettingsLlm,
  "0027_create_encrypted_secrets": createEncryptedSecrets,
  "0028_create_ai_task_settings": createAiTaskSettings,
  "0029_add_accounts_iban": addAccountsIban,
  "0030_add_transactions_raw_source": addTransactionsRawSource,
  "0031_add_transactions_counterparty_iban": addTransactionsCounterpartyIban,
  "0032_create_statement_formats": createStatementFormats,
  "0033_normalize_accounts_iban": normalizeAccountsIban,
} as const;
