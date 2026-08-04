import type { Category, Issuer, Transaction } from "@mamen/shared/contract";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BundleMemberActions } from "./bundle-member-actions";

const ISSUER = { id: 10, name: "Carrefour" } as unknown as Issuer;
const CATEGORY = { id: 7, name: "Groceries" } as unknown as Category;

/** A member carrying both an issuer and a category — both shortcuts on offer. */
function member(over: Partial<Transaction> = {}): Transaction {
	return {
		id: 201,
		accountId: 1,
		date: new Date("2026-03-07T00:00:00.000Z"),
		amount: -200,
		rawIssuerString: "CARREFOUR MARKET",
		issuerId: 10,
		categoryId: 7,
		importedAt: new Date("2026-03-08T00:00:00.000Z"),
		importMonth: "2026-03",
		...over,
	} as Transaction;
}

/** The bundle parent the shortcuts write onto — uncurated unless a case says so. */
function parent(over: Partial<Transaction> = {}): Transaction {
	return {
		id: 300,
		accountId: 1,
		date: new Date("2026-03-07T00:00:00.000Z"),
		amount: -50,
		rawIssuerString: "Weekend Bretagne",
		kind: "bundle",
		importedAt: new Date("2026-03-13T00:00:00.000Z"),
		importMonth: "2026-03",
		...over,
	} as Transaction;
}

const handlers = () => ({
	onCopyIssuer: vi.fn(),
	onCopyCategory: vi.fn(),
	onRemove: vi.fn(),
});

describe("BundleMemberActions (issue #82)", () => {
	it("copies the member's issuer and category onto the parent", async () => {
		const spies = handlers();
		render(
			<BundleMemberActions
				member={member()}
				parent={parent()}
				issuer={ISSUER}
				category={CATEGORY}
				disabled={false}
				{...spies}
			/>,
		);
		const user = userEvent.setup();

		await user.click(
			await screen.findByRole("button", { name: /use carrefour as/i }),
		);
		await user.click(screen.getByRole("button", { name: /use groceries as/i }));

		expect(spies.onCopyIssuer).toHaveBeenCalledWith(10);
		expect(spies.onCopyCategory).toHaveBeenCalledWith(7);
	});

	// An absent button says "nothing to copy" more plainly than a disabled one.
	it("offers no shortcut for a member carrying neither", () => {
		render(
			<BundleMemberActions
				member={member({
					issuerId: null,
					categoryId: null,
				} as Partial<Transaction>)}
				parent={parent()}
				disabled={false}
				{...handlers()}
			/>,
		);

		expect(
			screen.queryByRole("button", { name: /use .* as this/i }),
		).toBeNull();
		// The way out is never conditional: any member can leave.
		expect(
			screen.getByRole("button", { name: /remove .* from this bundle/i }),
		).toBeVisible();
	});

	// The row is not missing anything, so the button stays — disabled, saying why.
	it("keeps but disables a shortcut the parent already carries", () => {
		render(
			<BundleMemberActions
				member={member()}
				parent={parent({ issuerId: 10 } as Partial<Transaction>)}
				issuer={ISSUER}
				category={CATEGORY}
				disabled={false}
				{...handlers()}
			/>,
		);

		expect(
			screen.getByRole("button", { name: /use carrefour as/i }),
		).toBeDisabled();
		expect(
			screen.getByRole("button", { name: /use groceries as/i }),
		).toBeEnabled();
	});

	it("offers the way out of the bundle", async () => {
		const spies = handlers();
		render(
			<BundleMemberActions
				member={member()}
				parent={parent()}
				issuer={ISSUER}
				category={CATEGORY}
				disabled={false}
				{...spies}
			/>,
		);
		const user = userEvent.setup();

		await user.click(
			await screen.findByRole("button", {
				name: /remove carrefour market from this bundle/i,
			}),
		);

		expect(spies.onRemove).toHaveBeenCalled();
	});

	it("disables every control while a write is in flight", () => {
		render(
			<BundleMemberActions
				member={member()}
				parent={parent()}
				issuer={ISSUER}
				category={CATEGORY}
				disabled
				{...handlers()}
			/>,
		);

		for (const button of screen.getAllByRole("button")) {
			expect(button).toBeDisabled();
		}
	});
});
