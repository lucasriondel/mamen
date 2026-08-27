import { SplitView } from "@/components/split-view";
import { Button } from "@/components/ui/button";
import { COLUMN_FIELD_BADGE } from "./column-fields";
import { draftColumnMarks } from "./column-marks";
import type { ColumnPlumbing } from "./column-plumbing";
import { DraftPreview } from "./draft-preview";
import { FileTable } from "./file-table";
import { FormatDraftForm } from "./format-draft-form";
import { mappingReasonCopy } from "./mapping-reason-copy";
import { draftComplete, type FormatDraft, draftRules } from "./parsers/format-draft";
import type { ParsedTransaction } from "./parsers/types";
import { PdfPane } from "./pdf-pane";
import { useColumnPicking } from "./use-column-picking";
import { STATEMENT_SPLIT_RATIO_STORAGE_KEY, useSplitRatio } from "./use-split-ratio";
import type { FormatSelection, WizardAction } from "./wizard-reducer";

/**
 * What this step's split shows until the user has dragged anything.
 *
 * Eighty-twenty, the widest the divider goes at all. The file is what is being
 * read *from* here — the answer to "which column holds the label" is in its
 * values, and a statement column of French labels or IBANs is only settled by
 * seeing it untruncated — while the right pane holds a column of selects, each of
 * which is as readable narrow as wide. The PDF step's sixty-forty and the CSV
 * preview's even split both weigh two panes that carry comparable content; this
 * step does not. The first drag replaces every one of these (issue #210).
 */
const MAPPING_SPLIT_DEFAULT = 0.8;

/**
 * The same split's default when a **statement pane** shares the width with it
 * (issue #219) — three panes dividing what two used to.
 *
 * Eighty-twenty of what is left after the statement would leave the form a
 * thirteenth of the screen: a column of selects is readable narrow, but not that
 * narrow, and the widest the divider goes is a poor answer once it is a share of
 * a share. Sixty-five leaves the discovered table the greater part of the
 * remainder and the form something to be read in. As ever, the first drag
 * replaces it.
 */
const MAPPING_SPLIT_WITH_STATEMENT = 0.65;

/**
 * What the reference statement takes of the whole width until it is dragged.
 *
 * Less than the sixty **side-by-side validation** gives it, and for a different
 * job: there the statement is what the rows are read *from*, here it is what the
 * transcription is checked *against* while the work happens in the two panes
 * beside it. Enough of the screen to read a statement page at the viewer's own
 * zoom, and no more.
 */
const STATEMENT_SPLIT_DEFAULT = 0.4;

/**
 * Step 2 of the no-format-applies path — build a **Statement Format** from the
 * file in front of you (issue #186, PRD #180).
 *
 * The questions themselves are {@link FormatDraftForm}'s and the live reading of
 * the file is {@link DraftPreview}'s; what this component owns is the *shape* of
 * the step. The file's own rows in one pane, the form and its preview opposite,
 * in the shared {@link SplitView} the other two post-upload views use — the user
 * is no longer answering from memory of a file opened in another application
 * (issue #212). Below them the live preview parses the file's real rows through
 * `applyFormat` — the very function the import runs — which is the only thing
 * that makes a wrong date order or decimal separator visible *before* it becomes
 * stored data.
 *
 * Nothing here is written anywhere. The draft lives in wizard state and is saved
 * by the action that commits the rows, so abandoning the import leaves the
 * account exactly as it was found.
 *
 * Since issue #214 the questions can also be answered *from* the file: beside each
 * column select is a control that puts the file pane into **pick mode**, where the
 * next header click assigns that column to that field. Both routes run one
 * `assign` (see {@link useColumnPicking}), and the value lives in the select
 * either way — the table is a second route to it, never a second source of truth.
 *
 * The sentence at the top and the two buttons at the bottom stay *outside* the
 * split, where the other steps put their banners and their commit rail: they are
 * about the step rather than about either pane, and leaving the step is not a
 * moment to make the user find a scroll position for.
 *
 * Since issue #218 a **PDF** arrives here too, and almost nothing in this
 * component knows it. What discovery hands over is the statement's table as
 * printed (issue #217) — the bank's own columns over string cells — which is the
 * same shape a parsed CSV is, so the same file pane, the same marks, the same pick
 * mode and the same `applyFormat` read it. The draft's `kind` decides the sentence
 * at the top and which half of the format union the commit writes.
 *
 * Except that a PDF has one thing a CSV has not: **the statement itself** (issue
 * #219). What the middle pane shows on that path is a model's *reading* of a
 * document, and a reading can only be judged against the thing read — so the
 * source file joins the step as a leftmost reference pane, and the two-pane split
 * becomes the right-hand side of a second one. Nothing about the mapping moves. A
 * CSV passes no statement and the step is exactly the two panes it was — a file
 * the browser parsed has no rendering to be checked against.
 */
