import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransactionsPagination } from "./transactions-pagination";

describe("TransactionsPagination", () => {
	it("shows the 1-based range and disables Previous on the first page", () => {
		render(
			<TransactionsPagination
				offset={0}
				pageSize={50}
				total={120}
				onOffsetChange={vi.fn()}
			/>,
		);
		expect(screen.getByLabelText("Pagination range")).toHaveTextContent(
			"1–50 of 120",
		);
		expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
	});

	it("advances the offset by a page on Next", async () => {
		const onOffsetChange = vi.fn();
		render(
			<TransactionsPagination
				offset={0}
				pageSize={50}
				total={120}
				onOffsetChange={onOffsetChange}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: /next/i }));
		expect(onOffsetChange).toHaveBeenCalledWith(50);
	});

	it("hides the range and the accessible buttons on the top copy", async () => {
		const onOffsetChange = vi.fn();
		const { container } = render(
			<TransactionsPagination
				position="top"
				offset={0}
				pageSize={50}
				total={120}
				onOffsetChange={onOffsetChange}
			/>,
		);
		// The bottom copy owns the range and the a11y tree, so the top one exposes
		// neither — but it still drives the same offset on click.
		expect(screen.queryByLabelText("Pagination range")).toBeNull();
		expect(screen.queryByRole("button", { name: /next/i })).toBeNull();

		const next = container.querySelectorAll("button")[1];
		await userEvent.click(next);
		expect(onOffsetChange).toHaveBeenCalledWith(50);
	});

	it("disables Next on the last page and clamps the range to the total", () => {
		render(
			<TransactionsPagination
				offset={100}
				pageSize={50}
				total={120}
				onOffsetChange={vi.fn()}
			/>,
		);
		expect(screen.getByLabelText("Pagination range")).toHaveTextContent(
			"101–120 of 120",
		);
		expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /previous/i })).toBeEnabled();
	});
});
