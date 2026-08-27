import { describe, expect, it } from "vitest";
import { suggestedFormatName } from "./suggested-format-name";

describe("suggestedFormatName", () => {
  it("names the account and the file kind, in the app's own casing", () => {
    expect(suggestedFormatName("Boursorama", "csv")).toBe("Boursorama CSV");
    expect(suggestedFormatName("Revolut", "pdf")).toBe("Revolut PDF");
  });

  // The union's tags are lower-case and the copy is not; the mapping is the
  // point, so a change to either vocabulary trips this rather than shipping
  // "Revolut pdf".
  it("upper-cases the kind rather than interpolating the union's tag", () => {
    expect(suggestedFormatName("Revolut", "pdf")).not.toContain("pdf");
    expect(suggestedFormatName("Boursorama", "csv")).not.toContain("csv");
  });

  // Close to unreachable — the account is settled before a file is taken — but
  // the string it produces has to be a name, not a bug on screen.
  it("falls back to the file kind alone when no account is known", () => {
    expect(suggestedFormatName(null, "pdf")).toBe("PDF");
    expect(suggestedFormatName(null, "csv")).toBe("CSV");
  });

  it("treats a blank account name as no account rather than a leading space", () => {
    expect(suggestedFormatName("   ", "csv")).toBe("CSV");
    expect(suggestedFormatName("", "pdf")).toBe("PDF");
  });

  it("keeps the account's name as the user spelled it, inner spaces included", () => {
    expect(suggestedFormatName("  Crédit Agricole  ", "csv")).toBe("Crédit Agricole CSV");
  });
});
