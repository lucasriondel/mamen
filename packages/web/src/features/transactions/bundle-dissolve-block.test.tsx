import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BundleDissolveBlock } from "./bundle-dissolve-block";

describe("BundleDissolveBlock (issue #82)", () => {
	// The members are the real bank rows, and they are exactly what comes back —
	// so the copy must not read as a delete, and it says so before the press.
	it("says dissolving returns the members rather than deleting them", async () => {
		render(
			<BundleDissolveBlock
				disabled={false}
				isDissolving={false}
				onDissolve={vi.fn()}
			/>,
		);

		expect(
			await screen.findByText(/returns its members to the list/i),
		).toBeVisible();
	});

	it("dissolves on demand", async () => {
		const onDissolve = vi.fn();
		render(
			<BundleDissolveBlock
				disabled={false}
				isDissolving={false}
				onDissolve={onDissolve}
			/>,
		);
		const user = userEvent.setup();

		await user.click(
			await screen.findByRole("button", { name: /dissolve bundle/i }),
		);

		expect(onDissolve).toHaveBeenCalled();
	});

	it("says so while dissolving", async () => {
		render(<BundleDissolveBlock disabled isDissolving onDissolve={vi.fn()} />);

		const button = await screen.findByRole("button", { name: /dissolving…/i });
		expect(button).toBeDisabled();
	});

	it("waits on any other write on the bundle", async () => {
		render(
			<BundleDissolveBlock
				disabled
				isDissolving={false}
				onDissolve={vi.fn()}
			/>,
		);

		expect(
			await screen.findByRole("button", { name: /dissolve bundle/i }),
		).toBeDisabled();
	});
});
