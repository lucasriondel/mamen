import type { Issuer } from "@mamen/shared/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useIssuerMutations } from "./use-issuer-mutations";

/** How long the field must be idle before an edit is written. */
const RENAME_DEBOUNCE_MS = 500;

interface IssuerNameFieldProps {
  issuer: Issuer;
}

/**
 * The issuer's name as an **inline-editable heading**: the page shows the name
 * as an `h1`, clicking it swaps in a text input sized like the heading, and
 * blurring (or Escape/Enter) swaps back. There is no Save button — edits
 * autosave once typing settles ({@link RENAME_DEBOUNCE_MS}), so the field is the
 * same object the reader was already looking at rather than a separate form
 * restating the name below the header.
 *
 * The draft re-seeds from `issuer.name` while the field is closed, so a rename
 * landing from elsewhere (or a rejected write rolling back) shows through; while
 * editing it is left alone, so an in-flight invalidation can't yank characters
 * out from under the cursor.
 */
export function IssuerNameField({ issuer }: IssuerNameFieldProps) {
  const { rename } = useIssuerMutations();
  const renameMutate = rename.mutate;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(issuer.name);
  const inputRef = useRef<HTMLInputElement>(null);
  // What the server is known to hold, so the debounce doesn't re-send a name
  // the last keystroke already saved (and doesn't fire at all on open/close).
  const savedRef = useRef(issuer.name);

  if (!isEditing && draft !== issuer.name) {
    setDraft(issuer.name);
    savedRef.current = issuer.name;
  }

  const debouncedDraft = useDebouncedValue(draft, RENAME_DEBOUNCE_MS);

  useEffect(() => {
    const trimmed = debouncedDraft.trim();
    // An empty field is a half-typed name, not a request to clear it — the
    // heading keeps the last saved value until something valid is typed.
    if (trimmed.length === 0 || trimmed === savedRef.current) return;
    savedRef.current = trimmed;
    renameMutate({ id: issuer.id, patch: { name: trimmed } });
  }, [debouncedDraft, issuer.id, renameMutate]);

  // Focus + select on mount rather than after `setIsEditing`: the input doesn't
  // exist yet at click time, and a ref callback fires exactly when it does.
  // `useCallback` is load-bearing — an inline callback is a new function every
  // render, so React would detach and re-attach the ref on each keystroke and
  // re-select the whole value, making every character replace the last.
  const focusOnMount = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    node?.focus();
    node?.select();
  }, []);

  const stopEditing = () => {
    setIsEditing(false);
    // A blur must not lose the tail of what was typed: flush anything the
    // debounce hasn't written yet.
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setDraft(savedRef.current);
      return;
    }
    if (trimmed === savedRef.current) return;
    savedRef.current = trimmed;
    renameMutate({ id: issuer.id, patch: { name: trimmed } });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      inputRef.current?.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(savedRef.current);
      setIsEditing(false);
    }
  };

  // No `text-balance`: it would split a long name evenly over two lines, which is
  // exactly what the single-line heading wants to avoid. `truncate` keeps the
  // name on one line and ellipsises only when it genuinely can't fit.
  //
  // `block` so the button is a full-width box rather than an inline one that
  // shrink-wraps the name — the whole row is the click target, which is what
  // makes the heading read as a field.
  const HEADING_CLASS = "block w-full min-w-0 truncate text-2xl font-semibold text-gousse-ink";

  if (isEditing) {
    return (
      <input
        ref={focusOnMount}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={stopEditing}
        onKeyDown={handleKeyDown}
        aria-label="Issuer name"
        className={`${HEADING_CLASS} rounded-full border border-gousse-line bg-gousse-bg px-3 outline-none focus:border-gousse-accent`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      title="Rename issuer"
      className={`${HEADING_CLASS} cursor-text rounded-full border border-transparent px-3 text-left transition-colors hover:border-gousse-line`}
    >
      {issuer.name}
    </button>
  );
}
