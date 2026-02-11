import { describe, expect, it } from "vitest";
import type { DisplayPreferences } from "./preferences.types";
import { DEFAULT_DISPLAY_PREFERENCES } from "./preferences.types";

describe("DisplayPreferences types", () => {
	it("has all required fields in defaults", () => {
		const prefs: DisplayPreferences = DEFAULT_DISPLAY_PREFERENCES;

		expect(prefs.currencySymbol).toBe("€");
		expect(prefs.dateFormat).toBe("DD/MM/YYYY");
		expect(prefs.defaultDashboardPeriod).toBe("this-month");
		expect(prefs.anomalyThreshold).toEqual({ multiplier: 2 });
	});

	it("allows optional absoluteAmount in anomaly threshold", () => {
		const prefs: DisplayPreferences = {
			...DEFAULT_DISPLAY_PREFERENCES,
			anomalyThreshold: { multiplier: 3, absoluteAmount: 500 },
		};

		expect(prefs.anomalyThreshold.multiplier).toBe(3);
		expect(prefs.anomalyThreshold.absoluteAmount).toBe(500);
	});
});
