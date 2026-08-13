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

/** Index a list of `{ id }` entities by their numeric id for O(1) lookups. */
export function indexById<T extends { id: number }>(
	items: readonly T[],
): Map<number, T> {
	return new Map(items.map((item) => [item.id, item]));
}
