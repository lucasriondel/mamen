import type { Issuer } from "@mamen/shared/contract";
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useIssuerMutations } from "./use-issuer-mutations";

/** How long the field must be idle before an edit is written. */
const NOTES_DEBOUNCE_MS = 600;

interface IssuerNotesFieldProps {
	issuer: Issuer;
}

/**
 * The issuer's **note** — a free-text scratchpad on the detail page for whatever
 * the name and category can't say ("cancels in March", "shared with Ana").
 * Always an open textarea rather than a click-to-edit label: a note is
 * multi-line and often long, so a collapsed state would hide the thing the
 * section exists to show.
 *
 * Autosaves like {@link IssuerNameField} — no Save button, matching the rest of
 * this page (name, default category, image all write on action). It differs on
 * one point, deliberately: **an emptied field clears the note**. For a name an
 * empty box reads as half-typed and is ignored, but erasing a note is the only
 * way to remove one, so the blank is honoured and sent as `null` (the contract's
 * nullable-to-clear field) rather than stored as `""`.
 *
 * The draft re-seeds from the issuer while the textarea is unfocused, so a note
 * written elsewhere (or a rejected write rolling back) shows through; while it
 * has focus it is left alone, so an in-flight invalidation can't yank characters
 * out from under the cursor.
 */
export function IssuerNotesField({ issuer }: IssuerNotesFieldProps) {
	const { setNotes } = useIssuerMutations();
	const setNotesMutate = setNotes.mutate;
	const [isFocused, setIsFocused] = useState(false);
	const [draft, setDraft] = useState(issuer.notes ?? "");
	// What the server is known to hold, so the debounce doesn't re-send a note
	// the last keystroke already saved (and doesn't fire on mount).
	const savedRef = useRef(issuer.notes ?? "");

	if (!isFocused && draft !== (issuer.notes ?? "")) {
		setDraft(issuer.notes ?? "");
		savedRef.current = issuer.notes ?? "";
	}

	const debouncedDraft = useDebouncedValue(draft, NOTES_DEBOUNCE_MS);

	useEffect(() => {
		const trimmed = debouncedDraft.trim();
		if (trimmed === savedRef.current) return;
		savedRef.current = trimmed;
		// Empty means *remove the note*, which absent-means-unchanged can't say.
		setNotesMutate({
			id: issuer.id,
			notes: trimmed.length > 0 ? trimmed : null,
		});
	}, [debouncedDraft, issuer.id, setNotesMutate]);

	const flush = () => {
		setIsFocused(false);
		// A blur must not lose the tail of what was typed: write anything the
		// debounce hasn't sent yet.
		const trimmed = draft.trim();
		if (trimmed === savedRef.current) return;
		savedRef.current = trimmed;
		setNotesMutate({
			id: issuer.id,
			notes: trimmed.length > 0 ? trimmed : null,
		});
	};

	return (
		<div className="flex flex-col gap-1">
			<label htmlFor="issuer-notes" className="text-sm text-gousse-muted">
				Notes
			</label>
			<Textarea
				id="issuer-notes"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onFocus={() => setIsFocused(true)}
				onBlur={flush}
				rows={3}
				placeholder="Anything worth remembering about this issuer…"
				className="w-full resize-y"
			/>
		</div>
	);
}
