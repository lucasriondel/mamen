import type { Transaction } from "@mamen/shared/contract";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RawSourceSection } from "./raw-source-section";

/**
 * One Green-Got row exactly as the bank delivers it (issue #177): thirteen
 * columns, French headers, mapped and unmapped side by side. The account numbers
 * are **assembled** rather than written out, so this file carries no matchable
 * one — the convention the bank-statement scan holds every file in the tree to
 * (issue #108).
 */
const BANK_ROW: Record<string, string> = {
  "N° transaction": "000000000000000000000015",
  Statut: "COMPLETE",
  Date: "2026-01-20T09:12:00.000Z",
  Montant: "9.99",
  Arrondi: "0.01",
  Direction: "DEBIT",
  Devise: "EUR",
  "IBAN du compte": `FR7699999${"0".repeat(18)}`,
  Intitulé: "SPOTIFY P2A34",
  "IBAN du tiers": `FR7699999${"1".repeat(18)}`,
  "Moyen de paiement": "ECOMMERCE",
  Catégorie: "SUBSCRIPTIONS",
  Référence: "",
};

/**
 * A minimal row — the section reads `rawSource` and nothing else. Cast through
 * `unknown` like every other web fixture, which is exactly why the coverage here
 * is written by hand: a field lands silently, with no type error to catch a miss.
 */
function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 100,
    accountId: 1,
    date: new Date("2026-01-20T00:00:00Z"),
    amount: -9.99,
    rawIssuerString: "SPOTIFY P2A34",
    importedAt: new Date(),
    importMonth: "2026-01",
    ...over,
  } as unknown as Transaction;
}

/** The block, found by its heading — the label is what makes it the bank's. */
function block() {
  return screen
    .getByRole("heading", { name: /bank's own words/i })
    .closest("section") as HTMLElement;
}

/** Opens the disclosure, which starts closed on every render. */
async function expand() {
  await userEvent.setup().click(screen.getByRole("button", { name: /bank's own words/i }));
}

describe("RawSourceSection", () => {
  it("lists every column the bank sent, keys in the bank's own words", async () => {
    render(<RawSourceSection transaction={tx({ rawSource: BANK_ROW })} />);
    await expand();

    const fields = within(block()).getAllByRole("term");
    // Verbatim and in the bank's order — untranslated, accents and all, and no
    // key filtered out for being mapped to a real field (`Date`, `Montant`,
    // `Intitulé`).
    expect(fields.map((dt) => dt.textContent)).toEqual(Object.keys(BANK_ROW));
    expect(within(block()).getByText("SPOTIFY P2A34")).toBeVisible();
    expect(within(block()).getByText("ECOMMERCE")).toBeVisible();
  });

  // A dozen columns of reference material must not push the fields the user
  // curates every day off the screen — so the label shows and the rest waits to
  // be asked for.
  it("keeps the archive collapsed until it is asked for", async () => {
    render(<RawSourceSection transaction={tx({ rawSource: BANK_ROW })} />);

    const trigger = screen.getByRole("button", { name: /bank's own words/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("SPOTIFY P2A34")).toBeNull();

    await expand();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("SPOTIFY P2A34")).toBeVisible();
  });

  // Green-Got's own `Catégorie` lives here and nowhere else: under the bank's
  // name it is provenance, and it is free to disagree with mamen's **derived
  // category** without reading as a bug.
  it("shows the bank's own Catégorie inside the block, as the bank's word", async () => {
    render(<RawSourceSection transaction={tx({ rawSource: BANK_ROW })} />);
    await expand();

    const term = within(block()).getByText("Catégorie");
    expect(term.tagName).toBe("DT");
    expect(within(block()).getAllByText("SUBSCRIPTIONS")).toHaveLength(1);
    // Never relabelled to mamen's word for it.
    expect(within(block()).queryByText("Category")).toBeNull();
  });

  // Story 11/12: a PDF-extracted row, or anything imported before the archive
  // existed, has no bank row to show. An empty block would look broken.
  it("renders nothing at all when the row carries no raw source", () => {
    const { container } = render(<RawSourceSection transaction={tx()} />);

    expect(container).toBeEmptyDOMElement();
  });

  // A column the bank sent empty is still a column it sent — the key stays, so
  // the list matches the statement column for column.
  it("keeps a column the bank left empty, as an empty value", async () => {
    render(<RawSourceSection transaction={tx({ rawSource: BANK_ROW })} />);
    await expand();

    const reference = within(block()).getByText("Référence").closest("div") as HTMLElement;
    expect(within(reference).getByText("—")).toBeVisible();
  });
});
