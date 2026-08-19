import type { Issuer } from "@mamen/shared/contract";
import { Checkbox } from "@/components/ui/checkbox";
import { useIssuerMutations } from "./use-issuer-mutations";

/**
 * The **Recap** cell — the issuer-level recap-exclusion lever, in the grid
 * rather than only on the issuer detail page (the
 * {@link IssuerRecapChip} in the detail page's header). Same write, same two directions:
 * ticking holds every one of the issuer's transactions out of the spend totals
 * — including the ones imported from now on — and unticking puts them back
 * (issue #69, ADR 0008).
 *
 * Ticked means *excluded*, matching the transactions grid's **Excluded** column
 * rather than inverting to "counts in recap": the two levers are the same
 * question at two scales, and reading opposite ways in two grids is how a sweep
 * down one page becomes a mistake on the other.
 *
 * Transactions the user decided by hand keep their own state — `manualExcluded`
 * wins over this default either way — so this box is a default, not an
 * overwrite. The `title` says so; the column header has no room to.
 *
 * A checkbox rather than the read-only badge the Category cell uses: exclusion
 * is the one issuer field that is a yes/no the user sweeps across many rows, and
 * making it a trip into each issuer's page is what the bulk lever exists to
 * avoid. Named by `aria-label` — the control has no room for text beside it.
 */
export function IssuerRecapCell({ issuer }: { issuer: Issuer }) {
  const { setExcludedFromRecap } = useIssuerMutations();
  const isExcluded = issuer.excludedFromRecap === true;

  return (
    <Checkbox
      checked={isExcluded}
      disabled={setExcludedFromRecap.isPending}
      onChange={() =>
        setExcludedFromRecap.mutate({
          id: issuer.id,
          excluded: !isExcluded,
        })
      }
      aria-label={
        isExcluded ? `Include ${issuer.name} in recap` : `Exclude ${issuer.name} from recap`
      }
      title={
        isExcluded
          ? "This issuer's transactions are excluded from your recap spend — untick to count them again. Transactions you decided by hand keep their own state."
          : "This issuer's transactions count toward your recap spend — tick to exclude them. Transactions you decided by hand keep their own state."
      }
      className="align-middle"
    />
  );
}
