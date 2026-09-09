import type { Category, Issuer, RecapSummary } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { NEUTRAL_CATEGORY_COLOR } from "@/lib/category-tree";
import { type SpendRow, toSpendRows, UNASSIGNED_LABEL } from "./spend-rows";

function issuer(id: number, name: string, imageUrl?: string, defaultCategoryId?: number): Issuer {
  return { id, name, imageUrl, defaultCategoryId } as unknown as Issuer;
}

function category(id: number, name: string, icon?: string, over: Partial<Category> = {}): Category {
  return {
    id,
    name,
    icon,
    color: null,
    parentId: null,
    ...over,
  } as unknown as Category;
}

// Food is a folder that stored a colour; Groceries is a leaf that **inherits** it
// (ADR 0006). Streaming stores neither icon nor colour and inherits nothing, so
// it exercises the neutral terminator.
const lookups = {
  issuersById: new Map([
    [1, issuer(1, "Amazon", "/uploads/issuers/amazon.png")],
    [2, issuer(2, "Netflix", undefined, 20)],
  ]),
  categoriesById: new Map([
    [1, category(1, "Food", "utensils-crossed", { color: "#ef4444" })],
    [10, category(10, "Groceries", "shopping-cart", { parentId: 1 })],
    [20, category(20, "Streaming")],
  ]),
};

/** A server summary; every field defaults to "nothing in this period". */
function summary(over: Partial<RecapSummary> = {}): RecapSummary {
  return {
    byIssuer: [],
    byCategory: [],
    transfers: { total: 0, count: 0 },
    ...over,
  } as RecapSummary;
}

const byName = (rows: readonly SpendRow[]) => Object.fromEntries(rows.map((r) => [r.name, r]));

describe("toSpendRows", () => {
  // The arithmetic is the server's; this only names the buckets it hands back.
  it("carries each bucket's total and count through under its name", () => {
    const { byIssuer, byCategory } = toSpendRows(
      summary({
        byIssuer: [{ id: 1, spent: 15, count: 2 }],
        byCategory: [{ id: 10, spent: 15, count: 2 }],
      } as Partial<RecapSummary>),
      lookups,
    );
    expect(byIssuer[0]).toMatchObject({
      id: 1,
      name: "Amazon",
      spent: 15,
      count: 2,
    });
    expect(byCategory[0]).toMatchObject({
      id: 10,
      name: "Groceries",
      spent: 15,
    });
  });

  // The server reports unattributed spend as a `null`-keyed bucket rather than
  // dropping it; the page is where that bucket gets its name.
  it("labels the null bucket Unassigned", () => {
    const { byIssuer, byCategory } = toSpendRows(
      summary({
        byIssuer: [{ id: null, spent: 14, count: 2 }],
        byCategory: [{ id: null, spent: 14, count: 2 }],
      } as Partial<RecapSummary>),
      lookups,
    );
    expect(byName(byIssuer)[UNASSIGNED_LABEL]).toMatchObject({
      id: null,
      spent: 14,
      count: 2,
    });
    expect(byName(byCategory)[UNASSIGNED_LABEL]).toMatchObject({ id: null });
  });

  it("labels a bucket Unassigned when its id has no lookup entry", () => {
    const { byIssuer } = toSpendRows(
      summary({
        byIssuer: [{ id: 999, spent: 10, count: 1 }],
      } as Partial<RecapSummary>),
      lookups,
    );
    expect(byIssuer[0]).toMatchObject({ id: 999, name: UNASSIGNED_LABEL });
  });

  it("carries the issuer image, category icon and resolved colour onto their rows", () => {
    const { byIssuer, byCategory } = toSpendRows(
      summary({
        byIssuer: [
          { id: 1, spent: 10, count: 1 },
          { id: 2, spent: 5, count: 1 },
        ],
        byCategory: [
          { id: 10, spent: 8, count: 1 },
          { id: 20, spent: 3, count: 1 },
          { id: null, spent: 1, count: 1 },
        ],
      } as Partial<RecapSummary>),
      lookups,
    );
    const issuers = byName(byIssuer);
    expect(issuers.Amazon.imageUrl).toBe("/uploads/issuers/amazon.png");
    expect(issuers.Netflix.imageUrl).toBeUndefined();

    const categories = byName(byCategory);
    expect(categories.Groceries.icon).toBe("shopping-cart");
    expect(categories.Streaming.icon).toBeUndefined();
    // The colour is *resolved* here, where the whole lookup is in hand: an
    // inheriting leaf carries its folder's, and a row inheriting from nobody
    // carries the neutral constant (ADR 0006).
    expect(categories.Groceries.color).toBe("#ef4444");
    expect(categories.Streaming.color).toBe(NEUTRAL_CATEGORY_COLOR);
    // The Unassigned bucket has no category at all, so there is nothing to
    // resolve — it must not borrow the neutral constant and read as a category.
    expect(categories.Unassigned.color).toBeUndefined();
  });

  it("carries the issuer's default category onto its row, for the avatar fallback", () => {
    // The **Avatar fallback chain** (issue #59) needs the issuer's default
    // category id to paint its second rung, and the row is all the section hands
    // the avatar. Resolving the icon and colour stays in the avatar; this only
    // has to not drop the id on the way through.
    const { byIssuer } = toSpendRows(
      summary({
        byIssuer: [
          { id: 1, spent: 10, count: 1 },
          { id: 2, spent: 5, count: 1 },
          { id: null, spent: 2, count: 1 },
        ],
      } as Partial<RecapSummary>),
      lookups,
    );
    const issuers = byName(byIssuer);
    expect(issuers.Netflix.defaultCategoryId).toBe(20);
    expect(issuers.Amazon.defaultCategoryId).toBeUndefined();
    // The Unassigned bucket has no issuer, so it has no category to fall back to
    // and must reach the avatar's neutral grey rung.
    expect(issuers.Unassigned.defaultCategoryId).toBeUndefined();
  });

  it("passes the transfer summary through untouched", () => {
    const { transfers } = toSpendRows(summary({ transfers: { total: 30, count: 2 } }), lookups);
    expect(transfers).toEqual({ total: 30, count: 2 });
  });

  it("returns empty sections for an empty period", () => {
    const { byIssuer, byCategory, transfers } = toSpendRows(summary(), lookups);
    expect(byIssuer).toEqual([]);
    expect(byCategory).toEqual([]);
    expect(transfers).toEqual({ total: 0, count: 0 });
  });
});
