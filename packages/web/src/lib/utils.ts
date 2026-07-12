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
