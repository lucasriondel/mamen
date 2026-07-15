import type { Category, Issuer } from "@mamen/shared/contract";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AmountCell, CategoryCell, IssuerCell } from "./transaction-cells";

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

const category: Category = {
	id: 5 as Category["id"],
	name: "Groceries",
	slug: "groceries",
	color: "#0f0",
	icon: "cart",
	parentId: 1 as Category["id"],
	sortOrder: 0,
	createdAt: new Date(),
};

describe("CategoryCell", () => {
	it("inherited: shows the leaf name plain, without its folder path", () => {
		render(<CategoryCell category={category} />);
		expect(screen.getByText("Groceries")).toBeInTheDocument();
		// Leaf name only — the folder is navigation, not identity (never a path).
		expect(screen.queryByText(/Food/)).not.toBeInTheDocument();
		expect(screen.queryByText(/›|\/|>/)).not.toBeInTheDocument();
	});

	it("override: shows the leaf name marked, distinct from an inherited one", () => {
		render(<CategoryCell category={category} isOverride />);
		const el = screen.getByText("Groceries");
		expect(el).toBeInTheDocument();
		// Marked — the exception gets the ink (a data hook + a marker), where an
		// inherited row is plain.
		const marked = el.closest("[data-override]");
		expect(marked).toHaveAttribute("data-override", "true");
		expect(marked).not.toHaveAttribute("data-inherited");
	});

	it("unassigned: shows Unassigned when no category is derived", () => {
		render(<CategoryCell />);
		const el = screen.getByText("Unassigned");
		expect(el).toBeInTheDocument();
		expect(el.closest("[data-unassigned]")).toHaveAttribute(
			"data-unassigned",
			"true",
		);
	});
});
