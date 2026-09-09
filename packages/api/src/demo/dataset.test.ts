import { assert, describe, it } from "@effect/vitest";
import { TRANSFER_DATE_WINDOW_DAYS } from "@mamen/shared/contract";
import { deriveBundleParent } from "../transactions/bundle-derivation";
import { buildDemoDataset, DEMO_MONTHS, RESERVED_IBAN_PREFIX } from "./dataset";

/**
 * The demo dataset (issue #139) is a pure function of nothing: no clock, no
 * randomness that is not seeded, no environment. Everything a screenshot depends
 * on — the amounts, the dates, the ids, the groupings — is decided here, so the
 * database the seeder writes is the same database on every machine.
 *
 * These tests are about the *shape traps* the ticket names: a grouping id that
 * has to be the smallest leg's, a bundle parent whose amount has to be what its
 * members sum to, a required `importMonth`, dates that must not come from a
 * clock. Each of them makes a screen look broken rather than throwing, which is
 * why they are asserted rather than left to the seeder's SQL.
 */

const data = buildDemoDataset();
const cents = (amount: number) => Math.round(amount * 100);
const byId = new Map(data.transactions.map((t) => [t.id, t]));

/** Every French IBAN a string carries, matched as loosely as the repo guard does. */
const ibansIn = (text: string) => text.match(/FR[0-9A-Z]{25}/g) ?? [];

