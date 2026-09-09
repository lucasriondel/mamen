import type { Issuer } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ISSUER_SORT,
  type IssuerMetrics,
  issuerMetrics,
  nextIssuerSort,
  sortIssuers,
} from "./issuer-sort";

function metric(
  name: string,
  count: number,
  net: number,
  value: number,
  excludedFromRecap?: boolean,
): IssuerMetrics {
  return {
    issuer: { id: 1 as Issuer["id"], name, excludedFromRecap } as Issuer,
    count,
    net,
    value,
  };
}

const names = (m: readonly IssuerMetrics[]) => m.map((x) => x.issuer.name);

describe("sortIssuers by recap exclusion", () => {
  const counted = metric("counted", 1, -10, 10);
  const excluded = metric("excluded", 1, -10, 10, true);
  const alsoCounted = metric("also counted", 1, -10, 10, false);

  it("groups the excluded issuers first by default (desc)", () => {
    const out = sortIssuers([counted, excluded, alsoCounted], {
      key: "recap",
      direction: "desc",
    });
    expect(names(out)).toEqual(["excluded", "also counted", "counted"]);
  });

  it("groups the counted issuers first when flipped (asc)", () => {
    const out = sortIssuers([counted, excluded, alsoCounted], {
      key: "recap",
      direction: "asc",
    });
    expect(names(out)).toEqual(["also counted", "counted", "excluded"]);
  });

  it("treats an absent flag as counted, like the cell does", () => {
    // `excludedFromRecap` is optional on the wire; only `true` means excluded,
    // so an issuer that has never been touched ranks with the counted ones.
    const out = sortIssuers([excluded, counted], { key: "recap", direction: "asc" });
    expect(names(out)).toEqual(["counted", "excluded"]);
  });

  it("breaks ties by name A→Z in both directions", () => {
    // Within each group the order must not jitter — same rule as count/value.
    const b = metric("beta", 1, -10, 10, true);
    const a = metric("alpha", 1, -10, 10, true);
    expect(names(sortIssuers([b, a], { key: "recap", direction: "desc" }))).toEqual([
      "alpha",
      "beta",
    ]);
    expect(names(sortIssuers([b, a], { key: "recap", direction: "asc" }))).toEqual([
      "alpha",
      "beta",
    ]);
  });
});

describe("sortIssuers", () => {
  const zebra = metric("Zebra", 1, -10, 10);
  const apple = metric("apple", 5, -50, 50);
  const mango = metric("Mango", 3, 30, 30);

  it("defaults to alphabetical A→Z, case-insensitively", () => {
    const out = sortIssuers([zebra, apple, mango], DEFAULT_ISSUER_SORT);
    expect(names(out)).toEqual(["apple", "Mango", "Zebra"]);
  });

  it("sorts by name descending (Z→A)", () => {
    const out = sortIssuers([zebra, apple, mango], {
      key: "name",
      direction: "desc",
    });
    expect(names(out)).toEqual(["Zebra", "Mango", "apple"]);
  });

  it("sorts by transaction count", () => {
    expect(names(sortIssuers([zebra, apple, mango], { key: "count", direction: "asc" }))).toEqual([
      "Zebra",
      "Mango",
      "apple",
    ]);
    expect(names(sortIssuers([zebra, apple, mango], { key: "count", direction: "desc" }))).toEqual([
      "apple",
      "Mango",
      "Zebra",
    ]);
  });

  it("sorts by total value (absolute money moved)", () => {
    expect(names(sortIssuers([zebra, apple, mango], { key: "value", direction: "desc" }))).toEqual([
      "apple",
      "Mango",
      "Zebra",
    ]);
  });

  it("breaks numeric ties by name A→Z regardless of direction", () => {
    const a = metric("Beta", 2, 0, 0);
    const b = metric("Alpha", 2, 0, 0);
    expect(names(sortIssuers([a, b], { key: "count", direction: "desc" }))).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(names(sortIssuers([a, b], { key: "count", direction: "asc" }))).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [zebra, apple, mango];
    sortIssuers(input, DEFAULT_ISSUER_SORT);
    expect(names(input)).toEqual(["Zebra", "apple", "Mango"]);
  });
});

describe("issuerMetrics", () => {
  const iss = { id: 1 as Issuer["id"], name: "Acme" } as Issuer;

  it("sums net (signed) and value (absolute) separately", () => {
    const m = issuerMetrics(iss, [{ amount: -30 }, { amount: 20 }], 2);
    expect(m).toEqual({ issuer: iss, count: 2, net: -10, value: 50 });
  });

  it("takes count from the passed total, not the scanned length", () => {
    // The scanned page can be capped below the true count.
    const m = issuerMetrics(iss, [{ amount: -5 }], 999);
    expect(m.count).toBe(999);
  });

  it("is zero for an issuer with no transactions", () => {
    expect(issuerMetrics(iss, [], 0)).toEqual({
      issuer: iss,
      count: 0,
      net: 0,
      value: 0,
    });
  });
});

describe("nextIssuerSort", () => {
  it("flips direction when the active key is re-selected", () => {
    expect(nextIssuerSort({ key: "name", direction: "asc" }, "name")).toEqual({
      key: "name",
      direction: "desc",
    });
    expect(nextIssuerSort({ key: "count", direction: "desc" }, "count")).toEqual({
      key: "count",
      direction: "asc",
    });
  });

  it("adopts a key's default direction when switching to it", () => {
    expect(nextIssuerSort({ key: "name", direction: "asc" }, "count")).toEqual({
      key: "count",
      direction: "desc",
    });
    expect(nextIssuerSort({ key: "count", direction: "asc" }, "name")).toEqual({
      key: "name",
      direction: "asc",
    });
    expect(nextIssuerSort({ key: "name", direction: "desc" }, "value")).toEqual({
      key: "value",
      direction: "desc",
    });
  });
});
