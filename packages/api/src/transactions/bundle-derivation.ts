import { AnomalyFlag } from "@mamen/shared/contract";

/**
 * What a **bundle parent** derives from one of its members (issue #68/#72).
 * Structural rather than the whole `Transaction`, so the routine can be handed a
 * stored row, a wire entity or a test fixture without any of them having to be
 * the others.
 */
export interface BundleMemberFacts {
	id: number;
	date: Date;
	amount: number;
	accountId: number;
	importMonth: string;
}

/** The parent's own derived columns — everything a membership change moves. */
export interface BundleParentFacts {
	amount: number;
	date: Date;
	accountId: number;
	importMonth: string;
}

/**
 * The parent as it stands *today*, read for its **date override** (issue #72).
 * Only `manualDate` is consulted: `date` is the value that survives, and every
 * other column of the parent — its label, issuer, category, notes — is its own
 * and is never derived from a member.
 */
export interface BundleParentDate {
	date: Date;
	manualDate?: boolean;
}

/**
 * Derive a **bundle parent**'s row from its members — the ONE place a bundle's
 * number comes from (issues #68, #72; epic #66).
 *
 * - **amount** — the members' sum in integer cents, converted back to euros once.
 *   Amounts are float euros and are never added as floats (the discipline
 *   `linkTransfer` and the value-matcher use), or a parent would land a hundredth
 *   off the rows it stands for. Recomputed from the whole set, never accumulated,
 *   so a member joining or leaving simply changes the number.
 * - **date** — the earliest member's, ties broken by the smaller id so the choice
 *   is a function of the set rather than of the order the ids arrived in. The
 *   cost belongs to when the money was spent, not to when the last person settled
 *   up. **Unless the parent carries `manualDate`**, in which case the parent's own
 *   date is kept: the derived date is a starting point, not a constraint (#72),
 *   and an override the user typed must outlive every later membership change.
 *   Only the date is the user's — the amount stays strictly derived, because a
 *   bundle's cost is what its members sum to and an editable total could drift
 *   from the bank rows the app exists to reconcile against.
 * - **accountId / importMonth** — the earliest member's, so the parent sits where
 *   the row it takes its date from sits rather than inventing an account or a
 *   statement month no import produced. They follow the *derived* earliest member
 *   even when the date is overridden: the override says when the cost belongs, not
 *   which statement produced the rows.
 *
 * Returns `undefined` for an empty member set: a bundle standing for nothing has
 * no number to hold, and the answer to that is to dissolve it (#74), not to write
 * a zero-amount parent dated today.
 */
export const deriveBundleParent = <M extends BundleMemberFacts>(
	members: ReadonlyArray<M>,
	parent?: BundleParentDate,
): BundleParentFacts | undefined => {
	const earliest = members.reduce<M | undefined>(
		(a, b) =>
			a === undefined ||
			b.date.getTime() < a.date.getTime() ||
			(b.date.getTime() === a.date.getTime() && b.id < a.id)
				? b
				: a,
		undefined,
	);
	if (earliest === undefined) return undefined;

	const cents = members.reduce((sum, m) => sum + Math.round(m.amount * 100), 0);
	return {
		amount: cents / 100,
		date: parent?.manualDate === true ? parent.date : earliest.date,
		accountId: earliest.accountId,
		importMonth: earliest.importMonth,
	};
};

/** The anomaly a **bundle** raises about itself (issue #76). */
const NON_NEGATIVE_BUNDLE = "non-negative-bundle" as const;

/**
 * The flag's text carries no number. The amount it is about is on the very row
 * the flag rides, so restating it here would be a second copy of a figure that
 * moves with every membership change — stale the moment a member joins, and the
 * standing flag below is deliberately never rewritten.
 */
const NON_NEGATIVE_BUNDLE_REASON =
	"This bundle's members sum to zero or more, so it is not a cost. A member may have been added by mistake, or a refund counted twice.";

/**
 * The **bundle parent**'s anomaly flags, re-derived from its amount (issue #76,
 * epic #66) — the second thing a membership change moves, beside the amount
 * itself, and computed here rather than at any call site for the same reason
 * {@link deriveBundleParent} is: one rule, one place.
 *
 * A bundle is a cost the bank told in several rows, so its members sum to a
 * **debit**. Summing to zero (everyone paid back exactly) or to a credit
 * (someone overpaid) is handled by the ordinary sign rules with no special case
 * — a non-negative parent simply reaches no spend bucket — but it usually means
 * a *mis-bundling*: a member added by mistake, or a refund counted twice. So it
 * warns. Nothing is blocked and no amount is altered: the parent's number stays
 * exactly what its members say, and the user is told to go and look.
 *
 * The sum is read in **integer cents**, the discipline every other money
 * comparison in this codebase uses: a total a fraction of a cent below zero is
 * zero, not a cost.
 *
 * Flags of every other kind are left untouched — they are none of this rule's
 * business — and a flag already standing is returned as it is rather than raised
 * again: re-stamping it on each recompute would resurrect one the user dismissed
 * and re-date a detection that never stopped. A bundle that becomes a cost again
 * **clears** it: the flag tracks a live condition, not a history.
 */
export const bundleAnomalyFlags = (
	amount: number,
	existing: ReadonlyArray<AnomalyFlag> | undefined,
	detectedAt: Date,
): ReadonlyArray<AnomalyFlag> => {
	const flags = existing ?? [];
	if (Math.round(amount * 100) < 0)
		return flags.filter((f) => f.type !== NON_NEGATIVE_BUNDLE);
	return flags.some((f) => f.type === NON_NEGATIVE_BUNDLE)
		? flags
		: [
				...flags,
				new AnomalyFlag({
					type: NON_NEGATIVE_BUNDLE,
					reason: NON_NEGATIVE_BUNDLE_REASON,
					detectedAt: detectedAt.toISOString(),
					dismissed: false,
				}),
			];
};
