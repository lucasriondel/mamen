import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTimePeriod } from "./useTimePeriod";

describe("useTimePeriod", () => {
	it('defaults to "this-month"', () => {
		const { result } = renderHook(() => useTimePeriod());

		expect(result.current.selectedPeriod).toEqual({ type: "this-month" });
	});

	it("updates period on selection", () => {
		const { result } = renderHook(() => useTimePeriod());

		act(() => {
			result.current.setSelectedPeriod({ type: "last-month" });
		});

		expect(result.current.selectedPeriod).toEqual({ type: "last-month" });
	});

	it("resolves date range correctly", () => {
		const { result } = renderHook(() => useTimePeriod());

		// Default is this-month, so startDate should be 1st of current month
		const now = new Date();
		expect(result.current.resolvedRange.startDate).toEqual(
			new Date(now.getFullYear(), now.getMonth(), 1),
		);
	});

	it("provides a period label", () => {
		const { result } = renderHook(() => useTimePeriod());

		expect(typeof result.current.periodLabel).toBe("string");
		expect(result.current.periodLabel.length).toBeGreaterThan(0);
	});

	it("updates resolved range when period changes", () => {
		const { result } = renderHook(() => useTimePeriod());

		const initialLabel = result.current.periodLabel;

		act(() => {
			result.current.setSelectedPeriod({ type: "this-year" });
		});

		const now = new Date();
		expect(result.current.resolvedRange.startDate).toEqual(
			new Date(now.getFullYear(), 0, 1),
		);
		expect(result.current.periodLabel).toBe(`${now.getFullYear()}`);
		expect(result.current.periodLabel).not.toBe(initialLabel);
	});
});
