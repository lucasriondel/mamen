import { useEffect, useState } from "react";

/**
 * Return `value` delayed by `delayMs` — updates coalesce, so rapid changes only
 * settle once the input stops. Used to throttle the live Matching Rule preview:
 * every keystroke in the pattern field would otherwise fire a preview request.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);

	return debounced;
}
