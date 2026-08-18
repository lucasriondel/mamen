import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountBadge } from "./account-badge";
import { autoAccountColor } from "./account-color";

describe("AccountBadge", () => {
  it("names the account", () => {
    render(<AccountBadge account={{ id: 1, name: "Ledger", color: "#123456" }} />);
    expect(screen.getByText("Ledger")).toBeInTheDocument();
  });

  it("paints the stored colour when the account has one", () => {
    render(<AccountBadge account={{ id: 1, name: "Ledger", color: "#123456" }} />);
    expect(screen.getByText("Ledger")).toHaveAttribute("data-account-color", "#123456");
  });

  it("paints the auto colour when the account has none", () => {
    // The no-backfill bet: an account nobody has recoloured still gets a real
    // badge rather than a blank one.
    render(<AccountBadge account={{ id: 3, name: "Savings", color: null }} />);
    expect(screen.getByText("Savings")).toHaveAttribute("data-account-color", autoAccountColor(3));
  });

  it("renders a placeholder for a missing account", () => {
    render(<AccountBadge account={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
