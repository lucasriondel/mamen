import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Three or six hex digits, with or without the hash. Named CSS colours and
 * `rgb()` are deliberately out: the value is stored raw and painted straight
 * onto an svg `stroke`, so one canonical spelling keeps "is this the colour my
 * parent has?" a string comparison — which is exactly what migration 0015's
 * copied-colour predicate does (issue #55).
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The typed text as a storable colour, or `null` if it isn't one. Lower-cased so
 * `#EF4444` and `#ef4444` are one value rather than two rows that look identical
 * and compare unequal.
 */
export function normaliseHex(input: string): string | null {
	const trimmed = input.trim();
	const hashed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
	return HEX.test(hashed) ? hashed.toLowerCase() : null;
}

export interface ColorPickerProps {
	/** The thing being recoloured — names the trigger, e.g. "Change Food colour". */
	label: string;
	/** The category's **own** `color`; `null` = it inherits (ADR 0006). */
	value: string | null;
	/** Its **Resolved colour** — what the swatch paints, stored or inherited. */
	resolved: string;
	/** A write is in flight; the form stays open but won't fire a second one. */
	pending?: boolean;
	/** `null` clears the stored colour, resuming inheritance. */
	onSubmit: (color: string | null) => void;
	className?: string;
}

/**
 * The colour editor for a category, opened by clicking the swatch it edits
 * (issue #58). A popover with one free hex field — not a fixed palette, because
 * the point of ADR 0006 is that a category may choose *any* colour and its
 * descendants follow.
 *
 * The swatch shows the **Resolved colour**, never the stored one: a leaf that
 * inherits has nothing of its own to show, and showing a blank there would hide
 * the very propagation this surface exists to demonstrate. Clearing writes
 * `null` — a *reference* to the nearest coloured ancestor, not an absent value —
 * and is offered only when there is something to clear.
 *
 * An unparseable value is refused here rather than sent: `color` is a bare
 * `Schema.String` on the wire, so the server would happily store "purple-ish"
 * and every descendant inheriting it would paint nothing.
 */
export function ColorPicker({
	label,
	value,
	resolved,
	pending,
	onSubmit,
	className,
}: ColorPickerProps) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(value ?? "");
	const [invalid, setInvalid] = useState(false);
	// One picker renders per tree row, so a static id would collide across rows.
	const fieldId = useId();
	const errorId = useId();

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		// Re-seed from the stored colour on every open, so a cancelled edit (Escape,
		// or clicking away) never leaks into the next one.
		if (next) {
			setDraft(value ?? "");
			setInvalid(false);
		}
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (pending) return;
		const hex = normaliseHex(draft);
		if (hex === null) {
			setInvalid(true);
			return;
		}
		setInvalid(false);
		onSubmit(hex);
		setOpen(false);
	};

	const clear = () => {
		if (pending) return;
		onSubmit(null);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Change ${label} colour`}
					title={`Change ${label} colour`}
					className={cn(
						"shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-panel",
						className,
					)}
				>
					<span
						data-color-swatch={resolved}
						style={{ backgroundColor: resolved }}
						className="block size-3.5 rounded-full border border-gousse-line"
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-56 p-3">
				<form onSubmit={handleSubmit} className="flex flex-col gap-2">
					<label
						htmlFor={fieldId}
						className="text-gousse-muted text-xs uppercase tracking-wide"
					>
						Hex colour
					</label>
					<Input
						id={fieldId}
						value={draft}
						onChange={(e) => {
							setDraft(e.target.value);
							setInvalid(false);
						}}
						aria-invalid={invalid}
						aria-describedby={invalid ? errorId : undefined}
						placeholder="#ef4444"
						spellCheck={false}
						autoComplete="off"
						// The popover exists only to edit this field, so opening it and then
						// asking for a second gesture to reach the field is pure friction.
						autoFocus
					/>
					{invalid ? (
						<p id={errorId} className="text-gousse-high text-xs">
							Enter a hex colour like #ef4444.
						</p>
					) : null}
					<div className="flex items-center justify-between gap-2">
						{value === null ? (
							// Already inheriting — there is nothing to clear, so no no-op.
							<span className="text-gousse-muted text-xs">Inheriting</span>
						) : (
							<Button
								variant="ghost"
								size="sm"
								onClick={clear}
								disabled={pending}
							>
								Inherit
							</Button>
						)}
						<Button
							variant="primary"
							size="sm"
							type="submit"
							disabled={pending}
						>
							Save
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}
