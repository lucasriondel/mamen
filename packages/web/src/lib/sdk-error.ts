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
		default:
			return "Something went wrong. Please try again.";
	}
}
