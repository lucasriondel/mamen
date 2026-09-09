import type { Transaction } from "@mamen/shared/contract";

/**
 * **Bundle / transfer-group exclusivity** (issue #75), stated once and read from
 * both sides. The two groupings decide how a row reaches the recap, and they
 * decide it differently: a **transfer leg** contributes nothing (its group nets
 * to zero and both legs vanish), a **bundle member** contributes through its
 * parent at a non-zero sum. A row holding both would be netted out by the
 * transfer partition while its parent still displayed its share — a number that
 * disagrees with itself, the one failure an accounting app cannot afford.
 *
 * Both predicates are what the server already enforces (`TransferInvalid` /
 * `is-bundled` and `BundleInvalid` / `is-transfer-leg`); they exist here so the
 * surfaces can **disable the action and say why** instead of sending a request
 * that comes back a 422. The server remains the truth — this is the explanation,
 * not the enforcement.
 */

/**
 * A row cannot be a **transfer leg** if it is already grouped, if it is a refund
 * or refund-paired (a refund nets *within* one account; grouping it would net
 * the same money out twice — PRD story 19), if it belongs to a **bundle**, or if
 * it **is** a bundle parent. A parent is refused for a second reason too: its
 * amount is derived from its members and moves with them, so a zero-sum group
 * validated at link time could silently stop summing to zero.
 *
 * The suggestion filter applies this up front so an ineligible row is never
 * offered, and the Transfer block gates on the same predicate — so what it
 * disables can never drift from what the server would refuse.
 */
export function isTransferEligible(txn: Transaction): boolean {
  return (
    txn.transferGroupId == null &&
    !txn.isRefund &&
    txn.linkedRefundId == null &&
    txn.bundleId == null &&
    txn.kind !== "bundle"
  );
}

/**
 * The mirror: a row cannot become a **bundle member** while it is a transfer
 * leg. Only that one clause — everything else a bundle refuses (already
 * bundled, nested, too few members) is a property of the *set* being bundled or
 * of the target bundle, not of the row on its own, and each is already said
 * where it is decided.
 */
export function isBundleEligible(txn: Transaction): boolean {
  return txn.transferGroupId == null;
}

/** Why a row can't join a bundle — the copy both bundling surfaces state. */
export const BUNDLE_REFUSED_REASON =
  "A transfer leg can't be bundled: its transfer already nets it out of your recap.";

/** Why a row can't be a transfer leg because of a bundle. */
export const TRANSFER_REFUSED_BUNDLE_REASON =
  "A bundled transaction can't be part of a transfer — it is already counted through the bundle that stands for it.";
