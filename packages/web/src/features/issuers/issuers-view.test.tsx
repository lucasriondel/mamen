import type { Issuer, Transaction } from "@mamen/shared/contract";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK boundary (PRD "Seam 2"): the grid reads the issuers `list`, each
// card reads that issuer's transactions (for count + net), and the edit dialog
// writes through the issuers mutations. Real key factories are kept for
// invalidation; the surfaces below are stubbed to drive canned data and assert
// the exact calls.
const updateIssuer = vi.fn();
const removeIssuer = vi.fn();
const uploadImage = vi.fn();
const deleteImage = vi.fn();
let issuersList: Issuer[];
let transactionsByIssuer: Record<number, Transaction[]>;

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
		transactionQueries: {
			list: (params: { issuerId?: number }) => ({
				queryKey: ["transactions", "list", params],
				queryFn: async () => {
					const items = transactionsByIssuer[params.issuerId ?? -1] ?? [];
					return { items, total: items.length };
				},
			}),
		},
		issuerMutations: {
			update: (id: unknown, patch: unknown) => updateIssuer(id, patch),
			remove: (id: unknown) => removeIssuer(id),
			uploadImage: (id: unknown, file: unknown) => uploadImage(id, file),
			deleteImage: (id: unknown) => deleteImage(id),
		},
	};
});

const { IssuersView } = await import("./issuers-view");

function issuer(overrides: Partial<Issuer> = {}): Issuer {
	return {
		id: 1 as Issuer["id"],
		name: "Spotify",
		createdAt: new Date("2026-01-01"),
		firstSeen: new Date("2026-01-01"),
		...overrides,
	} as Issuer;
}

function txn(amount: number, issuerId: number): Transaction {
	return {
		id: (issuerId * 100 + amount) as Transaction["id"],
		accountId: 1 as Transaction["accountId"],
		date: new Date("2026-01-10"),
		amount,
		rawIssuerString: "RAW",
		issuerId: issuerId as Transaction["issuerId"],
		importedAt: new Date(),
		importMonth: "2026-01",
	} as Transaction;
}

beforeEach(() => {
	updateIssuer.mockReset().mockResolvedValue(issuer());
	removeIssuer.mockReset().mockResolvedValue(undefined);
	uploadImage.mockReset().mockResolvedValue(issuer());
	deleteImage.mockReset().mockResolvedValue(issuer());
	issuersList = [issuer()];
	transactionsByIssuer = { 1: [txn(-10, 1), txn(-5, 1)] };
});

describe("IssuersView", () => {
	it("renders a card with the issuer name, transaction count, and net total", async () => {
		render(<IssuersView />);

		expect(await screen.findByText("Spotify")).toBeInTheDocument();
		// Two transactions summing to -15 €.
		await waitFor(() =>
			expect(screen.getByText(/2 transactions/)).toBeInTheDocument(),
		);
		expect(screen.getByText(/15/)).toBeInTheDocument();
	});

	it("opens the edit dialog when a card is clicked and renames the issuer", async () => {
		const user = userEvent.setup();
		render(<IssuersView />);

		await user.click(await screen.findByRole("button", { name: /Spotify/ }));

		const dialog = await screen.findByRole("dialog");
		const input = within(dialog).getByLabelText("Issuer name");
		await user.clear(input);
		await user.type(input, "Spotify Premium");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(updateIssuer).toHaveBeenCalledWith(1, { name: "Spotify Premium" }),
		);
	});

	it("blocks deleting an issuer still referenced by transactions", async () => {
		const user = userEvent.setup();
		render(<IssuersView />);

		await user.click(await screen.findByRole("button", { name: /Spotify/ }));
		const dialog = await screen.findByRole("dialog");
		const deleteButton = within(dialog).getByRole("button", {
			name: "Delete issuer",
		});

		await waitFor(() => expect(deleteButton).toBeDisabled());
		expect(
			within(dialog).getByText(/reference this issuer/),
		).toBeInTheDocument();

		await user.click(deleteButton);
		expect(removeIssuer).not.toHaveBeenCalled();
	});

	it("deletes an issuer with no referencing transactions", async () => {
		transactionsByIssuer = { 1: [] };
		const user = userEvent.setup();
		render(<IssuersView />);

		await user.click(await screen.findByRole("button", { name: /Spotify/ }));
		const dialog = await screen.findByRole("dialog");
		const deleteButton = within(dialog).getByRole("button", {
			name: "Delete issuer",
		});

		await waitFor(() => expect(deleteButton).toBeEnabled());
		await user.click(deleteButton);

		await waitFor(() => expect(removeIssuer).toHaveBeenCalledWith(1));
	});

	it("rejects an avatar image over the 2 MiB cap without uploading", async () => {
		const user = userEvent.setup();
		render(<IssuersView />);

		await user.click(await screen.findByRole("button", { name: /Spotify/ }));
		const dialog = await screen.findByRole("dialog");

		// A 3 MiB file exceeds the contract's 2 MiB cap.
		const big = new File(["x".repeat(3 * 1024 * 1024)], "big.png", {
			type: "image/png",
		});
		await user.upload(within(dialog).getByLabelText("Issuer image"), big);

		expect(uploadImage).not.toHaveBeenCalled();
	});

	it("uploads an avatar image within the cap", async () => {
		const user = userEvent.setup();
		render(<IssuersView />);

		await user.click(await screen.findByRole("button", { name: /Spotify/ }));
		const dialog = await screen.findByRole("dialog");

		const small = new File(["small"], "small.png", { type: "image/png" });
		await user.upload(within(dialog).getByLabelText("Issuer image"), small);

		await waitFor(() =>
			expect(uploadImage).toHaveBeenCalledWith(1, expect.any(File)),
		);
	});
});
