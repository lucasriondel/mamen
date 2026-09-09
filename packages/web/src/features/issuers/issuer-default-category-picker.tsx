import type { Issuer } from "@mamen/shared/contract";
import { CategoryLeafPicker } from "./category-leaf-picker";
import { useIssuerMutations } from "./use-issuer-mutations";

/**
 * The **Issuer default category** picker on the issuer detail page (PRD #19,
 * issue #22) — the bulk lever the Derived category model runs on. Setting an
 * issuer's default recategorises its whole non-overridden history at once; the
 * category is read *through* the issuer at query time, never copied onto a row.
 *
 * A thin wrapper over the controlled {@link CategoryLeafPicker}: it holds no
 * draft, writing each selection straight through `setDefaultCategory` (the
 * detail page's per-field write-on-action UX). A folder is impossible to pick —
 * the picker offers leaves only — and a folder id would be rejected by the API
 * (`CategoryNotLeaf`) and surface as a toast anyway.
 */
export function IssuerDefaultCategoryPicker({
  issuer,
  triggerClassName,
}: {
  issuer: Issuer;
  /**
   * Extra classes for the picker's trigger. The detail page's header renders it
   * as one chip in a row of them, where the default `self-start` would leave it
   * out of line with its neighbour.
   */
  triggerClassName?: string;
}) {
  const { setDefaultCategory } = useIssuerMutations();

  return (
    <CategoryLeafPicker
      value={issuer.defaultCategoryId}
      onChange={(categoryId) => setDefaultCategory.mutate({ id: issuer.id, categoryId })}
      disabled={setDefaultCategory.isPending}
      title="Set this issuer's default category"
      selectedLabel="Current default"
      clearLabel="Remove default category"
      triggerClassName={triggerClassName}
    />
  );
}
