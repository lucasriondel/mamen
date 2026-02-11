import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedCounter } from "./index";

vi.mock("@/hooks/useReducedMotion", () => ({
	useReducedMotion: vi.fn(() => false),
}));

import { useReducedMotion } from "@/hooks/useReducedMotion";

describe("AnimatedCounter", () => {
	let rafCallbacks: Array<FrameRequestCallback> = [];
	let rafId = 0;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(useReducedMotion).mockReturnValue(false);
		rafCallbacks = [];
		rafId = 0;

		// Mock rAF to use a controlled callback queue
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
			rafCallbacks.push(cb);
			return ++rafId;
		});
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
			rafCallbacks = [];
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	const flushRaf = (time?: number): void => {
		const now = time ?? performance.now() + 400;
		const cbs = [...rafCallbacks];
		rafCallbacks = [];
		cbs.forEach((cb) => cb(now));
	};

	it("should display the current value", () => {
		render(<AnimatedCounter value={42} />);
		expect(screen.getByText("42")).toBeInTheDocument();
	});

	it("should apply muted-foreground color for values > 10", () => {
		const { container } = render(<AnimatedCounter value={15} />);
		const el = container.firstChild as HTMLElement;
		expect(el.className).toContain("text-muted-foreground");
	});

	it("should apply warning color for values 1-10", () => {
		const { container } = render(<AnimatedCounter value={5} />);
		const el = container.firstChild as HTMLElement;
		expect(el.className).toContain("text-amber-500");
	});

	it("should apply success color for value 0", () => {
		const { container } = render(<AnimatedCounter value={0} />);
		const el = container.firstChild as HTMLElement;
		expect(el.className).toContain("text-green-500");
	});

	it("should show checkmark icon when value is 0", () => {
		render(<AnimatedCounter value={0} />);
		expect(screen.getByLabelText("All done")).toBeInTheDocument();
	});

	it("should not show checkmark when value is > 0", () => {
		render(<AnimatedCounter value={5} />);
		expect(screen.queryByLabelText("All done")).not.toBeInTheDocument();
	});

	it("should show instant value with reduced motion", () => {
		vi.mocked(useReducedMotion).mockReturnValue(true);
		render(<AnimatedCounter value={25} />);
		expect(screen.getByText("25")).toBeInTheDocument();
	});

	it("should render with label when provided", () => {
		render(<AnimatedCounter value={7} label="Unmatched" />);
		expect(screen.getByText("Unmatched")).toBeInTheDocument();
	});

	it("should apply custom className", () => {
		const { container } = render(
			<AnimatedCounter value={5} className="custom-class" />,
		);
		const el = container.firstChild as HTMLElement;
		expect(el.className).toContain("custom-class");
	});

	it("should add counter-updating class during animation", () => {
		const { container, rerender } = render(<AnimatedCounter value={10} />);

		rerender(<AnimatedCounter value={5} />);
		const el = container.firstChild as HTMLElement;
		expect(el.className).toContain("counter-updating");

		// Flush rAF to complete animation, then advance setTimeout for cleanup
		act(() => {
			flushRaf();
		});
		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(el.className).not.toContain("counter-updating");
	});

	it("should not add counter-updating class with reduced motion", () => {
		vi.mocked(useReducedMotion).mockReturnValue(true);
		const { container, rerender } = render(<AnimatedCounter value={10} />);

		rerender(<AnimatedCounter value={5} />);
		const el = container.firstChild as HTMLElement;
		expect(el.className).not.toContain("counter-updating");
	});
});
