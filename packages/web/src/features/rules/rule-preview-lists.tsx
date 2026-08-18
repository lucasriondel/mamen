import type { Issuer, RulePreviewResult, Transaction } from "@mamen/shared/contract";
import { TransactionPreviewList } from "./transaction-preview-list";

export interface RulePreviewListsProps {
  preview: RulePreviewResult;
  issuersById: ReadonlyMap<number, Issuer>;
  /** Per-row "remove manual issuer" action for the manual-collision rows. */
  renderManualAction?: (transaction: Transaction) => React.ReactNode;
}

/**
 * The Matching Rule preview's **three lists** (PRD #8 stories 7–11), scoped to
 * one rule's pattern:
 *
 * - **will match** — currently-unmatched rows this rule claims;
 * - **will reassign** — rows another issuer's rule owns that this rule now wins;
 * - **manual collisions** — rows matching the pattern but assigned by hand, left
 *   untouched by default (each offers a per-row "remove manual issuer" action).
 *
 * When the pattern is an invalid regex the server reports `skipped`; all three
 * lists come back empty and we show a hint rather than a silent blank (story 19).
 */
export function RulePreviewLists({
  preview,
  issuersById,
  renderManualAction,
}: RulePreviewListsProps) {
  if (preview.skipped) {
    return (
      <output className="text-sm text-gousse-high">
        That pattern isn’t a valid regular expression — it will be skipped and match nothing.
      </output>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TransactionPreviewList
        title="Will match"
        description="Currently-unmatched transactions this rule will claim."
        transactions={preview.willMatch}
        issuersById={issuersById}
        issuerPrefix="→ "
      />
      <TransactionPreviewList
        title="Will reassign"
        description="Transactions another issuer's rule owns that this rule will win."
        transactions={preview.willReassign}
        issuersById={issuersById}
        issuerPrefix="→ "
      />
      <TransactionPreviewList
        title="Manual collisions"
        description="Hand-assigned transactions matching this pattern — left untouched unless you remove their manual issuer."
        transactions={preview.manualCollisions}
        issuersById={issuersById}
        issuerPrefix="→ "
        renderAction={renderManualAction}
      />
    </div>
  );
}
