import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useBreadcrumbs } from "./useBreadcrumbs";

export function useBreadcrumbNavigation(): void {
	const segments = useBreadcrumbs();
	const navigate = useNavigate();

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (event.key !== "Backspace") return;

			const target = event.target as HTMLElement;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target.isContentEditable
			) {
				return;
			}

			if (segments.length > 1) {
				event.preventDefault();
				const parentSegment = segments[segments.length - 2];
				if (parentSegment.href) {
					navigate({ to: parentSegment.href });
				}
			}
		},
		[segments, navigate],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);
}
