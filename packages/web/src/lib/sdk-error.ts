/**
 * Map an `@mamen/sdk` failure to a human-readable message.
 *
 * The SDK rejects mutations/queries with the contract's tagged errors (each a
 * `Schema.TaggedError` carrying a `_tag` discriminant — see
 * `@mamen/shared/contract` `errors.ts`). The PRD assigns mutation failures to a
 * `sonner` toast whose copy is derived from that `_tag`; this is the single
 * place that translation lives so every feature surfaces the same wording.
 */

/** Narrow an unknown thrown value to its SDK error `_tag`, when it has one. */
function tagOf(error: unknown): string | undefined {
	if (typeof error === "object" && error !== null && "_tag" in error) {
		const tag = (error as { _tag: unknown })._tag;
		return typeof tag === "string" ? tag : undefined;
	}
	return undefined;
}

/** Join a list into prose: "a", "a and b", "a, b and c". Empty → "". */
function joinClauses(parts: readonly string[]): string {
	if (parts.length <= 1) return parts[0] ?? "";
	return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The guarded-delete refusal, worded from the dependent counts the API returns
 * (`CategoryInUse`). Names each non-zero kind — child categories, transactions,
 * issuer defaults — so the user knows exactly what to re-assign before deleting.
 */
function categoryInUseMessage(error: unknown): string {
	const e = error as {
		children?: number;
		transactions?: number;
		issuers?: number;
	};
	const parts: string[] = [];
	if (e.children) {
		parts.push(
			`${e.children} categor${e.children === 1 ? "y" : "ies"} inside it`,
		);
	}
	if (e.transactions) {
		parts.push(
			`${e.transactions} transaction${e.transactions === 1 ? "" : "s"}`,
		);
	}
	if (e.issuers) {
		parts.push(`${e.issuers} issuer${e.issuers === 1 ? "" : "s"}`);
	}
	return parts.length === 0
		? "This category is still in use, so it can't be deleted yet."
		: `Can't delete — still used by ${joinClauses(parts)}. Re-assign first, then delete.`;
}

/**
 * The refused **Kind flip** (`CategoryHoldsMoney`): a leaf can't take a child
 * while it still holds money. Worded from the two counts the API returns so the
 * user sees what would be stranded, and pointed at the **Spill** gesture that
 * moves it into a new child. (The categories page also opens the spill dialog on
 * this error, so the toast is the explanation, not the only recourse.)
 */
function categoryHoldsMoneyMessage(error: unknown): string {
	const e = error as { transactions?: number; issuers?: number };
	const parts: string[] = [];
	if (e.transactions) {
		parts.push(
			`${e.transactions} transaction${e.transactions === 1 ? "" : "s"}`,
		);
	}
	if (e.issuers) {
		parts.push(`${e.issuers} issuer default${e.issuers === 1 ? "" : "s"}`);
	}
	return parts.length === 0
		? "This category holds money, so it can't take a child yet. Spill it into a new category first."
		: `This category holds ${joinClauses(parts)}. Spill them into a new category so nothing is stranded.`;
}

/**
 * If `error` is a refused **Kind flip** (`CategoryHoldsMoney`), return the two
 * dependent counts it carries; otherwise `null`. Lets the categories page branch
 * on the refusal — open the **Spill** dialog rather than only toast — without
 * re-implementing the `_tag` narrowing.
 */
export function categoryHoldsMoney(
	error: unknown,
): { transactions: number; issuers: number } | null {
	if (tagOf(error) !== "CategoryHoldsMoney") return null;
	const e = error as { transactions?: number; issuers?: number };
	return { transactions: e.transactions ?? 0, issuers: e.issuers ?? 0 };
}

/**
 * Turn a caught SDK error into a short sentence fit for a toast. Unknown `_tag`s
 * (and non-tagged throwables like network failures) fall back to a generic line
 * so the user always gets *some* explanation, never a raw stack.
 */
export function toErrorMessage(error: unknown): string {
	switch (tagOf(error)) {
		case "NotFound":
			return "That item no longer exists — it may have been deleted already.";
		case "Conflict":
			return "That name is already taken. Pick a different one.";
		case "InvalidFileType":
			return "That file type isn't supported.";
		case "CategoryInUse":
			return categoryInUseMessage(error);
		case "CategoryHoldsMoney":
			return categoryHoldsMoneyMessage(error);
		case "CategoryHasChildren":
			return "Move or delete the categories inside this folder before moving it under another.";
		case "CategoryNotLeaf":
			return "Pick a category, not a folder.";
		default:
			return "Something went wrong. Please try again.";
	}
}
