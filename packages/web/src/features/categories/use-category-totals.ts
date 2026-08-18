import type { Category, CategoryId } from "@mamen/shared/contract";
import { useQueries } from "@tanstack/react-query";
import { descendantIds } from "@/lib/category-tree";
import { transactionQueries } from "@/lib/sdk";

/**
 * A **Category total** for *every* node, folder and leaf alike, keyed by id.
 *
 * The page used to total only folders, because only a folder's heading showed a
 * number — which left the rows that actually hold the money as the ones with
 * nothing to show. Every row carries its amount now, so every node needs a
 * total.
 *
 * The rule is the same at both kinds, and it is ADR 0003's: a node's total is
 * the money on every **leaf** in its subtree. For a folder that is a real
 * recursive descent ({@link descendantIds}); for a leaf the subtree is itself,
 * so it counts its own id. Intermediate folders hold no money of their own —
 * assignability is childlessness — so nothing is double-counted either way.
 *
 * **The cost, stated plainly:** this is one `count` request per category, where
 * the old code issued one per folder. A thirty-category tree goes from ~6
 * requests to ~30. That is deliberate but not free, and the honest fix is a
 * server-side endpoint returning totals keyed by category in one round trip —
 * the `count` shape is already most of the way there. It is isolated in this
 * hook precisely so that swap stays a one-file change: the caller only ever sees
 * `Map<CategoryId, number>`. They fan out under one key family and TanStack
 * dedupes and caches them, so the practical cost is a burst on cold load, not
 * per-render traffic.
 */
export function useCategoryTotals(categories: readonly Category[]): Map<CategoryId, number> {
  // The id set each node sums over, resolved once per node. A leaf's set is
  // itself; a folder's is its leaves at any depth. Either way it is the set the
  // `count` endpoint takes (ADR 0002) — one id set, one query, any depth.
  const scopes = categories.map((category) => {
    const leaves = descendantIds(categories, category.id);
    return {
      id: category.id,
      ids: leaves.length > 0 ? leaves : [category.id],
    };
  });

  const totals = useQueries({
    queries: scopes.map((scope) =>
      transactionQueries.count({
        categoryId: scope.ids,
      }),
    ),
  });

  return new Map(scopes.map((scope, index) => [scope.id, totals[index]?.data?.total ?? 0]));
}
