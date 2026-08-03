import { assert, describe, it } from "@effect/vitest";
import { AnomalyFlag } from "@mamen/shared/contract";
import { bundleAnomalyFlags, deriveBundleParent } from "./bundle-derivation";

const member = (over: {
	id: number;
	date: string;
	amount: number;
	accountId?: number;
	importMonth?: string;
}) => ({
	id: over.id,
	date: new Date(over.date),
	amount: over.amount,
	accountId: over.accountId ?? 1,
	importMonth: over.importMonth ?? over.date.slice(0, 7),
});

/**
 * The one place a **bundle parent**'s number comes from (issue #72, epic #66).
 * It is a pure function of the member set precisely so the amount cannot go
 * stale on one path and not another once membership becomes mutable (#74): add,
 * remove and dissolve all recompute through here.
 *
 * The exception is the **date override**, which is the whole point of the
 * `manualDate` flag: the derived date is a starting point, not a constraint, so
 * a parent the user has dated keeps that date across every later recompute.
 */
describe("deriveBundleParent (issue #72)", () => {
	it("sums its members in integer cents, never as floats", () => {
		const derived = deriveBundleParent([
			member({ id: 1, date: "2026-03-01", amount: -0.1 }),
			member({ id: 2, date: "2026-03-02", amount: -0.2 }),
		]);
		assert.strictEqual(derived?.amount, -0.3);
	});

	it("dates the parent at its earliest member, smaller id breaking a tie", () => {
		const derived = deriveBundleParent([
			member({ id: 9, date: "2026-03-12", amount: 150 }),
			member({ id: 4, date: "2026-03-07", amount: -200, accountId: 2 }),
			member({ id: 2, date: "2026-03-07", amount: -20, accountId: 3 }),
		]);
		assert.deepStrictEqual(derived?.date, new Date("2026-03-07"));
		// Account and import month come from that same earliest member — the parent
		// sits where the row it takes its date from sits.
		assert.strictEqual(derived?.accountId, 3);
	});

	it("re-derives the date when the member set changes", () => {
		const first = member({ id: 1, date: "2026-03-07", amount: -200 });
		const second = member({ id: 2, date: "2026-03-12", amount: 150 });
		const earlier = member({ id: 3, date: "2026-03-01", amount: -30 });

		// A member joins ahead of the rest: an underived parent follows it.
		assert.deepStrictEqual(
			deriveBundleParent([first, second, earlier])?.date,
			new Date("2026-03-01"),
		);
		// The earliest leaves: the parent moves to the next one.
		assert.deepStrictEqual(
			deriveBundleParent([second, earlier])?.date,
			new Date("2026-03-01"),
		);
	});

	it("keeps an overridden date across member additions and removals", () => {
		const overridden = { date: new Date("2026-02-14"), manualDate: true };
		const first = member({ id: 1, date: "2026-03-07", amount: -200 });
		const second = member({ id: 2, date: "2026-03-12", amount: 150 });
		const earlier = member({ id: 3, date: "2026-03-01", amount: -30 });

		// A member joining earlier than the override does not reclaim the date…
		const added = deriveBundleParent([first, second, earlier], overridden);
		assert.deepStrictEqual(added?.date, new Date("2026-02-14"));
		// …and the amount is derived all the same: only the date is the user's.
		assert.strictEqual(added?.amount, -80);

		// Removing the member the date once came from leaves it where the user put it.
		assert.deepStrictEqual(
			deriveBundleParent([second, earlier], overridden)?.date,
			new Date("2026-02-14"),
		);
	});

	it("ignores a parent's own date when it is not a manual override", () => {
		const derived = deriveBundleParent(
			[member({ id: 1, date: "2026-03-07", amount: -200 })],
			{ date: new Date("2026-02-14") },
		);
		assert.deepStrictEqual(derived?.date, new Date("2026-03-07"));
	});

	it("derives nothing from no members", () => {
		// A member-less bundle has no number to stand for — dissolving it is the
		// caller's answer (#74), not a zero-amount parent dated today.
		assert.strictEqual(deriveBundleParent([]), undefined);
	});
});

/**
 * The **non-negative bundle** anomaly (issue #76, epic #66). A bundle is a cost
 * told in several rows, so its members sum to a debit; summing to zero or to a
 * credit usually means a member was added by mistake or a refund was counted
 * twice. It is a *soft* signal — the sum stays whatever the members say — so it
 * rides the `anomalyFlags` array the schema already carries, and is re-derived
 * from the amount on every membership change beside the amount itself.
 */
describe("bundleAnomalyFlags (issue #76)", () => {
	const AT = new Date("2026-04-01T10:00:00.000Z");
	const otherFlag = new AnomalyFlag({
		type: "high-amount",
		reason: "8× this issuer's usual",
		detectedAt: "2026-03-01T00:00:00.000Z",
		dismissed: false,
	});

	it("flags a bundle that sums to a credit", () => {
		const flags = bundleAnomalyFlags(12.5, [], AT);
		assert.deepStrictEqual(
			flags.map((f) => f.type),
			["non-negative-bundle"],
		);
		assert.strictEqual(flags[0]?.dismissed, false);
		assert.strictEqual(flags[0]?.detectedAt, AT.toISOString());
	});

	// Collect exactly what was spent and the bundle sums to nothing: still not a
	// cost, and still the same mis-bundling it usually means.
	it("flags a bundle that sums to zero", () => {
		assert.deepStrictEqual(
			bundleAnomalyFlags(0, [], AT).map((f) => f.type),
			["non-negative-bundle"],
		);
	});

	it("leaves a bundle that sums to a debit unflagged", () => {
		assert.deepStrictEqual(bundleAnomalyFlags(-50, [], AT), []);
	});

	// Money is compared in integer cents here as everywhere else: a sum a
	// hundredth of a cent below zero is zero, not a cost.
	it("reads the sum in integer cents", () => {
		assert.deepStrictEqual(
			bundleAnomalyFlags(-0.001, [], AT).map((f) => f.type),
			["non-negative-bundle"],
		);
		assert.deepStrictEqual(bundleAnomalyFlags(-0.01, [], AT), []);
	});

	// The flag tracks a live condition, so the member that fixes the bundle
	// clears it — while every other flag on the row is none of this rule's
	// business.
	it("clears the flag when the bundle becomes a cost again, keeping others", () => {
		const flagged = bundleAnomalyFlags(30, [otherFlag], AT);
		assert.deepStrictEqual(
			flagged.map((f) => f.type),
			["high-amount", "non-negative-bundle"],
		);
		assert.deepStrictEqual(bundleAnomalyFlags(-20, flagged, AT), [otherFlag]);
	});

	// Re-flagging a still-non-negative bundle on every recompute would resurrect
	// a flag the user dismissed, and re-stamp a detection that never stopped.
	it("leaves a standing flag alone rather than raising a second one", () => {
		const dismissed = new AnomalyFlag({
			type: "non-negative-bundle",
			reason: "…",
			detectedAt: "2026-03-01T00:00:00.000Z",
			dismissed: true,
			dismissedAt: "2026-03-02T00:00:00.000Z",
		});
		assert.deepStrictEqual(bundleAnomalyFlags(30, [dismissed], AT), [
			dismissed,
		]);
	});
});
