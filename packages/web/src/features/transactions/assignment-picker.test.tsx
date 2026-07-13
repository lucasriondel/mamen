import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK boundary (PRD "Seam 2"): the picker reads the issuers `list` and
// writes through the issuers `create` + transactions `update` mutations. We keep
// the real key factories (so invalidation works) and stub just those surfaces to
// assert the exact calls the picker makes. cmdk's jsdom shims (ResizeObserver,
// scrollIntoView) live in `src/test/setup.ts`.
const createIssuer = vi.fn();
const updateTransaction = vi.fn();
let issuersList: Array<{ id: number; name: string }>;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerQueries: {
			list: () => ({
				queryKey: ["issuers", "list", "test"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
		},
		issuerMutations: {
			create: (payload: unknown) => createIssuer(payload),
		},
		transactionMutations: {
			update: (id: unknown, payload: unknown) => updateTransaction(id, payload),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { AssignmentPicker } = await import("./assignment-picker");

beforeEach(() => {
	createIssuer.mockReset().mockResolvedValue({
		id: 10,
		name: "ACME PAYROLL",
		createdAt: new Date(),
		firstSeen: new Date(),
	});
	updateTransaction.mockReset().mockResolvedValue({ id: 100 });
	issuersList = [{ id: 10, name: "Spotify" }];
});

async function open() {
	render(
		<AssignmentPicker
			transactionId={100 as never}
			rawIssuerString="ACME PAYROLL"
		/>,
	);
	const user = userEvent.setup();
	await user.click(screen.getByRole("button", { name: /ACME PAYROLL/ }));
	// The command input opens pre-filled with the raw counterparty string.
	await screen.findByLabelText("Search issuers");
	return user;
}

describe("AssignmentPicker", () => {
	it("creates a new issuer from the raw string, then assigns it", async () => {
		const user = await open();

		// No existing issuer matches the raw string → the top action is "create".
		await user.click(await screen.findByText(/Create new issuer/));

		await waitFor(() =>
			expect(createIssuer).toHaveBeenCalledWith(
				expect.objectContaining({ name: "ACME PAYROLL" }),
			),
		);
		// Create must precede the assign, which uses the created issuer's id and
		// stamps `manualIssuer` so Matching Rules never overwrite the hand pick.
		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				issuerId: 10,
				manualIssuer: true,
			}),
		);
	});

	it("assigns an existing issuer without creating one", async () => {
		const user = await open();

		const input = screen.getByLabelText("Search issuers");
		await user.clear(input);
		await user.type(input, "Spotify");
		await user.click(await screen.findByText("Spotify"));

		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				issuerId: 10,
				manualIssuer: true,
			}),
		);
		expect(createIssuer).not.toHaveBeenCalled();
	});
});
