import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ImportResult } from "../../types/import.types";
import { ImportResultDialog } from "./index";

beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
	Element.prototype.scrollIntoView = vi.fn();
	Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
	Element.prototype.setPointerCapture = vi.fn();
	Element.prototype.releasePointerCapture = vi.fn();
});

const makeResult = (overrides?: Partial<ImportResult>): ImportResult => ({
	success: true,
	mode: "replace",
	added: {
		accounts: 3,
		transactions: 150,
		merchants: 10,
		rules: 5,
		categories: 8,
		subscriptions: 2,
		settings: 1,
		appSettings: 0,
	},
	skipped: { transactions: 0 },
	errors: [],
	...overrides,
});

describe("ImportResultDialog", () => {
	const user = userEvent.setup();

	it("loading state shows during import", () => {
		render(
			<ImportResultDialog
				open={true}
				loading={true}
				result={null}
				onClose={vi.fn()}
			/>,
		);

		expect(screen.getByText(/Importing Data/i)).toBeInTheDocument();
	});

	it("replace result shows correct added counts", () => {
		render(
			<ImportResultDialog
				open={true}
				loading={false}
				result={makeResult({ mode: "replace" })}
				onClose={vi.fn()}
			/>,
		);

		expect(screen.getByText(/Data restored from backup/i)).toBeInTheDocument();
		expect(screen.getByText(/3 accounts/)).toBeInTheDocument();
		expect(screen.getByText(/150 transactions/)).toBeInTheDocument();
	});

	it("merge result shows added and skipped counts", () => {
		render(
			<ImportResultDialog
				open={true}
				loading={false}
				result={makeResult({
					mode: "merge",
					added: {
						accounts: 1,
						transactions: 50,
						merchants: 3,
						rules: 0,
						categories: 0,
						subscriptions: 0,
						settings: 0,
						appSettings: 0,
					},
					skipped: { transactions: 100 },
				})}
				onClose={vi.fn()}
			/>,
		);

		// "Import Complete" in title and "Import complete" in body - use getAllByText
		const matches = screen.getAllByText(/Import complete/i);
		expect(matches.length).toBeGreaterThanOrEqual(1);
		// The skipped count is inline with other text
		const paragraph = screen.getByText(/50 transactions/);
		expect(paragraph.textContent).toContain("100 duplicate");
	});

	it("error state shows error messages", () => {
		render(
			<ImportResultDialog
				open={true}
				loading={false}
				result={makeResult({
					success: false,
					errors: ["Database write failed"],
				})}
				onClose={vi.fn()}
			/>,
		);

		expect(screen.getByText(/Database write failed/)).toBeInTheDocument();
	});

	it("close button calls onClose", async () => {
		const onClose = vi.fn();

		render(
			<ImportResultDialog
				open={true}
				loading={false}
				result={makeResult()}
				onClose={onClose}
			/>,
		);

		// There are multiple "Close" elements (dialog X button + Close button), click the visible text one
		const buttons = screen.getAllByRole("button", { name: /close/i });
		const closeButton = buttons.find((b) => b.textContent === "Close")!;
		await user.click(closeButton);
		expect(onClose).toHaveBeenCalled();
	});
});