describe("the demo dataset", () => {
  it("is the same dataset every time it is built", () => {
    assert.deepStrictEqual(buildDemoDataset(), data);
  });

  it("carries only account numbers that cannot be real", () => {
    const ibans = data.transactions.flatMap((t) => ibansIn(t.rawIssuerString));

    // A transfer leg names the account the money went to, so the dataset does
    // carry IBANs; if it stops, the assertion below passes vacuously.
    assert.isAbove(ibans.length, 0);
    assert.deepStrictEqual(
      ibans.filter((iban) => !iban.startsWith(RESERVED_IBAN_PREFIX)),
      [],
    );
  });

  it("has enough of everything for a screenshot to be worth publishing", () => {
    assert.isAtLeast(data.accounts.length, 3);
    assert.isAtLeast(data.issuers.length, 15);
    assert.isAtLeast(data.rules.length, 10);
    assert.isAtLeast(data.transactions.length, 150);
    assert.isAtLeast(data.subscriptions.length, 4);
  });

  it("numbers its rows 1..n in date order, the way an import would", () => {
    assert.deepStrictEqual(
      data.transactions.map((t) => t.id),
      data.transactions.map((_, index) => index + 1),
    );

    const dates = data.transactions.map((t) => t.date);
    assert.deepStrictEqual(dates, [...dates].sort());
  });

  it("spends in whole cents, and both directions are represented", () => {
    for (const t of data.transactions) {
      assert.strictEqual(t.amount, cents(t.amount) / 100, t.rawIssuerString);
    }
    assert.isAbove(data.transactions.filter((t) => t.amount < 0).length, 100);
    assert.isAbove(data.transactions.filter((t) => t.amount > 0).length, 5);
  });

  it("stamps every row with the month its own date falls in", () => {
    for (const t of data.transactions) {
      assert.strictEqual(t.importMonth, t.date.slice(0, 7), t.rawIssuerString);
      assert.include(DEMO_MONTHS, t.importMonth);
    }
    assert.isAtLeast(DEMO_MONTHS.length, 2);
  });

  it("dates rows at midday UTC, so no timezone reads them a day out", () => {
    for (const t of data.transactions) {
      assert.match(t.date, /T12:00:00\.000Z$/);
    }
  });

  it("gives every transfer group the smallest leg's id, on both legs", () => {
    const groups = new Map<number, typeof data.transactions>();
    for (const t of data.transactions) {
      if (t.transferGroupId === null) continue;
      groups.set(t.transferGroupId, [...(groups.get(t.transferGroupId) ?? []), t]);
    }
    assert.isAtLeast(groups.size, 1);

    for (const [groupId, legs] of groups) {
      assert.strictEqual(groupId, Math.min(...legs.map((l) => l.id)));
      assert.isAtLeast(legs.length, 2);
      // Balanced, across accounts, and close enough in time that the app would
      // have detected the pair itself.
      assert.strictEqual(
        legs.reduce((sum, l) => sum + cents(l.amount), 0),
        0,
      );
      assert.strictEqual(new Set(legs.map((l) => l.accountId)).size, legs.length);
      const days = legs.map((l) => Date.parse(l.date) / 86_400_000);
      assert.isAtMost(Math.max(...days) - Math.min(...days), TRANSFER_DATE_WINDOW_DAYS);
    }
  });

  it("leaves one pair ungrouped, so the Transfers page has something to confirm", () => {
    const loose = data.transactions.filter(
      (t) =>
        t.transferGroupId === null &&
        t.bundleId === null &&
        t.isRefund === 0 &&
        t.rawIssuerString.includes("COMPTE JOINT"),
    );
    assert.strictEqual(loose.length, 2);
    assert.strictEqual(
      loose.reduce((sum, l) => sum + cents(l.amount), 0),
      0,
    );
  });

  it("derives its bundle parent from its members and nothing else", () => {
    const parents = data.transactions.filter((t) => t.kind === "bundle");
    assert.isAtLeast(parents.length, 1);

    for (const parent of parents) {
      // A parent carries no bundle id of its own — its members point at it.
      assert.strictEqual(parent.bundleId, null);

      const members = data.transactions.filter((t) => t.bundleId === parent.id);
      assert.isAtLeast(members.length, 3);

      const derived = deriveBundleParent(
        members.map((m) => ({
          id: m.id,
          date: new Date(m.date),
          amount: m.amount,
          accountId: m.accountId,
          importMonth: m.importMonth,
        })),
      );
      assert.strictEqual(parent.amount, derived?.amount);
      assert.strictEqual(parent.date, derived?.date.toISOString());
      assert.strictEqual(parent.accountId, derived?.accountId);
      assert.strictEqual(parent.importMonth, derived?.importMonth);
      // A bundle is a cost the bank told in several rows.
      assert.isBelow(parent.amount, 0);
    }
  });

  it("links its refund to the row it reverses", () => {
    const refunds = data.transactions.filter((t) => t.isRefund === 1);
    assert.isAtLeast(refunds.length, 1);

    for (const refund of refunds) {
      assert.isAbove(refund.amount, 0);
      const original = byId.get(refund.linkedRefundId ?? -1);
      assert.isDefined(original);
      assert.strictEqual(cents(original?.amount ?? 0), -cents(refund.amount));
    }
  });

  it("shows every curation state the app can paint", () => {
    const has = (predicate: (t: (typeof data.transactions)[number]) => boolean) =>
      data.transactions.filter(predicate).length;

    // Uncurated (the tinted rows), hand-assigned issuer, hand-overridden
    // category, a duplicate held out, a row excluded by hand, and one carrying
    // a note.
    assert.isAtLeast(
      has((t) => t.issuerId === null && t.categorySlug === null),
      5,
    );
    assert.isAtLeast(
      has((t) => t.manualIssuer === 1),
      1,
    );
    assert.isAtLeast(
      has((t) => t.manualCategory === 1),
      1,
    );
    assert.isAtLeast(
      has((t) => t.isDuplicateExcluded === 1),
      1,
    );
    assert.isAtLeast(
      has((t) => t.manualExcluded === 1),
      1,
    );
    assert.isAtLeast(
      has((t) => t.notes !== null),
      1,
    );
  });

  it("keeps an issuer whose rows are excluded through it, not by hand", () => {
    const excluded = data.issuers.filter((i) => i.excludedFromRecap);
    assert.isAtLeast(excluded.length, 1);

    for (const issuer of excluded) {
      const rows = data.transactions.filter((t) => t.issuerId === issuer.id);
      assert.isAtLeast(rows.length, 1);
      // The rows say nothing themselves — the exclusion is the issuer's.
      assert.deepStrictEqual(
        rows.filter((r) => r.manualExcluded === 1),
        [],
      );
    }
  });

  it("gives every rule an issuer that exists, and every issuer a leaf slug", () => {
    const issuerIds = new Set(data.issuers.map((i) => i.id));
    for (const rule of data.rules) assert.isTrue(issuerIds.has(rule.issuerId));

    const accountIds = new Set(data.accounts.map((a) => a.id));
    for (const rule of data.rules) {
      if (rule.matchAccountId !== null) assert.isTrue(accountIds.has(rule.matchAccountId));
    }

    // The same pattern twice is fine only when the two can never compete for a
    // row — which is what the account matcher is for.
    const plain = data.rules.filter((r) => r.matchAccountId === null && r.matchValue === null);
    assert.strictEqual(new Set(plain.map((r) => r.pattern)).size, plain.length);
  });

  it("describes each subscription with the charges it stands for", () => {
    assert.isAtLeast(data.subscriptions.filter((s) => s.status === "possibly-cancelled").length, 1);

    for (const sub of data.subscriptions) {
      const rows = sub.transactionIds.map((id) => byId.get(id));
      assert.strictEqual(rows.length, sub.chargeCount);
      assert.isAtLeast(rows.length, 2);

      for (const row of rows) {
        assert.isDefined(row);
        assert.strictEqual(row?.issuerId, sub.issuerId);
      }

      const dates = rows.map((r) => r?.date ?? "").sort();
      assert.strictEqual(sub.firstChargeDate, dates[0]);
      assert.strictEqual(sub.lastChargeDate, dates.at(-1));
      // The typical amount is one the rows actually carry, not an average that
      // matches no charge.
      assert.include(
        rows.map((r) => r?.amount),
        sub.typicalAmount,
      );
      assert.strictEqual(sub.issuerName, data.issuers.find((i) => i.id === sub.issuerId)?.name);
    }
  });

  it("covers every account in every month, so no month grid cell is empty", () => {
    for (const account of data.accounts) {
      const months = new Set(
        data.transactions.filter((t) => t.accountId === account.id).map((t) => t.importMonth),
      );
      assert.deepStrictEqual([...months].sort(), [...DEMO_MONTHS], account.name);
    }
  });
});
