import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryIcon, isIconName } from "./category-icon";

/**
 * The **Icon name** render boundary (ADR 0006, issue #55). What matters here is
 * the *degradation*: a category is user data, so an icon column can hold anything
 * — a leftover emoji, a typo, an id from a newer Lucide — and none of those may
 * leave a hole in a row.
 */

/** The rendered glyph, whether it resolved or fell back. */
const glyph = () => document.querySelector("[data-category-icon]");

describe("CategoryIcon", () => {
  it("recognises Lucide ids and rejects everything else", () => {
    expect(isIconName("shopping-cart")).toBe(true);
    expect(isIconName("tag")).toBe(true);
    // The PascalCase React export is *not* the id (ADR 0006), nor is an emoji.
    expect(isIconName("ShoppingCart")).toBe(false);
    expect(isIconName("🛒")).toBe(false);
    expect(isIconName("")).toBe(false);
  });

  it("resolves a known name to a lazily-loaded Lucide svg", async () => {
    render(<CategoryIcon name="shopping-cart" />);
    // The chunk is fetched on mount, so the svg arrives a tick later — the
    // placeholder holds the box until it does.
    await waitFor(() => {
      expect(glyph()?.tagName.toLowerCase()).toBe("svg");
    });
    expect(glyph()).toHaveAttribute("data-category-icon", "shopping-cart");
  });

  it("renders the fallback glyph for an unresolvable name, not a blank", () => {
    // Synchronous: an unknown id never reaches the lazy loader, so there is no
    // window in which the row is empty.
    render(<CategoryIcon name="🛒" />);
    const fallback = glyph();
    expect(fallback).toHaveAttribute("data-category-icon", "fallback");
    expect(fallback?.tagName.toLowerCase()).toBe("svg");
  });

  it("paints the resolved colour onto the glyph", async () => {
    render(<CategoryIcon name="shopping-cart" color="#ef4444" />);
    await waitFor(() => {
      expect(glyph()).toHaveAttribute("stroke", "#ef4444");
    });
  });

  it("hides the glyph from assistive tech — the name beside it is the label", () => {
    render(<CategoryIcon name="not-an-icon" />);
    expect(glyph()).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
  });
});
