import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransactionsPagination } from "./transactions-pagination";

describe("TransactionsPagination", () => {
	it("shows the page number and range, and disables Previous on page 1", () => {
		render(
			<TransactionsPagination
				page={1}
				pageSize={50}
				total={120}
				onPageChange={vi.fn()}
			/>,
		);
		expect(screen.getByLabelText("Pagination range")).toHaveTextContent(
			"Page 1 of 3 · 1–50 of 120",
		);
		expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
	});

	it("advances to the next page on Next", async () => {
		const onPageChange = vi.fn();
		render(
			<TransactionsPagination
				page={1}
				pageSize={50}
				total={120}
				onPageChange={onPageChange}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: /next/i }));
		expect(onPageChange).toHaveBeenCalledWith(2);
	});

	it("steps back a page on Previous", async () => {
		const onPageChange = vi.fn();
		render(
			<TransactionsPagination
				page={3}
				pageSize={50}
				total={120}
				onPageChange={onPageChange}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: /previous/i }));
		expect(onPageChange).toHaveBeenCalledWith(2);
	});

	it("hides the range and the accessible buttons on the top copy", async () => {
		const onPageChange = vi.fn();
		const { container } = render(
			<TransactionsPagination
				position="top"
				page={1}
				pageSize={50}
				total={120}
				onPageChange={onPageChange}
			/>,
		);
		// The bottom copy owns the range and the a11y tree, so the top one exposes
		// neither — but it still drives the same page on click.
		expect(screen.queryByLabelText("Pagination range")).toBeNull();
		expect(screen.queryByRole("button", { name: /next/i })).toBeNull();

		const next = container.querySelectorAll("button")[1];
		await userEvent.click(next);
		expect(onPageChange).toHaveBeenCalledWith(2);
	});

	it("disables Next on the last page and clamps the range to the total", () => {
		render(
			<TransactionsPagination
				page={3}
				pageSize={50}
				total={120}
				onPageChange={vi.fn()}
			/>,
		);
		expect(screen.getByLabelText("Pagination range")).toHaveTextContent(
			"Page 3 of 3 · 101–120 of 120",
		);
		expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /previous/i })).toBeEnabled();
	});

	it("reports a single empty page rather than 'page 1 of 0'", () => {
		render(
			<TransactionsPagination
				page={1}
				pageSize={50}
				total={0}
				onPageChange={vi.fn()}
			/>,
		);
		expect(screen.getByLabelText("Pagination range")).toHaveTextContent(
			"Page 1 of 1 · 0–0 of 0",
		);
		expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
	});
});
