import { Textarea as GousseTextarea } from "@lucasriondel/gousse-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The shared multi-line text field — a thin adapter over gousse's `Textarea`
 * (ADR 0002), which already shares the `Input` chrome (border, background, the
 * folded focus treatment).
 *
 * Layered on top, matching the local {@link Input} primitive so a textarea and
 * an input on the same form don't diverge: the keyboard-visible
 * `focus-visible` ring, the disabled treatment, and the `aria-invalid` state
 * painted in `--high`. Height is left to the call-site (`rows`), since unlike
 * `Input` there is no single sensible line count.
 *
 * Native `<textarea>` props pass straight through, `ref` included.
 */
export type TextareaProps = React.ComponentProps<"textarea">;

/** A token-styled textarea with focus-visible, disabled and invalid states. */
export function Textarea({ className, ...props }: TextareaProps) {
	return (
		<GousseTextarea
			className={cn(
				"text-sm text-gousse-ink placeholder:text-gousse-muted",
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
