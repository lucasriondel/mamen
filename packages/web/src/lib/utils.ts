import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind conflict resolution.
 *
 * `@lucasriondel/gousse-ui` ships its own `cn`; the issue explicitly allows a
 * local one. This is the local implementation used across the app. Swap to a
 * re-export of gousse's `cn` if/when a single source is preferred.
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
