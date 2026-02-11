import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile, generateExportFilename } from "./downloadFile";

describe("generateExportFilename", () => {
	it("matches expected format mamen-backup-YYYY-MM-DD.json", () => {
		const filename = generateExportFilename();

		expect(filename).toMatch(/^mamen-backup-\d{4}-\d{2}-\d{2}\.json$/);
	});

	it("uses current date", () => {
		const today = new Date().toISOString().split("T")[0];
		const filename = generateExportFilename();

		expect(filename).toBe(`mamen-backup-${today}.json`);
	});
});

describe("downloadFile", () => {
	let appendChildSpy: ReturnType<typeof vi.spyOn>;
	let removeChildSpy: ReturnType<typeof vi.spyOn>;
	let createObjectURLSpy: ReturnType<typeof vi.fn>;
	let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
	let clickSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		clickSpy = vi.fn();
		appendChildSpy = vi
			.spyOn(document.body, "appendChild")
			.mockImplementation((node) => node);
		removeChildSpy = vi
			.spyOn(document.body, "removeChild")
			.mockImplementation((node) => node);

		createObjectURLSpy = vi.fn(() => "blob:http://localhost/mock-url");
		revokeObjectURLSpy = vi.fn();
		globalThis.URL.createObjectURL = createObjectURLSpy;
		globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

		vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
			if (tag === "a") {
				return {
					click: clickSpy,
					href: "",
					download: "",
				} as unknown as HTMLAnchorElement;
			}
			return document.createElement(tag);
		});
	});

	it("creates and clicks anchor element", () => {
		const blob = new Blob(["test"], { type: "application/json" });
		downloadFile(blob, "test.json");

		expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
		expect(appendChildSpy).toHaveBeenCalled();
		expect(clickSpy).toHaveBeenCalled();
		expect(removeChildSpy).toHaveBeenCalled();
	});

	it("revokes object URL after download", () => {
		const blob = new Blob(["test"], { type: "application/json" });
		downloadFile(blob, "test.json");

		expect(revokeObjectURLSpy).toHaveBeenCalledWith(
			"blob:http://localhost/mock-url",
		);
	});

	it("sets correct download filename on anchor", () => {
		const blob = new Blob(["test"], { type: "application/json" });
		const mockAnchor = { click: clickSpy, href: "", download: "" };
		vi.spyOn(document, "createElement").mockReturnValue(
			mockAnchor as unknown as HTMLAnchorElement,
		);

		downloadFile(blob, "mamen-backup-2026-02-09.json");

		expect(mockAnchor.download).toBe("mamen-backup-2026-02-09.json");
		expect(mockAnchor.href).toBe("blob:http://localhost/mock-url");
	});
});
