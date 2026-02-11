import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { settingsApi } from "@/lib/api";
import { db } from "@/lib/db";
import { DEFAULT_DISPLAY_PREFERENCES } from "../types/preferences.types";
import { useDisplayPreferences } from "./useDisplayPreferences";

beforeEach(async () => {
	await db.settings.clear();
});

describe("useDisplayPreferences", () => {
	it("returns default values initially", async () => {
		const { result } = renderHook(() => useDisplayPreferences());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.preferences).toEqual(DEFAULT_DISPLAY_PREFERENCES);
	});

	it("returns saved preferences from db", async () => {
		await db.settings.add({
			key: "displayPreferences",
			value: JSON.stringify({ currencySymbol: "$", dateFormat: "MM/DD/YYYY" }),
		});

		const { result } = renderHook(() => useDisplayPreferences());

		await waitFor(() => {
			expect(result.current.preferences.currencySymbol).toBe("$");
		});

		expect(result.current.preferences.dateFormat).toBe("MM/DD/YYYY");
		expect(result.current.preferences.defaultDashboardPeriod).toBe(
			"this-month",
		);
	});

	it("updates reactively when preferences change", async () => {
		// Seed initial data, then re-render with updated data
		await db.settings.add({
			key: "displayPreferences",
			value: JSON.stringify({ currencySymbol: "€" }),
		});

		const { result, rerender } = renderHook(() => useDisplayPreferences());

		await waitFor(() => {
			expect(result.current.preferences.currencySymbol).toBe("€");
		});

		// Update via API to trigger invalidation
		await settingsApi.putByKey({
			key: "displayPreferences",
			value: JSON.stringify({ currencySymbol: "£" }),
		});

		await waitFor(() => {
			expect(result.current.preferences.currencySymbol).toBe("£");
		});
	});
});
