import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The shared text-input primitive — a shadcn-style `input` restyled onto the
 * `--gousse-*` tokens (ADR 0002: gap-fill for what gousse doesn't ship).
 *
 * Forms across the app each repeat some near-copy of
 * `rounded-md border border-gousse-line bg-gousse-bg px-3 py-2 …` in a local `INPUT_CLASS`
 * constant, with the browser's own focus/disabled/invalid behaviour. This is
 * the one they should converge on; adoption is incremental, so the issuer forms
 * use it today and `accounts`, `rules`, `categories` and `import` still carry
 * their own copies (the ones that dress a `<select>` need a select primitive
 * first, or they'll drift). What a field gets by moving here:
 *
 * - the same `focus-visible` ring as the button primitive (keyboard-visible,
 *   token-coloured) *on top of* the accent border the app already showed on
 *   focus, so the cue is additive rather than a swap;
 * - a real disabled treatment (`opacity-50` + `not-allowed`) matching the
 *   button's, instead of the platform's grey box;
 * - an `aria-invalid` state painted in `--high`, so a field that fails
 *   validation looks wrong without each form inventing its own error styling.
 *
 * Deliberately variant-less: the app's other input flavour (the denser
 * `h-9 bg-gousse-panel px-2` filter-bar fields) is one `className` away, and `cn`
 * resolves the conflicts, so a size axis would earn nothing yet. Width is left
 * to the call-site for the same reason. The height is *not*: `h-10` matches the
 * button primitive's default size, so an input and a button sharing a row line
 * up and a field clears the same ≥40px hit-area floor.
 *
 * Native `<input>` props pass straight through, `ref` included — under React 19
 * `ref` is an ordinary prop, so the spread forwards it to the DOM node exactly
 * as the surrounding primitives do (no `forwardRef` wrapper).
 */
export type InputProps = React.ComponentProps<"input">;

/** A token-styled text input with focus-visible, disabled and invalid states. */
export function Input({ className, type = "text", ...props }: InputProps) {
	return (
		<input
			type={type}
			className={cn(
				"h-10 rounded-md border border-gousse-line bg-gousse-bg px-3 py-2 text-sm text-gousse-ink",
				"placeholder:text-gousse-muted",
				"transition-[border-color,box-shadow] duration-150",
				// `outline-none` removes the UA ring, so something has to replace it for
				// *every* focus mode. `:focus-visible` doesn't match a pointer-focused
				// colour/checkbox/file input, so the accent border stays on plain
				// `:focus` — the cue the `INPUT_CLASS` this replaces already had — and
				// the button's keyboard-only ring layers on top of it.
				"outline-none focus:border-gousse-accent focus-visible:border-gousse-accent focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-bg",
				"disabled:cursor-not-allowed disabled:opacity-50",
				// The compound `aria-invalid:focus*` borders are what make the invalid
				// state visible while the field is focused — which is exactly when the
				// user is looking at it. Without them the single-variant
				// `aria-invalid:border-gousse-high` ties on specificity with
				// `focus:border-gousse-accent` and the error border loses to stylesheet order.
				"aria-invalid:border-gousse-high aria-invalid:focus:border-gousse-high aria-invalid:focus-visible:border-gousse-high aria-invalid:focus-visible:ring-gousse-high",
				className,
			)}
			{...props}
		/>
	);
}
