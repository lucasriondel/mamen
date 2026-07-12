import type { Issuer } from "@mamen/shared/contract";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AmountCell, IssuerCell } from "./transaction-cells";

describe("AmountCell", () => {
	it("colors a debit (negative) with the gousse high token and keeps the sign", () => {
		render(<AmountCell amount={-42} />);
		const el = screen.getByText(/42/);
		expect(el).toHaveClass("text-high");
		expect(el).toHaveClass("tabular-nums");
		expect(el.textContent).toMatch(/^-/);
	});

	it("colors a credit (positive) with the gousse low token and shows a +", () => {
		render(<AmountCell amount={100} />);
		const el = screen.getByText(/100/);
		expect(el).toHaveClass("text-low");
		expect(el.textContent).toMatch(/^\+/);
	});
});

const issuer: Issuer = {
	id: 1 as Issuer["id"],
	name: "Spotify",
	createdAt: new Date(),
	firstSeen: new Date(),
};

describe("IssuerCell", () => {
	it("resolved: shows the issuer name and an avatar fallback initial", () => {
		render(<IssuerCell rawIssuerString="SPOTIFY P2A34" issuer={issuer} />);
		expect(screen.getByText("Spotify")).toBeInTheDocument();
		expect(screen.getByText("S")).toBeInTheDocument();
		expect(screen.queryByText("SPOTIFY P2A34")).not.toBeInTheDocument();
	});

	it("unresolved: shows the muted raw text with a needs-issuer affordance", () => {
		render(<IssuerCell rawIssuerString="SPOTIFY P2A34" />);
		expect(screen.getByText("SPOTIFY P2A34")).toBeInTheDocument();
		const cell = screen.getByText("SPOTIFY P2A34").closest("[data-unresolved]");
		expect(cell).toHaveAttribute("data-unresolved", "true");
		expect(cell).toHaveClass("text-muted");
	});
});
