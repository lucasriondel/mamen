/**
 * The app's single entry point for server state.
 *
 * All reads/writes flow through `@mamen/sdk` (`queryOptions` + mutation fns)
 * layered over TanStack Query — there is no local database and no client-side
 * LLM (PRD). Feature modules import query/mutation factories from here so the
 * dependency surface is centralized and easy to mock at the SDK seam in tests
 * (`vi.mock("@mamen/sdk")`).
 */
export {
  accountKeys,
  accountMutations,
  accountQueries,
  aiTaskKeys,
  aiTaskMutations,
  aiTaskQueries,
  type BundleImpactParams,
  type CategoryListParams,
  categoryKeys,
  categoryMutations,
  categoryQueries,
  ISSUER_SCAN_LIMIT,
  ISSUER_SEARCH_LIMIT,
  type IssuerListParams,
  importMutations,
  issuerKeys,
  issuerMutations,
  issuerQueries,
  type RecapParams,
  type RecapTrendParams,
  type RuleCountParams,
  type RuleListParams,
  ruleKeys,
  ruleMutations,
  ruleQueries,
  secretKeys,
  secretMutations,
  secretQueries,
  statementFormatKeys,
  statementFormatQueries,
  type TransactionCountParams,
  type TransactionListParams,
  transactionKeys,
  transactionMutations,
  transactionQueries,
} from "@mamen/sdk";
