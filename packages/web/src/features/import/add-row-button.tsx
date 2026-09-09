import { Button } from "@/components/ui/button";

/**
 * **Add row** — the control that appends an operation the transcription missed
 * (issue #220, PRD #216).
 *
 * One component because it appears under the rows on both editable panes — the
 * **side-by-side validation** view's extracted rows, and the **file pane** where
 * a discovered PDF's transcription is corrected — in the same place, saying the
 * same word, doing the same thing. Two spellings of it would be two ways for the
 * button's name to drift, and its name is what the tests and a screen reader both
 * reach it by.
 *
 * It carries its own padding because both callers hang it outside their scroll
 * container, under the rows it appends to, so it stays put however far down them
 * the user has gone.
 */
export function AddRowButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="px-2 pb-2">
      <Button variant="secondary" size="sm" onClick={onClick}>
        Add row
      </Button>
    </div>
  );
}
