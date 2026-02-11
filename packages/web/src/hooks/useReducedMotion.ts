import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export const useReducedMotion = (): boolean => {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
		if (typeof matchMedia === "undefined") return false;
		return matchMedia(QUERY).matches;
	});

	useEffect(() => {
		if (typeof matchMedia === "undefined") return;

		const mql = matchMedia(QUERY);

		const handleChange = (event: MediaQueryListEvent): void => {
			setPrefersReducedMotion(event.matches);
		};

		mql.addEventListener("change", handleChange);
		return () => mql.removeEventListener("change", handleChange);
	}, []);

	return prefersReducedMotion;
};
