import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "./useReducedMotion";

describe("useReducedMotion", () => {
	let listeners: Array<(e: MediaQueryListEvent) => void> = [];
	let matchesValue = false;

	const mockMatchMedia = vi.fn().mockImplementation(() => ({
		matches: matchesValue,
		addEventListener: (
			_event: string,
			handler: (e: MediaQueryListEvent) => void,
		) => {
			listeners.push(handler);
		},
		removeEventListener: (
			_event: string,
			handler: (e: MediaQueryListEvent) => void,
		) => {
			listeners = listeners.filter((l) => l !== handler);
		},
	}));

	beforeEach(() => {
		listeners = [];
		matchesValue = false;
		vi.stubGlobal("matchMedia", mockMatchMedia);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("should return false when user does not prefer reduced motion", () => {
		matchesValue = false;
		const { result } = renderHook(() => useReducedMotion());
		expect(result.current).toBe(false);
	});

	it("should return true when user prefers reduced motion", () => {
		matchesValue = true;
		const { result } = renderHook(() => useReducedMotion());
		expect(result.current).toBe(true);
	});

	it("should query the correct media query", () => {
		renderHook(() => useReducedMotion());
		expect(mockMatchMedia).toHaveBeenCalledWith(
			"(prefers-reduced-motion: reduce)",
		);
	});

	it("should react to media query changes", () => {
		matchesValue = false;
		const { result } = renderHook(() => useReducedMotion());
		expect(result.current).toBe(false);

		act(() => {
			listeners.forEach((l) => {
				l({ matches: true } as MediaQueryListEvent);
			});
		});
		expect(result.current).toBe(true);

		act(() => {
			listeners.forEach((l) => {
				l({ matches: false } as MediaQueryListEvent);
			});
		});
		expect(result.current).toBe(false);
	});

	it("should clean up event listener on unmount", () => {
		const { unmount } = renderHook(() => useReducedMotion());
		expect(listeners).toHaveLength(1);
		unmount();
		expect(listeners).toHaveLength(0);
	});

	it("should return false if matchMedia is not available", () => {
		vi.stubGlobal("matchMedia", undefined);
		const { result } = renderHook(() => useReducedMotion());
		expect(result.current).toBe(false);
	});
});
