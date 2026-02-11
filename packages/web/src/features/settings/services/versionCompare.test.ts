import { describe, expect, it } from "vitest";
import { compareVersions } from "./versionCompare";

describe("compareVersions", () => {
	it('"1.0.0" vs "1.0.0" returns 0', () => {
		expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
	});

	it('"1.1.0" vs "1.0.0" returns 1', () => {
		expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
	});

	it('"1.0.0" vs "2.0.0" returns -1', () => {
		expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
	});

	it('"0.1.0" vs "0.1.0" returns 0', () => {
		expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
	});

	it('"1.0" vs "1.0.0" returns 0 (missing segments)', () => {
		expect(compareVersions("1.0", "1.0.0")).toBe(0);
	});

	it('"1.0.1" vs "1.0.0" returns 1 (patch difference)', () => {
		expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
	});

	it('"0.0.1" vs "0.0.2" returns -1', () => {
		expect(compareVersions("0.0.1", "0.0.2")).toBe(-1);
	});

	it('"2.0" vs "1.9.9" returns 1', () => {
		expect(compareVersions("2.0", "1.9.9")).toBe(1);
	});
});
