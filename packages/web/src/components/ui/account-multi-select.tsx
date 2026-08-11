import type { Account } from "@mamen/shared/contract";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AccountMultiSelectProps {
	/** All accounts to offer. */
	accounts: readonly Account[];
	/**
	 * The currently-selected account ids; empty means "all accounts". A bare id is
	 * accepted as the one-account selection, so a caller still holding the
	 * transactions URL's old scalar `accountId` renders rather than crashes.
	 */
	selected: readonly number[] | number;
	/** Emit the new selection; empty array clears the filter (all accounts). */
	onChange: (selected: number[]) => void;
}

/**
 * A checkbox multi-select for filtering by account (issue #35). Spend can be
 * reviewed across several accounts at once, so this is a small popover of
 * checkboxes rather than a single `<select>`. An empty selection means **all
 * accounts** (no filter) — the resting, most-common state — so the trigger reads
 * "All accounts" until the user narrows it.
 *
 * Shared by the recap and the transactions filter bar: the recap's summary lines
 * link into the transactions list carrying their account selection whole, so the
 * page they open has to be able to *show* a multi-account filter, not just apply
 * one. A single `<select>` there would have had to lie about the narrowing or
 * drop it.
 *
 * Kept deliberately lightweight (a native details-free popover toggled by a
 * button, closed on outside click / Escape) — there is no shared popover in the
 * rebuild (ADR 0002) and the list is short.
 */
export function AccountMultiSelect({
	accounts,
	selected,
	onChange,
}: AccountMultiSelectProps) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	// Close on outside click / Escape so the popover behaves like a menu.
	useEffect(() => {
		if (!open) return;
		const onPointerDown = (e: PointerEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	// Tolerate a bare id as well as a list: the transactions URL took a single
	// `accountId` before this control replaced its `<select>`, so a caller (or an
	// old bookmark that skipped the validator) can still hand one over. Rendering
	// it as the one-account selection it plainly is beats crashing the filter bar.
	const selectedSet = new Set(
		typeof selected === "number" ? [selected] : selected,
	);
	const toggle = (id: number) => {
		const next = new Set(selectedSet);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		onChange([...next]);
	};

	return (
		<div ref={rootRef} className="relative">
			<Button
				variant="secondary"
				aria-haspopup="true"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				className="h-9 gap-2 bg-gousse-panel px-3"
			>
				<span>{triggerLabel(accounts, selectedSet)}</span>
				<ChevronDown size={14} className="text-gousse-muted" aria-hidden />
			</Button>

			{open ? (
				<fieldset className="absolute z-10 mt-1 flex min-w-52 flex-col gap-0.5 rounded-2xl border border-gousse-line bg-gousse-panel p-1 shadow-lg">
					<legend className="sr-only">Filter by account</legend>
					{accounts.length === 0 ? (
						<p className="px-2 py-1.5 text-sm text-gousse-muted">No accounts</p>
					) : (
						accounts.map((account) => {
							const checked = selectedSet.has(account.id);
							return (
								<label
									key={account.id}
									className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm text-gousse-ink hover:bg-gousse-bg"
								>
									<input
										type="checkbox"
										className="sr-only"
										checked={checked}
										onChange={() => toggle(account.id)}
									/>
									<span
										aria-hidden
										className={cn(
											"flex h-4 w-4 items-center justify-center rounded border",
											checked
												? "border-gousse-accent bg-gousse-accent text-white"
												: "border-gousse-line",
										)}
									>
										{checked ? <Check size={12} /> : null}
									</span>
									{account.name}
								</label>
							);
						})
					)}
				</fieldset>
			) : null}
		</div>
	);
}

/** The trigger text: "All accounts" when unfiltered, the name when one, else a count. */
function triggerLabel(
	accounts: readonly Account[],
	selected: ReadonlySet<number>,
): string {
	if (selected.size === 0) return "All accounts";
	if (selected.size === 1) {
		const [id] = selected;
		return accounts.find((a) => a.id === id)?.name ?? "1 account";
	}
	return `${selected.size} accounts`;
}
