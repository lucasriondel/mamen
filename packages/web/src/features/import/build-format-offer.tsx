import { Button } from "@/components/ui/button";
import type { WizardAction, WizardSource, WizardState } from "./wizard-reducer";

/**
 * What the offer to build a format is called, on the file it is offered for.
 *
 * A CSV is *a file* and a PDF is *the statement*, because on the PDF path the
 * thing in hand is the bank's document and what is on screen beside the form is
 * its transcribed table (issue #218) — "this file" would name the wrong one of the
 * two. One constant either way, so the offer's two homes (the drop's own panel and
 * the loaded-file panel below it) cannot come to say it differently.
 */
export function buildFormatLabel(source: WizardSource | null): string {
  return source === "pdf" ? "Build a format from this statement" : "Build a format from this file";
}

/**
 * The way out of an import no stored **Statement Format** applies to (issue #186),
 * and the state of the one being built.
 *
 * Offered rather than forced: all three CSV routes here — nothing matched, several
 * matched, an account with no CSV format at all — leave the picker on screen, so a
 * user whose file *is* readable by something they already have can still say so.
 * The offer disappears the moment a format is chosen, which is why a routine
 * import never sees it (PRD #180: the feature costs nothing when it is not
 * needed).
 *
 * Once a draft exists it says so here, because the upload step is where the user
 * comes back to: the picker below shows nothing selected, and a wizard that let
 * them continue without explaining what it was about to import under would be
 * keeping the format it is going to save a secret.
 *
 * A **discovered PDF** reaches this too (issue #218), and that is the whole of why
 * the offer here dispatches `build-format` rather than running discovery: the
 * transcribed table is already in hand, so coming back to the form after
 * discarding a draft must not spend a second AI run.
 */
export function BuildFormatOffer({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}) {
  if (state.draftFormat !== null) {
    const named = state.draftFormat.name.trim();
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-gousse-muted">
        <span>A new format{named === "" ? "" : ` — ${named}`} will be saved with this import.</span>
        <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "build-format" })}>
          Edit this format
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "discard-format-draft" })}
        >
          Discard this format
        </Button>
      </div>
    );
  }

  if (state.formatId !== null) return null;

  return (
    <div>
      <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "build-format" })}>
        {buildFormatLabel(state.source)}
      </Button>
    </div>
  );
}
