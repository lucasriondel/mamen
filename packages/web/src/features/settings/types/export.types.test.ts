import { describe, expect, it } from "vitest";
import type { ExportData, ExportMetadata, ExportOptions } from "./export.types";

describe("Export types", () => {
	it("ExportMetadata contains required fields", () => {
		const metadata: ExportMetadata = {
			exportDate: "2026-01-01T00:00:00.000Z",
			appVersion: "0.1.0",
			exportFormat: "mamen-backup-v1",
			recordCounts: {
				accounts: 0,
				transactions: 0,
				merchants: 0,
				rules: 0,
				categories: 0,
				subscriptions: 0,
				settings: 0,
				appSettings: 0,
			},
		};
		expect(metadata.exportDate).toBeDefined();
		expect(metadata.appVersion).toBeDefined();
		expect(metadata.exportFormat).toBeDefined();
		expect(metadata.recordCounts).toBeDefined();
	});

	it("ExportData includes all data tables", () => {
		const data: ExportData = {
			metadata: {
				exportDate: "2026-01-01T00:00:00.000Z",
				appVersion: "0.1.0",
				exportFormat: "mamen-backup-v1",
				recordCounts: {
					accounts: 0,
					transactions: 0,
					merchants: 0,
					rules: 0,
					categories: 0,
					subscriptions: 0,
					settings: 0,
					appSettings: 0,
				},
			},
			accounts: [],
			transactions: [],
			merchants: [],
			rules: [],
			categories: [],
			subscriptions: [],
			settings: [],
			appSettings: [],
		};
		expect(data.accounts).toBeDefined();
		expect(data.transactions).toBeDefined();
		expect(data.merchants).toBeDefined();
		expect(data.rules).toBeDefined();
		expect(data.categories).toBeDefined();
		expect(data.subscriptions).toBeDefined();
		expect(data.settings).toBeDefined();
		expect(data.appSettings).toBeDefined();
	});

	it("ExportOptions has boolean toggles for each data type", () => {
		const options: ExportOptions = {
			includeAccounts: true,
			includeTransactions: true,
			includeMerchants: true,
			includeRules: true,
			includeCategories: true,
			includeSubscriptions: true,
			includeSettings: true,
		};
		expect(Object.values(options).every((v) => typeof v === "boolean")).toBe(
			true,
		);
	});
});
