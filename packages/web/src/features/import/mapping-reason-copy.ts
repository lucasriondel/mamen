import type { FormatDraft } from "./parsers/format-draft";
import type { FormatSelection } from "./wizard-reducer";

/**
 * Why the user is on the mapping step, in a sentence naming their own file.
 *
 * The routes into that step behave identically and differ only in this line
 * (issue #186). An account nobody has set up yet has not *failed* to recognise
 * anything, and a first import that reads as a rejection is the dead end the step
 * exists to remove; an ambiguity is not a file the app could not read, it is one
 * it read twice over, so the offer there is a *new* format rather than a
 * replacement for the pick the user can still make.
 *
 * A **discovered PDF** has its own trio (issue #221), and the same three
 * distinctions: the account has no PDF format at all, several are saved and none
 * was chosen, or the one that was chosen reported a **format verdict** mismatch —
 * the bank changed its export. Written apart from the CSV three rather than folded
 * into them, because each says something the CSV wording does not: what is below
 * is a *transcription* on all three, a PDF's several is an unanswered question
 * rather than a double match, and nothing on the CSV path ever gets as far as a
 * mismatch.
 *
 * The `reason` is never a detection verdict here — there is no header row to
 * fingerprint — it is which of the three screens the discovery run was spent from,
 * carried by `discover-start`.
 */
export function mappingReasonCopy(
  reason: FormatSelection | null,
  fileName: string,
  kind: FormatDraft["kind"],
): string {
  if (kind === "pdf") {
    switch (reason) {
      case "mismatch":
        return `${fileName} no longer carries the columns that format declares — the bank has changed its export. Build one that reads it — the table below is that statement, transcribed — and it will be saved with this import.`;
      case "several":
        return `More than one PDF statement format is saved for this account, and none of them was chosen for ${fileName}. Build a new one from it — the table below is that statement, transcribed — or go back and pick one of them.`;
      default:
        return `This account has no PDF statement format yet. Build one from ${fileName} — the table below is that statement, transcribed — and it will be saved with this import.`;
    }
  }
  switch (reason) {
    case "no-formats":
      return `This account has no CSV statement format yet. Build one from ${fileName} and it will be saved with this import.`;
    case "several":
      return `More than one saved format matches ${fileName}. Build a new one from it, or go back and pick one of them.`;
    default:
      return `No saved format recognizes ${fileName}. Build one from it and it will be saved with this import.`;
  }
}
