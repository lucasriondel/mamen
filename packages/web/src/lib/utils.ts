import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind conflict resolution.
 *
 * gousse ships its own `cn`, but it arrived through the npm package that is no
 * longer a dependency (#96) and its registry items import `@/lib/utils`
 * anyway — so this is the single source, for mamen's components and the
 * vendored gousse ones alike.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * A URL/DB-safe slug derived from a free-text name — lowercased, accent-folded,
 * non-alphanumerics collapsed to single hyphens, trimmed. Shared by the category
 * create flows (picker + categories page), which both mint a slug from a name.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The empty list a query falls back to before its data arrives.
 *
 * One shared value rather than a fresh `[]` per render: every `?? []` in a view
 * mints a new array each pass, and each of those is a dependency of a `useMemo`
 * that then recomputes for as long as the query is pending — the churn oxlint's
 * `exhaustive-deps` names as "changes every render". Typed `never[]` so it can
 * stand in for a list of anything without a cast of its own.
 */
export const NO_ITEMS: readonly never[] = [];

/** Index a list of `{ id }` entities by their numeric id for O(1) lookups. */
export function indexById<T extends { id: number }>(items: readonly T[]): Map<number, T> {
  return new Map(items.map((item) => [item.id, item]));
}
