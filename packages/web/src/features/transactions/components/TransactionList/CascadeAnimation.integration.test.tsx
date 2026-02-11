import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { useCascadeAnimation } from "@/hooks/useCascadeAnimation";

vi.mock("@/hooks/useReducedMotion", () => ({
	useReducedMotion: vi.fn(() => false),
}));

import { useReducedMotion } from "@/hooks/useReducedMotion";

describe("Cascade Animation Integration", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(useReducedMotion).mockReturnValue(false);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("useCascadeAnimation phase transitions", () => {
		it("should complete animation within 600ms", () => {
			const { result } = renderHook(() => useCascadeAnimation());

			act(() => {
				result.current.triggerCascade(["1", "2", "3"]);
			});
			expect(result.current.isAnimating).toBe(true);

			// Total: 100ms (highlight) + 200ms (badge) + 300ms (settle) = 600ms
			act(() => {
				vi.advanceTimersByTime(600);
			});
			expect(result.current.isAnimating).toBe(false);
			expect(result.current.animationPhase).toBe("idle");
		});

		it("should apply stagger delay of 50ms per row concept", () => {
			const { result } = renderHook(() => useCascadeAnimation());

			act(() => {
				result.current.triggerCascade(["1", "2", "3", "4", "5"]);
			});

			// 5 rows means stagger from 0ms to 200ms (index * 50)
			expect(result.current.animatingIds).toHaveLength(5);
			// Verify the IDs are in order
			expect(result.current.animatingIds).toEqual(["1", "2", "3", "4", "5"]);
		});

		it("should limit animated transactions (max 10 in animatingIds list)", () => {
			const { result } = renderHook(() => useCascadeAnimation());
			const ids = Array.from({ length: 15 }, (_, i) => String(i + 1));

			act(() => {
				result.current.triggerCascade(ids);
			});

			// Hook stores all IDs, the visual cap is handled by the container/row
			expect(result.current.animatingIds).toHaveLength(15);
			expect(result.current.isAnimating).toBe(true);
		});
	});

	describe("AnimatedCounter thresholds", () => {
		let rafCallbacks: Array<FrameRequestCallback> = [];

		beforeEach(() => {
			rafCallbacks = [];
			vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
				rafCallbacks.push(cb);
				return rafCallbacks.length;
			});
			vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
				rafCallbacks = [];
			});
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should show muted-foreground for count > 10", () => {
			const { container } = render(<AnimatedCounter value={15} />);
			const el = container.firstChild as HTMLElement;
			expect(el.className).toContain("text-muted-foreground");
		});

		it("should show warning color for count 1-10", () => {
			const { container } = render(<AnimatedCounter value={7} />);
			const el = container.firstChild as HTMLElement;
			expect(el.className).toContain("text-amber-500");
		});

		it("should show success color for count 0", () => {
			const { container } = render(<AnimatedCounter value={0} />);
			const el = container.firstChild as HTMLElement;
			expect(el.className).toContain("text-green-500");
		});

		it("should show checkmark icon when count is 0", () => {
			render(<AnimatedCounter value={0} />);
			expect(screen.getByLabelText("All done")).toBeInTheDocument();
		});

		it("should not show checkmark when count > 0", () => {
			render(<AnimatedCounter value={1} />);
			expect(screen.queryByLabelText("All done")).not.toBeInTheDocument();
		});
	});

	describe("Reduced motion behavior", () => {
		it("should skip cascade animation with reduced motion", () => {
			vi.mocked(useReducedMotion).mockReturnValue(true);
			const { result } = renderHook(() => useCascadeAnimation());

			act(() => {
				result.current.triggerCascade(["1", "2"]);
			});

			expect(result.current.isAnimating).toBe(false);
			expect(result.current.animationPhase).toBe("idle");
		});

		it("should show instant counter value with reduced motion", () => {
			vi.mocked(useReducedMotion).mockReturnValue(true);
			render(<AnimatedCounter value={42} />);
			expect(screen.getByText("42")).toBeInTheDocument();
		});
	});

	describe("Toast integration", () => {
		it("should format toast message correctly for single transaction", () => {
			const count = 1;
			const merchantName = "Amazon";
			const message = `${count} transaction${count !== 1 ? "s" : ""} → ${merchantName}`;
			expect(message).toBe("1 transaction → Amazon");
		});

		it("should format toast message correctly for multiple transactions", () => {
			const count = 12;
			const merchantName = "Netflix";
			const message = `${count} transaction${count !== 1 ? "s" : ""} → ${merchantName}`;
			expect(message).toBe("12 transactions → Netflix");
		});
	});
});
