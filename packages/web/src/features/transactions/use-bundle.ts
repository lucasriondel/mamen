import type { TransactionId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ruleKeys, transactionKeys, transactionMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * Every write in this file fails the same way: the tagged error's own copy, as a
 * toast. Module scope rather than inside the hook — it closes over nothing, so a
 * copy per render would be one closure per render for one constant behaviour.
 */
const onError = (error: unknown) => {
  toast.error(toErrorMessage(error));
};

/**
 * The five **bundle** mutations behind the bundle action bar, the bundle section
 * and the membership picker (issues #68, #72, #74).
 *
 * Everything about the parent is the server's to derive — the amount, the date,
 * the account — so nothing is computed here and nothing is sent optimistically:
 * a client that guessed the sum would be a second definition of what a bundle
 * totals, and the two would drift the first time a member changed.
 *
 * All five share ONE `invalidate` (issue #78), which names the transactions
 * **and** the rules key families:
 * - transactions, because that is the blast radius of every one of them — a
 *   member has left the top level of the list or returned to it, a synthetic row
 *   has joined it or gone, and the signed total under both has moved;
 * - rules, because a rule's `ownedCount` is derived from the live transactions
 *   table on every read (issue #63) and a **bundle parent is an ordinary row in
 *   it**, carrying the label the user typed as its `rawIssuerString` — the very
 *   string the matcher reads. Creating a bundle can therefore hand a rule a row
 *   it never had, and dissolving one (by hand, or by a `remove` that leaves the
 *   bundle standing for a single transaction) takes it away again.
 *
 * `setBundleDate` moves no row between rules, but it goes through the same
 * helper rather than being the one exception: the rule is stated once here, so a
 * mutation added later cannot quietly inherit the shorter list. Failures raise a
 * `sonner` toast.
 */
export function useBundle() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    queryClient.invalidateQueries({ queryKey: ruleKeys.all });
  };

  const createBundle = useMutation({
    mutationFn: ({ ids, label }: { ids: ReadonlyArray<TransactionId>; label: string }) =>
      transactionMutations.createBundle(ids, label.trim()),
    onSuccess: invalidate,
    onError,
  });

  /**
   * Override a **bundle parent**'s date (issue #72). The parent's date defaults
   * to its earliest member's — the cost belongs to when the money was spent, not
   * to when the last person settled up — but that default is a *starting point*:
   * a weekend away is dated the Friday even when a refund lands three weeks on.
   *
   * `manualDate` rides along, and that is the whole write: it is what tells the
   * derivation that this date is the user's, so the recompute every later
   * membership change runs (#74) keeps it instead of taking the members' date
   * back. Exactly the shape `manualExcluded` and `manualCategory` already have.
   *
   * The amount is deliberately absent from this surface — a bundle's cost is
   * what its members sum to, and nothing here may say otherwise.
   */
  const setBundleDate = useMutation({
    mutationFn: ({ transactionId, date }: { transactionId: TransactionId; date: Date }) =>
      transactionMutations.update(transactionId, { date, manualDate: true }),
    onSuccess: invalidate,
    onError,
  });

  /**
   * Join an existing **bundle** (issue #74). A bundle is not finished at
   * creation: the refund lands a week later, or someone pays back twice. This is
   * also the way past the table's page-scoped selection — a row hundreds of rows
   * from the rest is added from its own page, one at a time.
   *
   * Nothing is computed here: the server recomputes the parent through its one
   * derivation routine and returns it. A client that guessed the new total would
   * be the second definition of what a bundle sums to.
   */
  const addToBundle = useMutation({
    mutationFn: ({
      bundleId,
      transactionId,
    }: {
      bundleId: TransactionId;
      transactionId: TransactionId;
    }) => transactionMutations.addBundleMember(bundleId, transactionId),
    onSuccess: invalidate,
    onError,
  });

  /**
   * Leave a bundle (issue #74) — the row returns to the list as an ordinary
   * transaction, keeping the issuer, category and notes bundling never touched.
   * The server may **dissolve** the bundle in the same breath if it would be
   * left standing for a single transaction, which is why the whole key family is
   * invalidated rather than the two rows involved.
   */
  const removeFromBundle = useMutation({
    mutationFn: ({ transactionId }: { transactionId: TransactionId }) =>
      transactionMutations.removeBundleMember(transactionId),
    onSuccess: invalidate,
    onError,
  });

  /**
   * Dissolve a bundle (issue #74): the parent row goes, every member comes back
   * to the list as it was. The members are real bank rows — deleting them is
   * never what dissolving means.
   */
  const dissolveBundle = useMutation({
    mutationFn: ({ bundleId }: { bundleId: TransactionId }) =>
      transactionMutations.dissolveBundle(bundleId),
    onSuccess: invalidate,
    onError,
  });

  return {
    createBundle,
    setBundleDate,
    addToBundle,
    removeFromBundle,
    dissolveBundle,
  };
}
