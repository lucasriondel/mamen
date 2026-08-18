import { describe, expect, it } from "vitest";
import { escapeRegex } from "./escape-regex";

/** The flags the rule matcher compiles a pattern with. */
const matches = (pattern: string, subject: string) => new RegExp(pattern, "i").test(subject);

describe("escapeRegex", () => {
  it("leaves a string with no metacharacters untouched", () => {
    expect(escapeRegex("ACME PAYROLL")).toBe("ACME PAYROLL");
  });

  it("escapes every metacharacter the matcher would interpret", () => {
    expect(escapeRegex(".*+?^${}()|[]\\")).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  });

  it("leaves hyphens and slashes alone (not special outside a class)", () => {
    expect(escapeRegex("EDF - PRLV/SEPA")).toBe("EDF - PRLV/SEPA");
  });

  // The two failure modes the escaping exists to prevent.
  describe("raw counterparty strings", () => {
    it("makes a would-be over-matching pattern literal", () => {
      // Unescaped, `N*` is zero-or-more N — it matches a shorter string.
      expect(matches("AMAZON*MKTPLACE", "AMAZOMKTPLACE")).toBe(true);

      const escaped = escapeRegex("AMAZON*MKTPLACE");
      expect(matches(escaped, "AMAZOMKTPLACE")).toBe(false);
      expect(matches(escaped, "AMAZON*MKTPLACE")).toBe(true);
    });

    it("makes a would-be uncompilable pattern valid", () => {
      // The constructor is the subject, not a long-hand literal: the matcher
      // compiles a *string* a user typed, and what is asserted is what
      // happens at compile time. Biome's fix for this rewrites both lines to
      // regex literals — which turns the second one into a block comment and
      // the first into an expression that cannot throw.
      // biome-ignore lint/complexity/useRegexLiterals: a runtime-compiled pattern is the subject
      expect(() => new RegExp("PAYPAL *EBAY", "i")).not.toThrow();
      // A leading `*` has nothing to repeat. Both linters want their directive
      // on the line directly above, so oxlint's is a block and biome's keeps
      // the slot.
      /* oxlint-disable no-invalid-regexp -- the pattern being uncompilable is the assertion */
      // biome-ignore lint/complexity/useRegexLiterals: `/*BOULANGERIE/i` is a comment, not a regex
      expect(() => new RegExp("*BOULANGERIE", "i")).toThrow();
      /* oxlint-enable no-invalid-regexp */
      expect(matches(escapeRegex("*BOULANGERIE"), "SUMUP *BOULANGERIE")).toBe(true);
    });

    it("keeps parenthesised suffixes matching literally", () => {
      const escaped = escapeRegex("CARREFOUR (PARIS)");
      expect(matches(escaped, "CARREFOUR (PARIS)")).toBe(true);
      // Unescaped, the parens are a group and vanish from the match.
      expect(matches("CARREFOUR (PARIS)", "CARREFOUR PARIS")).toBe(true);
      expect(matches(escaped, "CARREFOUR PARIS")).toBe(false);
    });

    it("survives a round trip for an arbitrary metacharacter soup", () => {
      const raw = "SNCF+ TGV [2ND] ^ 50% {A|B} $EUR";
      expect(matches(escapeRegex(raw), raw)).toBe(true);
    });
  });
});
