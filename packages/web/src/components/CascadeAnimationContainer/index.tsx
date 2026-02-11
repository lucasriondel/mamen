import { useEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const MAX_ANIMATED_ROWS = 10;
const ANIMATION_DURATION_MS = 600;

export type CascadeAnimationContainerProps = {
	transactionIds: string[];
	isAnimating: boolean;
	onAnimationComplete?: () => void;
	children: React.ReactNode;
};

export function CascadeAnimationContainer({
	transactionIds,
	isAnimating,
	onAnimationComplete,
	children,
}: CascadeAnimationContainerProps): React.ReactElement {
	const prefersReducedMotion = useReducedMotion();
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const animatedCount = useMemo(
		() => Math.min(transactionIds.length, MAX_ANIMATED_ROWS),
		[transactionIds.length],
	);

	const animatedIdSet = useMemo(
		() => new Set(transactionIds.slice(0, MAX_ANIMATED_ROWS)),
		[transactionIds],
	);

	useEffect(() => {
		if (!isAnimating || transactionIds.length === 0) return;

		if (prefersReducedMotion) {
			timerRef.current = setTimeout(() => {
				onAnimationComplete?.();
			}, 0);
			return () => {
				if (timerRef.current !== null) clearTimeout(timerRef.current);
			};
		}

		timerRef.current = setTimeout(() => {
			onAnimationComplete?.();
		}, ANIMATION_DURATION_MS);

		return () => {
			if (timerRef.current !== null) clearTimeout(timerRef.current);
		};
	}, [
		isAnimating,
		transactionIds.length,
		prefersReducedMotion,
		onAnimationComplete,
	]);

	const style = isAnimating
		? ({
				"--cascade-count": String(animatedCount),
				"--cascade-ids": transactionIds.slice(0, MAX_ANIMATED_ROWS).join(","),
			} as React.CSSProperties)
		: undefined;

	return (
		<div
			style={style}
			data-cascade-animating={isAnimating ? "" : undefined}
			data-cascade-reduced={prefersReducedMotion ? "" : undefined}
			data-cascade-ids={isAnimating ? [...animatedIdSet].join(",") : undefined}
		>
			{children}
		</div>
	);
}
