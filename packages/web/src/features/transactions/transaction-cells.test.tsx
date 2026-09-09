import type { Category, Issuer } from "@mamen/shared/contract";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AmountCell, CategoryCell, IssuerCell, NotesCell } from "./transaction-cells";

describe("AmountCell", () => {
  it("colors a debit (negative) with the gousse high token and keeps the sign", () => {
    render(<AmountCell amount={-42} />);
    const el = screen.getByText(/42/);
    expect(el).toHaveClass("text-gousse-high");
    expect(el).toHaveClass("tabular-nums");
    expect(el.textContent).toMatch(/^-/);
  });

  it("colors a credit (positive) with the gousse low token and shows a +", () => {
    render(<AmountCell amount={100} />);
    const el = screen.getByText(/100/);
    expect(el).toHaveClass("text-gousse-low");
    expect(el.textContent).toMatch(/^\+/);
  });

  // Excluded money is outside every total, so it drops the sign colour that
  // stands for a contribution to one (issue #67). Muted, not struck: the
  // transaction was really spent, it is simply not counted here.
  it("excluded: mutes the amount and drops the sign colour, keeping the figure", () => {
    render(<AmountCell amount={-42} excluded />);
    const el = screen.getByText(/42/);
    expect(el).toHaveClass("text-gousse-muted");
    expect(el).not.toHaveClass("text-gousse-high");
    // Still legible as the debit it is — nothing is struck through or hidden.
    expect(el).toHaveClass("tabular-nums");
    expect(el.textContent).toMatch(/^-/);
  });

  it("excluded: leaves a counted amount untouched", () => {
    render(<AmountCell amount={-42} excluded={false} />);
    expect(screen.getByText(/42/)).toHaveClass("text-gousse-high");
  });
});

const issuer: Issuer = {
  id: 1 as Issuer["id"],
  name: "Spotify",
  createdAt: new Date(),
  firstSeen: new Date(),
};

describe("IssuerCell", () => {
  it("resolved: shows the issuer name and an avatar, never its initial", () => {
    render(<IssuerCell rawIssuerString="SPOTIFY P2A34" issuer={issuer} />);
    expect(screen.getByText("Spotify")).toBeInTheDocument();
    expect(screen.queryByText("SPOTIFY P2A34")).not.toBeInTheDocument();
    // The letter fallback is gone (issue #59). This issuer has neither an image
    // nor a default category, so its avatar is the chain's neutral grey rung —
    // a `?`, not an `S`.
    expect(screen.queryByText("S")).not.toBeInTheDocument();
    expect(screen.getByTestId("issuer-avatar")).toHaveAttribute("data-avatar", "none");
  });

  it("unresolved: marks the raw text as a field still to fill", () => {
    render(<IssuerCell rawIssuerString="SPOTIFY P2A34" />);
    expect(screen.getByText("SPOTIFY P2A34")).toBeInTheDocument();
    const cell = screen.getByText("SPOTIFY P2A34").closest("[data-unresolved]");
    expect(cell).toHaveAttribute("data-unresolved", "true");
    // The to-do is said here, in the field that is empty — red with a dotted
    // underline, matching the row's gutter rail. Muted italic (what this was)
    // read as "unimportant" rather than "unfinished".
    expect(cell).toHaveClass("text-gousse-high");
    expect(cell).toHaveClass("decoration-dotted");
  });

  it("manual: marks a hand-picked issuer, mirroring an overridden category", () => {
    render(<IssuerCell rawIssuerString="SPOTIFY P2A34" issuer={issuer} isManual />);
    const el = screen.getByText("Spotify");
    expect(el).toBeInTheDocument();
    // Same marker the Category override carries: a data hook + a pin glyph, so
    // a hand-picked issuer reads as the exception it is.
    const marked = el.closest("[data-manual]");
    expect(marked).toHaveAttribute("data-manual", "true");
  });

  it("rule-matched: leaves an auto-derived issuer plain, no marker", () => {
    render(<IssuerCell rawIssuerString="SPOTIFY P2A34" issuer={issuer} />);
    const el = screen.getByText("Spotify");
    expect(el.closest("[data-manual]")).toBeNull();
  });
});

const category: Category = {
  id: 5 as Category["id"],
  name: "Groceries",
  slug: "groceries",
  color: "#0f0",
  icon: "shopping-cart",
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

  it("shows the leaf name alone at depth 3 — depth adds navigation, never identity", () => {
    // A leaf three levels deep (Life › Utilities › Electricity). Deeper nesting
    // (issue #33) only lengthens the path, so it argues *for* the leaf-only rule:
    // the cell still reads the leaf name, never any ancestor and never a path.
    const deep: Category = {
      ...category,
      id: 9 as Category["id"],
      name: "Electricity",
      slug: "electricity",
      parentId: 8 as Category["id"],
    };
    render(<CategoryCell category={deep} />);
    expect(screen.getByText("Electricity")).toBeInTheDocument();
    expect(screen.queryByText(/Life|Utilities/)).not.toBeInTheDocument();
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
    expect(el.closest("[data-unassigned]")).toHaveAttribute("data-unassigned", "true");
  });
});

describe("NotesCell", () => {
  it("noted: shows the note text with the full text on the tooltip", () => {
    render(<NotesCell notes="lunch with the team" />);
    const el = screen.getByText("lunch with the team");
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass("truncate");
    expect(el).toHaveAttribute("title", "lunch with the team");
  });

  it("empty: shows an Add note affordance when there is no note", () => {
    render(<NotesCell />);
    const el = screen.getByText("Add note");
    expect(el.closest("[data-empty]")).toHaveAttribute("data-empty", "true");
  });

  it("blank-only note reads as empty, not as a note", () => {
    render(<NotesCell notes="   " />);
    expect(screen.getByText("Add note")).toBeInTheDocument();
  });
});
