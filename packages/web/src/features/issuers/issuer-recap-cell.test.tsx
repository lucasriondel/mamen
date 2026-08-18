import type { Issuer } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Same SDK seam as the detail-page block: the cell is the *grid's* end of one
// write, `issuerMutations.update({ excludedFromRecap })`.
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

const { IssuerRecapCell } = await import("./issuer-recap-cell");

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

describe("IssuerRecapCell", () => {
  it("excludes a counted issuer in one write", async () => {
    render(<IssuerRecapCell issuer={issuer()} />);
    const user = userEvent.setup();

    const box = screen.getByRole("checkbox", { name: /exclude joint account from recap/i });
    expect(box).not.toBeChecked();

    await user.click(box);

    await waitFor(() => expect(updateIssuer).toHaveBeenCalledWith(3, { excludedFromRecap: true }));
  });

  it("puts an excluded issuer back into the recap", async () => {
    render(<IssuerRecapCell issuer={issuer({ excludedFromRecap: true })} />);
    const user = userEvent.setup();

    const box = screen.getByRole("checkbox", { name: /include joint account in recap/i });
    // Ticked means *excluded* — the same polarity as the transactions grid's
    // Excluded column, so a sweep down either page reads the same way.
    expect(box).toBeChecked();

    await user.click(box);

    await waitFor(() => expect(updateIssuer).toHaveBeenCalledWith(3, { excludedFromRecap: false }));
  });

  it("reads an absent flag as counted", () => {
    // Only `true` means excluded; the field is optional on the wire.
    render(<IssuerRecapCell issuer={issuer({ excludedFromRecap: undefined })} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("says per-row decisions survive the bulk lever", () => {
    render(<IssuerRecapCell issuer={issuer()} />);
    // The override story is what makes this a default rather than a stamp; the
    // header has no room for it, so the control carries it.
    expect(screen.getByRole("checkbox")).toHaveAttribute(
      "title",
      expect.stringMatching(/decided by hand/i),
    );
  });
});
