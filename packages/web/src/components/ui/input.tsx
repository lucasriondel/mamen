import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The shared text-input primitive — a shadcn-style `input` restyled onto the
 * `--gousse-*` tokens (ADR 0002: gap-fill for what gousse doesn't ship).
 *
 * Every form in the app had been repeating some near-copy of
 * `rounded-md border border-line bg-bg px-3 py-2 …` in a local `INPUT_CLASS`
 * constant, each with the browser's own focus/disabled/invalid behaviour.
 * Centralising them here gives every field, in one place:
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
 * `h-9 bg-panel px-2` filter-bar fields) is one `className` away, and `cn`
 * resolves the conflicts, so a size axis would earn nothing yet. Width is left
 * to the call-site for the same reason.
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
				"rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink",
				"placeholder:text-muted",
				"transition-[border-color,box-shadow] duration-150",
				"outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:border-high aria-invalid:focus-visible:ring-high",
				className,
			)}
			{...props}
		/>
	);
}
