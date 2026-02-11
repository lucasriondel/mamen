import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetTextContent = vi.fn();
const mockGetPage = vi.fn();
const mockGetDocument = vi.fn();

vi.mock("pdfjs-dist", () => ({
	getDocument: (opts: unknown) => ({
		promise: mockGetDocument(opts),
	}),
	GlobalWorkerOptions: { workerSrc: "" },
}));

const createMockFile = (name = "statement.pdf"): File => {
	const buffer = new ArrayBuffer(16);
	return {
		name,
		type: "application/pdf",
		size: 16,
		lastModified: Date.now(),
		arrayBuffer: () => Promise.resolve(buffer),
		text: () => Promise.resolve(""),
		slice: () => new Blob(),
		stream: () => new ReadableStream(),
		webkitRelativePath: "",
		bytes: () => Promise.resolve(new Uint8Array()),
	} as unknown as File;
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("extractTextFromPDF", () => {
	it("extracts text from a single-page PDF", async () => {
		mockGetTextContent.mockResolvedValueOnce({
			items: [{ str: "Transaction 1" }, { str: " - " }, { str: "$42.50" }],
		});
		mockGetPage.mockResolvedValueOnce({
			getTextContent: mockGetTextContent,
		});
		mockGetDocument.mockResolvedValueOnce({
			numPages: 1,
			getPage: mockGetPage,
		});

		const { extractTextFromPDF } = await import("./pdfExtractor");
		const text = await extractTextFromPDF(createMockFile());

		expect(text).toContain("Transaction 1");
		expect(text).toContain("$42.50");
		expect(mockGetPage).toHaveBeenCalledWith(1);
	});

	it("concatenates text from multi-page PDFs", async () => {
		mockGetTextContent
			.mockResolvedValueOnce({
				items: [{ str: "Page 1 content" }],
			})
			.mockResolvedValueOnce({
				items: [{ str: "Page 2 content" }],
			})
			.mockResolvedValueOnce({
				items: [{ str: "Page 3 content" }],
			});
		mockGetPage
			.mockResolvedValueOnce({ getTextContent: mockGetTextContent })
			.mockResolvedValueOnce({ getTextContent: mockGetTextContent })
			.mockResolvedValueOnce({ getTextContent: mockGetTextContent });
		mockGetDocument.mockResolvedValueOnce({
			numPages: 3,
			getPage: mockGetPage,
		});

		const { extractTextFromPDF } = await import("./pdfExtractor");
		const text = await extractTextFromPDF(createMockFile());

		expect(text).toContain("Page 1 content");
		expect(text).toContain("Page 2 content");
		expect(text).toContain("Page 3 content");
		expect(mockGetPage).toHaveBeenCalledTimes(3);
	});

	it("handles items without str property", async () => {
		mockGetTextContent.mockResolvedValueOnce({
			items: [{ str: "Valid text" }, { width: 100 }, { str: "More text" }],
		});
		mockGetPage.mockResolvedValueOnce({
			getTextContent: mockGetTextContent,
		});
		mockGetDocument.mockResolvedValueOnce({
			numPages: 1,
			getPage: mockGetPage,
		});

		const { extractTextFromPDF } = await import("./pdfExtractor");
		const text = await extractTextFromPDF(createMockFile());

		expect(text).toContain("Valid text");
		expect(text).toContain("More text");
	});

	it("throws on PDF load failure", async () => {
		mockGetDocument.mockRejectedValueOnce(new Error("Invalid PDF"));

		const { extractTextFromPDF } = await import("./pdfExtractor");

		await expect(extractTextFromPDF(createMockFile("bad.pdf"))).rejects.toThrow(
			"Invalid PDF",
		);
	});

	it("returns empty string for PDF with no text", async () => {
		mockGetTextContent.mockResolvedValueOnce({
			items: [],
		});
		mockGetPage.mockResolvedValueOnce({
			getTextContent: mockGetTextContent,
		});
		mockGetDocument.mockResolvedValueOnce({
			numPages: 1,
			getPage: mockGetPage,
		});

		const { extractTextFromPDF } = await import("./pdfExtractor");
		const text = await extractTextFromPDF(createMockFile("empty.pdf"));

		expect(text.trim()).toBe("");
	});
});
