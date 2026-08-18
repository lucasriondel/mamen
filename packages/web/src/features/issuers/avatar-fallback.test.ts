import type { Category, CategoryId } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { NEUTRAL_CATEGORY_COLOR } from "@/lib/category-tree";
import { INK_DARK, readableInk } from "@/lib/color";
import { issuerAvatarFallback } from "./avatar-fallback";

function category(overrides: Partial<Category> & { id: number }): Category {
  return {
    name: "Groceries",
    slug: "groceries",
    color: null,
    icon: "shopping-cart",
    parentId: null,
    sortOrder: 0,
    createdAt: new Date("2026-01-01"),
    ...overrides,
    id: overrides.id as CategoryId,
  } as Category;
}

/** Food & Drink (a folder that chose a colour) › Groceries (a leaf that did not). */
const FOLDER = category({
  id: 1,
  name: "Food & Drink",
  slug: "food-drink",
  icon: "utensils",
  color: "#ef4444",
});
const LEAF = category({
  id: 2,
  parentId: 1 as CategoryId,
  icon: "shopping-cart",
});
const TREE = [FOLDER, LEAF];

describe("issuerAvatarFallback", () => {
  it("resolves an issuer's default category to its icon on its resolved colour", () => {
    expect(issuerAvatarFallback(TREE, 2)).toEqual({
      icon: "shopping-cart",
      color: "#ef4444",
      ink: readableInk("#ef4444"),
    });
  });

  it("takes the assigned leaf's own icon, never the folder's", () => {
    // The colour is the folder's — that is the whole point of inheritance — but
    // the *icon* is not inherited, so two issuers filed under one folder stay
    // distinguishable from each other (issue #59).
    const fallback = issuerAvatarFallback(TREE, 2);
    expect(fallback?.icon).toBe("shopping-cart");
    expect(fallback?.icon).not.toBe(FOLDER.icon);
  });

  it("prefers a leaf's own colour over the folder it hangs under", () => {
    const opted = category({
      id: 3,
      parentId: 1 as CategoryId,
      icon: "coffee",
      color: "#3b82f6",
    });
    expect(issuerAvatarFallback([...TREE, opted], 3)?.color).toBe("#3b82f6");
  });

  /**
   * The AC's grey rung, and the reason it is a rung rather than the seeded
   * *Uncategorised* Category: that category is a leaf under *Income & Other*, so
   * routing "no category" through it would paint a real folder's violet and make
   * an uncategorised issuer indistinguishable from a genuine Income & Other one.
   *
   * The `categories` argument is a booby trap: any property read on it throws.
   * That is what pins "with no category lookup" — a resolver that touched the
   * list before checking the id would fail here even though it returned the
   * right answer.
   */
  it("returns nothing for an issuer with no default category, without reading the tree", () => {
    const explode = new Proxy([] as Category[], {
      get() {
        throw new Error("read the category tree for an issuer that has none");
      },
    });
    expect(issuerAvatarFallback(explode, undefined)).toBeUndefined();
    expect(issuerAvatarFallback(explode, null)).toBeUndefined();
  });

  it("returns nothing when the tree has not arrived yet", () => {
    // An empty list is the query's pending state, and telling that from "the
    // category is gone" is not this function's job — it cannot; both are just a
    // missing id. The query status is what separates them, so the avatar owns
    // the distinction, and only it knows this window must draw an empty chip
    // rather than the grey `?`. Pinned in issuer-avatar.test.tsx.
    expect(issuerAvatarFallback([], 2)).toBeUndefined();
  });

  it("still resolves a category whose ancestry chose nothing, via the neutral colour", () => {
    const orphan = category({ id: 9, icon: "tag" });
    expect(issuerAvatarFallback([orphan], 9)).toEqual({
      icon: "tag",
      color: NEUTRAL_CATEGORY_COLOR,
      ink: readableInk(NEUTRAL_CATEGORY_COLOR),
    });
  });

  it("degrades a colour it cannot paint on to the neutral one, keeping the ink honest", () => {
    // `color` is an unconstrained string in the contract. A value CSS cannot
    // parse would leave the chip transparent while the ink was chosen for a
    // surface that was never drawn — so the surface is normalised, not the ink.
    const bogus = category({ id: 4, icon: "tag", color: "chartreuse" });
    expect(issuerAvatarFallback([bogus], 4)).toEqual({
      icon: "tag",
      color: NEUTRAL_CATEGORY_COLOR,
      ink: INK_DARK,
    });
  });
});
