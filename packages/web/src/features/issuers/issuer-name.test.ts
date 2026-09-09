import type { Issuer } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { hasExactIssuerName } from "./issuer-name";

function issuer(name: string): Issuer {
  return {
    id: 1 as Issuer["id"],
    name,
    createdAt: new Date("2026-01-01"),
    firstSeen: new Date("2026-01-01"),
  } as Issuer;
}

const issuers = [issuer("Spotify"), issuer("Amazon")];

describe("hasExactIssuerName", () => {
  it("matches an exact name", () => {
    expect(hasExactIssuerName(issuers, "Spotify")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(hasExactIssuerName(issuers, "spOTifY")).toBe(true);
  });

  it("ignores surrounding whitespace on the candidate name", () => {
    expect(hasExactIssuerName(issuers, "  Amazon  ")).toBe(true);
  });

  it("ignores surrounding whitespace on the stored name", () => {
    expect(hasExactIssuerName([issuer("  Netflix  ")], "Netflix")).toBe(true);
  });

  it("returns false when no issuer shares the name", () => {
    expect(hasExactIssuerName(issuers, "Disney")).toBe(false);
  });

  it("does not treat a substring as a match", () => {
    expect(hasExactIssuerName(issuers, "Spot")).toBe(false);
  });
});
