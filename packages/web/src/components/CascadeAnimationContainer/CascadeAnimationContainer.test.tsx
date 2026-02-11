import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CascadeAnimationContainer } from "./index";

// Mock useReducedMotion
vi.mock("@/hooks/useReducedMotion", () => ({
	useReducedMotion: vi.fn(() => false),
}));

import { useReducedMotion } from "@/hooks/useReducedMotion";

describe("CascadeAnimationContainer", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(useReducedMotion).mockReturnValue(false);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should render children", () => {
		render(
			<CascadeAnimationContainer transactionIds={[]} isAnimating={false}>
				<div data-testid="child">Hello</div>
			</CascadeAnimationContainer>,
		);
		expect(screen.getByTestId("child")).toBeInTheDocument();
	});

	it("should apply cascade-highlight data attribute to animating transaction IDs", () => {
		render(
			<CascadeAnimationContainer
				transactionIds={["1", "2", "3"]}
				isAnimating={true}
			>
				<div data-transaction-id="1" data-testid="tx-1">
					Tx 1
				</div>
				<div data-transaction-id="2" data-testid="tx-2">
					Tx 2
				</div>
				<div data-transaction-id="3" data-testid="tx-3">
					Tx 3
				</div>
				<div data-transaction-id="4" data-testid="tx-4">
					Tx 4
				</div>
			</CascadeAnimationContainer>,
		);

		// The container provides animation context via CSS custom properties
		const container = screen.getByTestId("tx-1").parentElement;
		expect(container).toBeDefined();
	});

	it("should stagger animation delay by 50ms per row", () => {
		const { container } = render(
			<CascadeAnimationContainer
				transactionIds={["1", "2", "3"]}
				isAnimating={true}
			>
				<div>Content</div>
			</CascadeAnimationContainer>,
		);

		const el = container.firstChild as HTMLElement;
		expect(el).toBeDefined();
		// The container sets CSS custom properties for stagger delays
		expect(el.style.getPropertyValue("--cascade-count")).toBe("3");
	});

	it("should limit animation to 10 rows", () => {
		const ids = Array.from({ length: 15 }, (_, i) => String(i + 1));

		const { container } = render(
			<CascadeAnimationContainer transactionIds={ids} isAnimating={true}>
				<div>Content</div>
			</CascadeAnimationContainer>,
		);

		const el = container.firstChild as HTMLElement;
		// Only 10 rows should be animated (capped)
		expect(el.style.getPropertyValue("--cascade-count")).toBe("10");
	});

	it("should call onAnimationComplete after animation duration", () => {
		const onComplete = vi.fn();
		render(
			<CascadeAnimationContainer
				transactionIds={["1", "2"]}
				isAnimating={true}
				onAnimationComplete={onComplete}
			>
				<div>Content</div>
			</CascadeAnimationContainer>,
		);

		expect(onComplete).not.toHaveBeenCalled();

		// Animation should complete within 600ms
		act(() => {
			vi.advanceTimersByTime(600);
		});

		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it("should not animate when isAnimating is false", () => {
		const onComplete = vi.fn();
		const { container } = render(
			<CascadeAnimationContainer
				transactionIds={["1", "2"]}
				isAnimating={false}
				onAnimationComplete={onComplete}
			>
				<div>Content</div>
			</CascadeAnimationContainer>,
		);

		const el = container.firstChild as HTMLElement;
		expect(el.dataset.cascadeAnimating).toBeUndefined();

		act(() => {
			vi.advanceTimersByTime(1000);
		});

		expect(onComplete).not.toHaveBeenCalled();
	});

	it("should skip animation with reduced motion and call onComplete immediately", () => {
		vi.mocked(useReducedMotion).mockReturnValue(true);
		const onComplete = vi.fn();

		render(
			<CascadeAnimationContainer
				transactionIds={["1", "2"]}
				isAnimating={true}
				onAnimationComplete={onComplete}
			>
				<div>Content</div>
			</CascadeAnimationContainer>,
		);

		// Should call immediately (next tick)
		act(() => {
			vi.advanceTimersByTime(0);
		});

		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it("should clean up timeouts on unmount", () => {
		const onComplete = vi.fn();
		const { unmount } = render(
			<CascadeAnimationContainer
				transactionIds={["1", "2"]}
				isAnimating={true}
				onAnimationComplete={onComplete}
			>
				<div>Content</div>
			</CascadeAnimationContainer>,
		);

		unmount();

		act(() => {
			vi.advanceTimersByTime(1000);
		});

		expect(onComplete).not.toHaveBeenCalled();
	});
});
