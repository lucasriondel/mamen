import { assert, describe, it } from "@effect/vitest";
import { bundleMemberRefusal } from "./bundle-writes";

/**
 * The **eligibility cascade** (issue #83), run alone — the three rules a row must
 * pass to become a **bundle member**, in the one place both write paths ask them.
 *
 * It was stated twice before this issue: in set form inside `createBundle` and,
 * clause for clause, in single-row form inside `addBundleMember`. Two copies of
 * one rule is two things to keep in step, and the copies had already drifted in
 * the order they asked the questions. Here the set form is the only form: adding
 * one member is the cascade over a set of one.
 *
 * The whole surface is exercised through the repository too (`repository.test.ts`
 * — both write paths, all three reasons). This suite is what pins the cascade
 * *itself*: a set carrying more than one defect names ONE reason, and which one is
 * a decision, not an accident of which write path happened to ask first.
 */
describe("bundleMemberRefusal (issue #83)", () => {
  const bank = { kind: "bank" as const };

  it("passes a set of ordinary bank rows", () => {
    assert.strictEqual(bundleMemberRefusal([bank, bank]), undefined);
  });

  // An empty set is not this rule's business: "fewer than two members" is a
  // count, asked by the caller before it has any rows in hand.
  it("passes an empty set", () => {
    assert.strictEqual(bundleMemberRefusal([]), undefined);
  });

  it("refuses a row that already carries a bundleId", () => {
    assert.strictEqual(bundleMemberRefusal([bank, { ...bank, bundleId: 7 }]), "already-bundled");
  });

  it("refuses a row that is itself a bundle parent", () => {
    assert.strictEqual(bundleMemberRefusal([bank, { kind: "bundle" }]), "nested-bundle");
  });

  it("refuses a row that already belongs to a transfer group", () => {
    assert.strictEqual(
      bundleMemberRefusal([bank, { ...bank, transferGroupId: 4 }]),
      "is-transfer-leg",
    );
  });

  // The order is `createBundle`'s, kept exactly: each reason is asked of the
  // WHOLE set before the next one is, so which refusal a mixed set earns does not
  // change with this extraction. `addBundleMember` asked the same three questions
  // in a different order, but over a set of one — where a row that is a parent
  // carries no `bundleId` and no `transferGroupId`, so no reachable row can
  // answer two of them and the order was never observable from that side.
  it("names one reason for a set with several defects", () => {
    assert.strictEqual(
      bundleMemberRefusal([
        { ...bank, transferGroupId: 4 },
        { kind: "bundle" },
        { ...bank, bundleId: 7 },
      ]),
      "already-bundled",
    );
    assert.strictEqual(
      bundleMemberRefusal([{ ...bank, transferGroupId: 4 }, { kind: "bundle" }]),
      "nested-bundle",
    );
  });

  // A row written before the `kind` column reads as the bank row it is, the same
  // fold the read projection applies — the cascade must not take an absent kind
  // for a parent.
  it("reads an absent kind as a bank row", () => {
    assert.strictEqual(bundleMemberRefusal([{}, {}]), undefined);
  });
});
