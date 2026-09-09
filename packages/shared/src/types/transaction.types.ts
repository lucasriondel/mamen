import type { AnomalyFlag } from "./anomaly.types";

export type Transaction = {
  id?: number;
  accountId: number;
  date: Date;
  amount: number;
  rawIssuerString: string;
  issuerId?: number;
  categoryId?: number;
  manualCategory?: boolean;
  manualIssuer?: boolean;
  isRefund?: boolean;
  linkedRefundId?: number;
  transferGroupId?: number;
  /** `"bank"` (a real imported row) or `"bundle"` (a synthetic bundle parent). */
  kind?: "bank" | "bundle";
  /** The id of the bundle parent standing for this row, when it is a member. */
  bundleId?: number;
  /** The row's `date` is the user's override, not a derived default (#72). */
  manualDate?: boolean;
  anomalyFlags?: AnomalyFlag[];
  isDuplicateExcluded?: boolean;
  duplicateNote?: string;
  excludedFromRecap?: boolean;
  manualExcluded?: boolean;
  notes?: string;
  importedAt: Date;
  importMonth: string;
  importBatchId?: string;
};
