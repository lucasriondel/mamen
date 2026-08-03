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
