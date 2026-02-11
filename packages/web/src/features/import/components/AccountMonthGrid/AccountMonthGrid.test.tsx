import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { AccountMonthGrid } from "./index";

const defaultProps = {
	accountId: 1,
	onMonthClick: vi.fn(),
	onFileDropped: vi.fn(),
};

beforeEach(async () => {
	vi.clearAllMocks();
	await db.accounts.clear();
	await db.transactions.clear();
});

describe("AccountMonthGrid", () => {
	it("renders 12 month slots", async () => {
		render(<AccountMonthGrid {...defaultProps} />);

		expect(await screen.findByText("Jan")).toBeInTheDocument();
		expect(screen.getByText("Feb")).toBeInTheDocument();
		expect(screen.getByText("Mar")).toBeInTheDocument();
		expect(screen.getByText("Apr")).toBeInTheDocument();
		expect(screen.getByText("May")).toBeInTheDocument();
		expect(screen.getByText("Jun")).toBeInTheDocument();
		expect(screen.getByText("Jul")).toBeInTheDocument();
		expect(screen.getByText("Aug")).toBeInTheDocument();
		expect(screen.getByText("Sep")).toBeInTheDocument();
		expect(screen.getByText("Oct")).toBeInTheDocument();
		expect(screen.getByText("Nov")).toBeInTheDocument();
		expect(screen.getByText("Dec")).toBeInTheDocument();
	});

	it("shows current year by default", () => {
		render(<AccountMonthGrid {...defaultProps} />);

		const currentYear = new Date().getFullYear().toString();
		expect(screen.getByText(currentYear)).toBeInTheDocument();
	});

	it("navigates to previous year", async () => {
		const user = userEvent.setup();
		render(<AccountMonthGrid {...defaultProps} />);

		const prevButton = screen.getByLabelText("Previous year");
		await user.click(prevButton);

		const prevYear = (new Date().getFullYear() - 1).toString();
		expect(screen.getByText(prevYear)).toBeInTheDocument();
	});

	it("navigates to next year", async () => {
		const user = userEvent.setup();
		render(<AccountMonthGrid {...defaultProps} />);

		const nextButton = screen.getByLabelText("Next year");
		await user.click(nextButton);

		const nextYear = (new Date().getFullYear() + 1).toString();
		expect(screen.getByText(nextYear)).toBeInTheDocument();
	});

	it("shows transaction counts for months with data", async () => {
		await db.transactions.bulkAdd([
			{
				accountId: 1,
				date: new Date("2026-01-15"),
				amount: -50,
				rawMerchantString: "Store A",
				importedAt: new Date(),
				importMonth: "2026-01",
			},
			{
				accountId: 1,
				date: new Date("2026-01-20"),
				amount: -30,
				rawMerchantString: "Store B",
				importedAt: new Date(),
				importMonth: "2026-01",
			},
		]);

		render(<AccountMonthGrid {...defaultProps} />);

		expect(await screen.findByText("2")).toBeInTheDocument();
	});

	it("does not show counts from other accounts", async () => {
		await db.transactions.add({
			accountId: 2,
			date: new Date("2026-03-15"),
			amount: -50,
			rawMerchantString: "Other Account Store",
			importedAt: new Date(),
			importMonth: "2026-03",
		});

		render(<AccountMonthGrid {...defaultProps} accountId={1} />);

		// Wait for render to settle
		await screen.findByText("Jan");

		// The count "1" should not show in our grid since it belongs to account 2
		// All months should be empty (no checkmark/count)
		const marSlot = screen.getByTestId("month-slot-2026-03");
		expect(marSlot).not.toHaveTextContent("1");
	});
});
