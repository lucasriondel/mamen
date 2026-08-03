import type { TransactionId } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK seam: the bar writes through `transactionMutations.createBundle`
// (ids + label). The real key factories are kept so the invalidation resolves.
const createBundle = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		transactionMutations: {
			createBundle: (ids: unknown, label: unknown) => createBundle(ids, label),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { BundleActionBar } = await import("./bundle-action-bar");

const ids = (...values: number[]) => values as unknown as TransactionId[];

beforeEach(() => {
	createBundle.mockReset().mockResolvedValue({ id: 500 });
});

describe("BundleActionBar", () => {
	it("renders nothing when no row is selected", () => {
		const { container } = render(
			<BundleActionBar selectedIds={[]} onClear={() => {}} />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("sends the selected ids and the label, then clears the selection", async () => {
		const onClear = vi.fn();
		render(<BundleActionBar selectedIds={ids(100, 101)} onClear={onClear} />);
		const user = userEvent.setup();

		await user.type(screen.getByLabelText("Bundle label"), "  Weekend away  ");
		await user.click(screen.getByRole("button", { name: /create bundle/i }));

		// The label is trimmed on the way out: leading whitespace is not part of a
		// row's name, and the server would only trim it again.
		await waitFor(() =>
			expect(createBundle).toHaveBeenCalledWith([100, 101], "Weekend away"),
		);
		await waitFor(() => expect(onClear).toHaveBeenCalled());
	});

	it("refuses to submit without a label", async () => {
		render(<BundleActionBar selectedIds={ids(100, 101)} onClear={() => {}} />);

		expect(
			screen.getByRole("button", { name: /create bundle/i }),
		).toBeDisabled();
		expect(createBundle).not.toHaveBeenCalled();
	});

	it("refuses a single row, and says why", async () => {
		render(<BundleActionBar selectedIds={ids(100)} onClear={() => {}} />);
		const user = userEvent.setup();

		await user.type(screen.getByLabelText("Bundle label"), "Lonely");

		expect(
			screen.getByRole("button", { name: /create bundle/i }),
		).toBeDisabled();
		expect(screen.getByText(/at least two transactions/i)).toBeVisible();
	});

	it("counts the selection", () => {
		render(<BundleActionBar selectedIds={ids(1, 2, 3)} onClear={() => {}} />);
		expect(screen.getByText(/3 selected/i)).toBeVisible();
	});
});
