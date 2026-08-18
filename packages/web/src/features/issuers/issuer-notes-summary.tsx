import type { Issuer } from "@mamen/shared/contract";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useIssuerMutations } from "./use-issuer-mutations";

/** How long the field must be idle before an edit is written. */
const NOTES_DEBOUNCE_MS = 600;

/**
 * The issuer's **note**, as the line under the title — the page's description,
 * where a page's sentence goes, and editable in place.
 *
 * It is the same object read and written, like the name above it
 * ({@link IssuerNameField}): the text *is* the field, clicking it opens a
 * textarea sized like the line it replaces, and there is no Save button — edits
 * autosave once typing settles. A note is mostly read and occasionally written,
 * so the resting state is the sentence rather than an always-open box.
 *
 * It differs from the name field on one point, deliberately: **an emptied field
 * clears the note**. For a name a blank reads as half-typed and is ignored, but
 * erasing a note is the only way to remove one, so the blank is honoured and
 * sent as `null` (the contract's nullable-to-clear field) rather than `""`.
 *
 * With no note it degrades to a quiet *Add a note* affordance rather than
 * collapsing to nothing — an empty description that vanishes leaves nothing to
 * say the issuer can carry one.
 */
export function IssuerNotesSummary({ issuer }: { issuer: Issuer }) {
  const { setNotes } = useIssuerMutations();
  const setNotesMutate = setNotes.mutate;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(issuer.notes ?? "");
  // What the server is known to hold, so the debounce doesn't re-send a note the
  // last keystroke already saved (and doesn't fire on mount).
  const savedRef = useRef(issuer.notes ?? "");

  // Re-seed from the issuer while closed, so a note written elsewhere (or a
  // rejected write rolling back) shows through; while editing it is left alone,
  // so an in-flight invalidation can't yank characters out from under the cursor.
  if (!isEditing && draft !== (issuer.notes ?? "")) {
    setDraft(issuer.notes ?? "");
    savedRef.current = issuer.notes ?? "";
  }

  const debouncedDraft = useDebouncedValue(draft, NOTES_DEBOUNCE_MS);

  useEffect(() => {
    const trimmed = debouncedDraft.trim();
    if (trimmed === savedRef.current) return;
    savedRef.current = trimmed;
    // Empty means *remove the note*, which absent-means-unchanged can't say.
    setNotesMutate({ id: issuer.id, notes: trimmed.length > 0 ? trimmed : null });
  }, [debouncedDraft, issuer.id, setNotesMutate]);

  // Focus on mount rather than after `setIsEditing`: the textarea doesn't exist
  // yet at click time, and a ref callback fires exactly when it does. Caret to
  // the end rather than selecting all — appending to an existing note is the
  // common edit, where a name is usually replaced wholesale.
  const focusOnMount = useCallback((node: HTMLTextAreaElement | null) => {
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  const stopEditing = () => {
    setIsEditing(false);
    // A blur must not lose the tail of what was typed: write anything the
    // debounce hasn't sent yet.
    const trimmed = draft.trim();
    if (trimmed === savedRef.current) return;
    savedRef.current = trimmed;
    setNotesMutate({ id: issuer.id, notes: trimmed.length > 0 ? trimmed : null });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Escape reverts to the last saved note and closes, as on the name field.
    // Enter is *not* a submit here — a note is multi-line by nature.
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(savedRef.current);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      // The kit's textarea, which already carries the box corner a tall
      // multi-line field takes (a pill would eat its first and last lines).
      <Textarea
        ref={focusOnMount}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={stopEditing}
        onKeyDown={handleKeyDown}
        rows={2}
        aria-label="Notes"
        placeholder="Anything worth remembering about this issuer…"
        className="w-full resize-y text-sm"
      />
    );
  }

  const note = issuer.notes?.trim();

  if (!note) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="flex cursor-pointer items-center gap-1 self-start rounded-full text-gousse-muted text-sm outline-none transition-colors hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
      >
        <Plus size={13} aria-hidden />
        Add a note
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      // `whitespace-pre-line` so a multi-line note reads as it was written; the
      // line clamp keeps a long one from pushing the tabs down the page.
      className="line-clamp-2 cursor-pointer whitespace-pre-line text-left text-gousse-muted text-sm outline-none transition-colors hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
      aria-label={`Note: ${note}. Click to edit.`}
    >
      {note}
    </button>
  );
}
