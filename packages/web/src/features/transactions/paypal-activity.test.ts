import { describe, expect, it } from "vitest";
import { isPaypalRawIssuer, paypalActivityUrl, toIsoDay } from "./paypal-activity";

describe("isPaypalRawIssuer", () => {
  it("matches PayPal bank labels whatever their casing or shape", () => {
    expect(isPaypalRawIssuer("PayPal Europe S.a.r.l. et Cie S.C.A")).toBe(true);
    expect(isPaypalRawIssuer("PAYPAL *EBAY")).toBe(true);
    expect(isPaypalRawIssuer("SEPA paypal 123")).toBe(true);
  });

  it("does not match other counterparties", () => {
    expect(isPaypalRawIssuer("CARREFOUR PARIS")).toBe(false);
    expect(isPaypalRawIssuer("")).toBe(false);
  });
});

describe("toIsoDay", () => {
  it("formats the local calendar day, not the UTC one", () => {
    // Local midnight: a UTC-based format would roll back a day west of GMT.
    expect(toIsoDay(new Date(2026, 0, 15))).toBe("2026-01-15");
    expect(toIsoDay(new Date(2026, 11, 1, 23, 59))).toBe("2026-12-01");
  });
});

describe("paypalActivityUrl", () => {
  it("windows the feed on the five days up to the transaction date", () => {
    expect(paypalActivityUrl(new Date(2026, 0, 15))).toBe(
      "https://www.paypal.com/myaccount/activities/?start_date=2026-01-10&end_date=2026-01-15",
    );
  });

  it("rolls the start date back across a month boundary", () => {
    expect(paypalActivityUrl(new Date(2026, 2, 3))).toBe(
      "https://www.paypal.com/myaccount/activities/?start_date=2026-02-26&end_date=2026-03-03",
    );
  });

  it("does not mutate the date it is given", () => {
    const date = new Date(2026, 0, 15);
    paypalActivityUrl(date);
    expect(toIsoDay(date)).toBe("2026-01-15");
  });
});
