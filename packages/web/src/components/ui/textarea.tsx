import type { ComponentProps } from "react";
import { FIELD_BOX, FIELD_CHROME } from "@/lib/field-chrome";
import { cn } from "@/lib/utils";

/**
 * Multi-line text field — gousse's `Textarea`, vendored from the registry
 * (issue #93) and owned here. gousse's chrome is untouched: it shares
 * {@link Input}'s border, background and folded `focus:border-gousse-ink
 * focus:outline-hidden` via {@link FIELD_CHROME}, and takes {@link FIELD_BOX}
 * (`rounded-2xl`) rather than the pill, because a tall multi-line box with
 * fully-round ends wastes its first and last lines to the corner arc. Round,
 * but still a corner.
 *
 * Three states are mamen's, folded in here from the adapter this file replaced.
 * All three match the local {@link Input}, so a textarea and an input on the
 * same form don't diverge:
 *
 * - **the `focus-visible` ring**, layered *on top of* gousse's plain `:focus`
 *   border rather than replacing it, so a pointer-focused field keeps its cue
 *   and a keyboard-focused one gains the louder accent ring.
 * - **the disabled treatment** (`opacity-50` + `not-allowed`), instead of the
 *   platform's grey box.
 * - **`aria-invalid`**, painted in `--high`. The compound `aria-invalid:focus*`
 *   borders are what keep the error visible *while the field is focused* —
 *   exactly when the user is looking at it — since the single-variant rule ties
 *   on specificity with the focus border and would lose to stylesheet order.
 *
 * Height is left to the call-site (`rows`): unlike `Input` there is no single
 * sensible line count. `className` extends or overrides via cn() — e.g.
 * FilterSimilarPopover passes `resize-none` and a `bg-gousse-bg` override.
 * Native `<textarea>` props pass straight through, `ref` included.
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
	return (
		<textarea
			className={cn(
				FIELD_CHROME,
				FIELD_BOX,
				"placeholder:text-gousse-muted",
				"transition-[border-color,box-shadow] duration-150",
				"focus-visible:border-gousse-accent focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-bg",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:border-gousse-high aria-invalid:focus:border-gousse-high aria-invalid:focus-visible:border-gousse-high aria-invalid:focus-visible:ring-gousse-high",
				className,
			)}
			{...props}
		/>
	);
}
