import type { Issuer } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK seam: the control writes through `issuerMutations.update`
// ({ excludedFromRecap }). Real key factories are kept so the mutation's
// invalidation resolves.
const updateIssuer = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerMutations: {
			update: (id: unknown, patch: unknown) => updateIssuer(id, patch),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { IssuerRecapExclusionSection } = await import(
	"./issuer-recap-exclusion-section"
);

/** A minimal issuer — only the fields the control reads. */
function issuer(over: Partial<Issuer> = {}): Issuer {
	return {
		id: 3,
		name: "Joint account",
		createdAt: new Date("2026-01-01"),
		firstSeen: new Date("2026-01-01"),
		...over,
	} as Issuer;
}

beforeEach(() => {
	updateIssuer.mockReset().mockResolvedValue(issuer());
});

describe("IssuerRecapExclusionSection", () => {
	it("excludes every transaction of a counted issuer in one write", async () => {
		render(<IssuerRecapExclusionSection issuer={issuer()} />);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: /exclude from recap/i }),
		);

		// One issuer write, no per-transaction writes: the rows read their state
		// through the issuer (ADR 0008).
		await waitFor(() =>
			expect(updateIssuer).toHaveBeenCalledWith(3, {
				excludedFromRecap: true,
			}),
		);
	});

	it("puts an excluded issuer's transactions back into the recap", async () => {
		render(
			<IssuerRecapExclusionSection
				issuer={issuer({ excludedFromRecap: true })}
			/>,
		);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: /include in recap/i }));

		await waitFor(() =>
			expect(updateIssuer).toHaveBeenCalledWith(3, {
				excludedFromRecap: false,
			}),
		);
	});

	it("says which state the issuer is in, and that per-row decisions survive", () => {
		render(
			<IssuerRecapExclusionSection
				issuer={issuer({ excludedFromRecap: true })}
			/>,
		);

		expect(
			screen.getByText(/don't count toward your spend totals/i),
		).toBeVisible();
		// The override story is the reason this is a default, not a stamp — say so
		// where the lever is, or a user cannot predict what it does to a row they
		// already decided about.
		expect(screen.getByText(/decided by hand/i)).toBeVisible();
	});
});
