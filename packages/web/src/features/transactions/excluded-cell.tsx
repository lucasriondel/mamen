import type { Transaction } from "@mamen/shared/contract";
import { Checkbox } from "@/components/ui/checkbox";
import { useRecapExclusion } from "./use-recap-exclusion";

/**
 * The **Excluded** cell — the per-row recap-exclusion lever, in the grid rather
 * than only on the detail page (the {@link RecapExclusionSection} block). Same
 * one gesture in two directions, same write: ticking holds the row out of every
 * spend total, unticking puts the money back, and both stamp `manualExcluded`
 * (see {@link useRecapExclusion}) so the decision is the *user's* either way and
 * survives its issuer's default changing later (ADR 0008).
 *
 * The box shows the row's **derived** exclusion — the wire hands one answer
 * whether the row was flagged by hand or inherited its issuer's default, and
 * this cell never re-derives it. So an inherited exclusion reads as ticked, and
 * unticking it is a deliberate re-inclusion of that one row, exactly as the
 * detail page's button is.
 *
 * A checkbox, not a badge: it is the same yes/no the recap asks of every row,
 * and putting it in the grid is what makes exclusion a sweep down a page rather
 * than a trip into each row. Named by `aria-label` — the column is a control
 * with no room for text beside it, and the header carries the visible name.
 */
export function ExcludedCell({ transaction }: { transaction: Transaction }) {
  const { setExcluded } = useRecapExclusion();
  const isExcluded = transaction.excludedFromRecap === true;

  return (
    <Checkbox
      checked={isExcluded}
      disabled={setExcluded.isPending}
      onChange={() =>
        setExcluded.mutate({
          transactionId: transaction.id,
          excluded: !isExcluded,
        })
      }
      aria-label={
        isExcluded
          ? `Include ${transaction.rawIssuerString} in recap`
          : `Exclude ${transaction.rawIssuerString} from recap`
      }
      title={
        isExcluded
          ? "Excluded from your recap spend — untick to count it again"
          : "Counts toward your recap spend — tick to exclude it"
      }
      className="align-middle"
    />
  );
}
