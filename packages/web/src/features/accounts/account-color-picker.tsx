import { type FormEvent, useId, useState } from "react";
import { normaliseHex } from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The presets the swatch grid offers. Ten hues spanning the wheel so any two
 * accounts a user is likely to pick read as different at a glance; anything
 * outside this set is still reachable through the hex field below the grid.
 */
const PRESETS = [
	"#2563eb",
	"#0891b2",
	"#0d9488",
	"#16a34a",
	"#ca8a04",
	"#ea580c",
	"#dc2626",
	"#db2777",
	"#9333ea",
	"#4f46e5",
] as const;

export interface AccountColorPickerProps {
	/** The account being recoloured — names the trigger, e.g. "Change Ledger colour". */
	label: string;
	/** The account's **stored** `color`; `null` = auto (derived from its id). */
	value: string | null;
	/** Its **Resolved colour** — what the swatch paints, stored or auto. */
	resolved: string;
	/** A write is in flight; the form stays open but won't fire a second one. */
	pending?: boolean;
	/** `null` clears the stored colour, resuming the auto palette. */
	onSubmit: (color: string | null) => void;
	className?: string;
}

/**
 * The colour editor for an account, opened by clicking the swatch it edits.
 *
 * Deliberately *not* the shared {@link ColorPicker}: that one is built around a
 * category's inherit semantics (ADR 0006), where clearing points at the nearest
 * coloured ancestor. Accounts are flat, so clearing here means *auto* — fall
 * back to the id-keyed palette — and a picker that said "Inherit" would name a
 * relationship accounts don't have. It reuses that module's {@link normaliseHex}
 * so both surfaces store one canonical spelling of a colour.
 *
 * A preset click submits immediately rather than staging a selection: the grid
 * exists to make the common case one gesture, and a grid that needed a second
 * Save press would be slower than the hex field it is meant to shortcut.
 */
export function AccountColorPicker({
	label,
	value,
	resolved,
	pending,
	onSubmit,
	className,
}: AccountColorPickerProps) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(value ?? "");
	const [invalid, setInvalid] = useState(false);
	// One picker renders per account row, so a static id would collide across rows.
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

	const commit = (color: string | null) => {
		if (pending) return;
		onSubmit(color);
		setOpen(false);
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
		commit(hex);
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
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-2">
						<span className="text-gousse-muted text-xs uppercase tracking-wide">
							Preset
						</span>
						<div className="grid grid-cols-5 gap-2">
							{PRESETS.map((preset) => {
								const selected = value?.toLowerCase() === preset;
								return (
									<button
										key={preset}
										type="button"
										aria-label={preset}
										title={preset}
										aria-pressed={selected}
										disabled={pending}
										onClick={() => commit(preset)}
										style={{ backgroundColor: preset }}
										className={cn(
											"size-6 rounded-full border outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-panel disabled:opacity-50",
											selected
												? "border-gousse-ink ring-2 ring-gousse-ink ring-offset-1 ring-offset-gousse-panel"
												: "border-gousse-line",
										)}
									/>
								);
							})}
						</div>
					</div>

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
						/>
						{invalid ? (
							<p id={errorId} className="text-gousse-high text-xs">
								Enter a hex colour like #ef4444.
							</p>
						) : null}
						<div className="flex items-center justify-between gap-2">
							{value === null ? (
								// Already on the auto palette — nothing to clear, so no no-op.
								<span className="text-gousse-muted text-xs">Auto</span>
							) : (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => commit(null)}
									disabled={pending}
								>
									Auto
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
				</div>
			</PopoverContent>
		</Popover>
	);
}