export function MappingStep({
  fileName,
  statement,
  headers,
  rows,
  reason,
  draft,
  records,
  rowCount,
  dispatch,
}: {
  fileName: string;
  /**
   * The source **PDF** the table beside it was transcribed from, or `null` on
   * every CSV path — which is also what decides whether this step is three panes
   * or two.
   */
  statement: File | null;
  /** The dropped file's own header row — the choices, and later the fingerprint. */
  headers: readonly string[];
  /** Every row of the file, as delivered — what the left pane shows. */
  rows: ReadonlyArray<Record<string, string>>;
  /** Which of the three no-format-applies routes led here; decides the copy only. */
  reason: FormatSelection | null;
  draft: FormatDraft;
  /** The file's rows read through the draft — empty while it cannot read them. */
  records: readonly ParsedTransaction[];
  /** How many rows the file holds, against which the filter's effect is read. */
  rowCount: number;
  dispatch: (action: WizardAction) => void;
}) {
  // Where the user left the divider — chrome rather than import state, so it is
  // one position shared with the other two split steps and it outlives this
  // import.
  const { ratio, setRatio } = useSplitRatio(
    statement === null ? MAPPING_SPLIT_DEFAULT : MAPPING_SPLIT_WITH_STATEMENT,
  );
  // The other divider, and the only one on any step that is not the shared
  // position: how much room the reference statement takes is a question no
  // other step asks, and two dividers reading one entry would jump each other.
  const statementSplit = useSplitRatio(STATEMENT_SPLIT_DEFAULT, STATEMENT_SPLIT_RATIO_STORAGE_KEY);

  const update = (patch: Partial<FormatDraft>) => dispatch({ type: "update-format-draft", patch });
  const picking = useColumnPicking({ draft, rows, update });

  // What every column select needs and none of them decides for itself: the
  // choices, which field is picking, and the two ways an answer gets out.
  const columns: ColumnPlumbing = {
    headers,
    draft,
    picking: picking.picking,
    onPick: picking.togglePicking,
    onAssign: picking.assign,
    onActiveColumn: picking.setActiveColumn,
  };

  // Whether the draft can read the file yet. Asked of the same function the
  // parent applies, so the table appears exactly when there is something true to
  // put in it — not when a subset of the fields happens to be filled.
  const readable = draftRules(draft) !== null;

  // The mapping itself: the table being mapped, and the form mapping it. The
  // whole of the step on the CSV path, and the right-hand side of the statement
  // split on the PDF one — so its height is its own only while it stands alone,
  // and is the pane it was given otherwise.
  const mapping = (
    <SplitView
      // Tall enough to read a statement in, and the reason each pane has
      // something to scroll *inside*: a single scrolling column would carry
      // the file off the top of the screen on the way down the form (#210).
      // Nested, that height is the outer split's and this takes the pane.
      className={statement === null ? "h-[85vh]" : "h-full"}
      ratio={ratio}
      onRatioChange={setRatio}
      left={
        <FileTable
          fileName={fileName}
          headers={headers}
          rows={rows}
          // Derived from the draft on every render: remapping a field moves its
          // mark because this no longer names the old column.
          marks={draftColumnMarks(draft)}
          activeColumn={picking.activeColumn}
          pickingFor={picking.picking === null ? null : COLUMN_FIELD_BADGE[picking.picking]}
          onPickColumn={picking.pickColumn}
        />
      }
      right={
        <div className="flex flex-col gap-6">
          <FormatDraftForm
            draft={draft}
            update={update}
            columns={columns}
            onTouchValueRule={picking.markTouched}
          />

          {/* Beneath the form, still in the right pane. The raw rows opposite
              say what the bank wrote; these say what the draft reads of it,
              and a wrong date order or decimal separator is only ever visible
              in the second (PRD #208). */}
          {readable ? (
            <DraftPreview records={records} rowCount={rowCount} />
          ) : (
            <p className="text-sm text-gousse-muted">
              Map the date, the label and the amount, and say how the dates and numbers are written
              — the rows of your file will be read here as you go.
            </p>
          )}
        </div>
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gousse-muted">{mappingReasonCopy(reason, fileName, draft.kind)}</p>

      {statement === null ? (
        mapping
      ) : (
        <SplitView
          // The same height the two-pane step has, given to the outer split now:
          // the mapping inside it takes whatever this pane is left with.
          className="h-[85vh]"
          ratio={statementSplit.ratio}
          onRatioChange={statementSplit.setRatio}
          // Named apart from the divider every step shares, because there are two
          // of them on this screen and "the panes" would name either.
          dividerLabel="Resize the statement pane"
          left={<PdfPane file={statement} />}
          right={mapping}
        />
      )}

      <MappingActions draft={draft} rowCount={rowCount} dispatch={dispatch} />
    </div>
  );
}

/** The two ways out of the step: on to the preview, or abandon the draft. */
function MappingActions({
  draft,
  rowCount,
  dispatch,
}: {
  draft: FormatDraft;
  rowCount: number;
  dispatch: (action: WizardAction) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="primary"
        size="md"
        // `rowCount` is in it because `canPreview` guards the action itself: a
        // file with a header row and nothing under it has nothing to preview
        // however well it is mapped, and a button that does nothing is worse
        // than a disabled one.
        disabled={!draftComplete(draft) || rowCount === 0}
        onClick={() => dispatch({ type: "go-to-preview" })}
      >
        Continue to preview
      </Button>
      <Button
        variant="secondary"
        size="md"
        onClick={() => dispatch({ type: "discard-format-draft" })}
      >
        Discard this format
      </Button>
    </div>
  );
}
