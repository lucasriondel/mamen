import { NOTES_MAX_LENGTH, type Transaction } from "@mamen/shared/contract";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { NotesCell } from "./transaction-cells";
import { useTransactionNotes } from "./use-transaction-notes";

export interface NotesPickerProps {
  /** The transaction being annotated — the note is written to this row only. */
  transaction: Transaction;
}

/**
 * The **Notes** editor on a transaction's notes cell (issue #38) — click the
 * cell to open a popover with a textarea, type a free-text note, save. A note is
 * this one row's annotation; it carries no derivation and touches nothing else.
 *
 * The draft is local to the open popover and seeded from the stored note each
 * time it opens, so a cancelled edit (Escape, or clicking away) leaves the note
 * untouched. Saving writes the trimmed text; an emptied note saves as blank,
 * which reads as "no note" — clearing needs no separate gesture. `⌘/Ctrl+Enter`
 * saves from the keyboard. The cap mirrors the contract's 1000 chars so the
 * count guides the user before the server would reject an over-long note.
 */
export function NotesPicker({ transaction }: NotesPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  // Unique per instance — the editor renders once per table row, so a static id
  // would collide across rows (invalid HTML, mis-associated label).
  const fieldId = useId();
  const { setNotes } = useTransactionNotes();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Re-seed the draft from the stored note whenever the editor opens, so a
    // prior cancelled edit never leaks into the next one.
    if (next) setDraft(transaction.notes ?? "");
  };

  const save = () => {
    if (setNotes.isPending) return;
    // No-op when nothing changed — don't fire a write (or invalidate) for an
    // edit that leaves the note exactly as it was.
    if (draft.trim() === (transaction.notes ?? "").trim()) {
      setOpen(false);
      return;
    }
    setNotes.mutate(
      { transactionId: transaction.id, notes: draft },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="block rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent"
            title="Add a note to this transaction"
          >
            <NotesCell notes={transaction.notes} />
          </button>
        }
      />
      <PopoverContent className="p-2">
        <label className="sr-only" htmlFor={fieldId}>
          Transaction note
        </label>
        <textarea
          id={fieldId}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, NOTES_MAX_LENGTH))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          /* oxlint-disable jsx-a11y/no-autofocus -- the popover exists only to edit this field */
          // biome-ignore lint/a11y/noAutofocus: the popover exists only to edit this field
          autoFocus
          /* oxlint-enable jsx-a11y/no-autofocus */
          rows={4}
          maxLength={NOTES_MAX_LENGTH}
          placeholder="Add a note…"
          className="w-full resize-none rounded-2xl border border-gousse-line bg-gousse-panel px-3 py-1.5 text-gousse-ink text-sm outline-none placeholder:text-gousse-muted focus:border-gousse-accent"
        />
        <div className="mt-2 flex items-center justify-between">
          <span
            className={cn(
              "text-gousse-muted text-xs tabular-nums",
              draft.length >= NOTES_MAX_LENGTH && "text-gousse-high",
            )}
          >
            {draft.length}/{NOTES_MAX_LENGTH}
          </span>
          <Button variant="primary" size="sm" onClick={save} disabled={setNotes.isPending}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
