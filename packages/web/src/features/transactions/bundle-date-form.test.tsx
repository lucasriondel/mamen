import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BundleDateForm } from "./bundle-date-form";

describe("BundleDateForm (issue #82)", () => {
	it("seeds the field from the stored date and offers nothing to save yet", async () => {
		render(
			<BundleDateForm
				date={new Date("2026-03-07T00:00:00.000Z")}
				manualDate={false}
				disabled={false}
				onSave={vi.fn()}
			/>,
		);

		expect(await screen.findByLabelText(/bundle date/i)).toHaveValue(
			"2026-03-07",
		);
		expect(screen.getByRole("button", { name: /save date/i })).toBeDisabled();
	});

	// Both directions go through UTC: reading the local calendar day would shift
	// the row a day either side of midnight depending on where the reader sits.
	it("saves the typed date as UTC midnight", async () => {
		const onSave = vi.fn();
		render(
			<BundleDateForm
				date={new Date("2026-03-07T00:00:00.000Z")}
				manualDate={false}
				disabled={false}
				onSave={onSave}
			/>,
		);
		const user = userEvent.setup();

		const field = await screen.findByLabelText(/bundle date/i);
		await user.clear(field);
		await user.type(field, "2026-02-14");
		await user.click(screen.getByRole("button", { name: /save date/i }));

		expect(onSave).toHaveBeenCalledWith(new Date("2026-02-14T00:00:00.000Z"));
	});

	/**
	 * The draft is re-seeded *during render* whenever the stored date changes —
	 * after the user's own save, and after a recompute moves the derived date
	 * (#74). Without the re-seed the field would keep showing a date the row no
	 * longer has, and "Save" would read as a no-op while writing the stale one.
	 */
	it("re-seeds when the stored date moves underneath it", async () => {
		const { rerender } = render(
			<BundleDateForm
				date={new Date("2026-03-07T00:00:00.000Z")}
				manualDate={false}
				disabled={false}
				onSave={vi.fn()}
			/>,
		);
		const user = userEvent.setup();

		const field = await screen.findByLabelText(/bundle date/i);
		await user.clear(field);
		await user.type(field, "2026-02-14");
		expect(screen.getByRole("button", { name: /save date/i })).toBeEnabled();

		rerender(
			<BundleDateForm
				date={new Date("2026-01-03T00:00:00.000Z")}
				manualDate={false}
				disabled={false}
				onSave={vi.fn()}
			/>,
		);

		expect(screen.getByLabelText(/bundle date/i)).toHaveValue("2026-01-03");
		expect(screen.getByRole("button", { name: /save date/i })).toBeDisabled();
	});

	it("says whether the date is derived or the user's", async () => {
		const { rerender } = render(
			<BundleDateForm
				date={new Date("2026-03-07T00:00:00.000Z")}
				manualDate={false}
				disabled={false}
				onSave={vi.fn()}
			/>,
		);
		expect(
			await screen.findByText(/follows its earliest member/i),
		).toBeVisible();

		rerender(
			<BundleDateForm
				date={new Date("2026-03-07T00:00:00.000Z")}
				manualDate
				disabled={false}
				onSave={vi.fn()}
			/>,
		);
		expect(screen.getByText(/set by hand/i)).toBeVisible();
	});

	it("saves nothing while another write is in flight", async () => {
		const onSave = vi.fn();
		render(
			<BundleDateForm
				date={new Date("2026-03-07T00:00:00.000Z")}
				manualDate={false}
				disabled
				onSave={onSave}
			/>,
		);
		const user = userEvent.setup();

		const field = await screen.findByLabelText(/bundle date/i);
		await user.clear(field);
		await user.type(field, "2026-02-14");

		expect(screen.getByRole("button", { name: /save date/i })).toBeDisabled();
		expect(onSave).not.toHaveBeenCalled();
	});
});
