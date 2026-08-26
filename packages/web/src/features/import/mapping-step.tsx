import type { DateOrder, DecimalSeparator, SignRule } from "@mamen/shared/contract";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { SplitView } from "@/components/split-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type ColumnField,
  COLUMN_FIELD_BADGE,
  columnFieldPatch,
  columnFieldValue,
  columnFieldValues,
  isMultiColumnField,
  type MultiColumnField,
  type SingleColumnField,
} from "./column-fields";
import { draftColumnMarks } from "./column-marks";
import { CsvFileTable } from "./csv-file-table";
import { draftComplete, type FormatDraft, draftRules } from "./parsers/format-draft";
import type { ParsedTransaction } from "./parsers/types";
import { useSplitRatio } from "./use-split-ratio";
import type { FormatSelection, WizardAction } from "./wizard-reducer";

/** How many parsed rows the live preview shows before it stops listing them. */
const PREVIEW_ROWS = 10;

/**
 * What this step's split shows until the user has dragged anything.
 *
 * Eighty-twenty, the widest the divider goes at all ({@link MAX_SPLIT_RATIO}).
 * The file is what is being read *from* here — the answer to "which column holds
 * the label" is in its values, and a statement column of French labels or IBANs
 * is only settled by seeing it untruncated — while the right pane holds a column
 * of selects, each of which is as readable narrow as wide. The PDF step's
 * sixty-forty and the CSV preview's even split both weigh two panes that carry
 * comparable content; this step does not. The first drag replaces every one of
 * these (issue #210).
 */
const MAPPING_SPLIT_DEFAULT = 0.8;

/**
 * Why the user is here, in a sentence naming their own file.
 *
 * The three routes into this step behave identically and differ only in this
 * line (issue #186). An account nobody has set up yet has not *failed* to
 * recognise anything, and a first import that reads as a rejection is the dead
 * end this step exists to remove; an ambiguity is not a file the app could not
 * read, it is one it read twice over, so the offer there is a *new* format
 * rather than a replacement for the pick the user can still make.
 */
function reasonCopy(reason: FormatSelection | null, fileName: string): string {
  switch (reason) {
    case "no-formats":
      return `This account has no CSV statement format yet. Build one from ${fileName} and it will be saved with this import.`;
    case "several":
      return `More than one saved format matches ${fileName}. Build a new one from it, or go back and pick one of them.`;
    default:
      return `No saved format recognizes ${fileName}. Build one from it and it will be saved with this import.`;
  }
}

/**
 * Step 2 of the no-format-applies path — build a **Statement Format** from the
 * file in front of you (issue #186, PRD #180).
 *
 * The choices are the file's **real headers**, so the user is picking from what
 * the statement actually contains rather than typing column names at it. Below
 * them, the live preview parses the file's real rows through
 * `applyFormat` — the very function the import runs — and re-reads them on every
 * change. That is the only thing that makes a wrong date order or decimal
 * separator visible *before* it becomes stored data: `03/04/2026` is a real date
 * under either order, and `1 929,71` is a real number under either separator.
 *
 * Nothing here is written anywhere. The draft lives in wizard state and is saved
 * by the action that commits the rows, so abandoning the import leaves the
 * account exactly as it was found.
 *
 * Since issue #212 the file itself is on screen while all this is answered, in
 * the shared {@link SplitView} the other two post-upload views already use: the
 * statement's own rows in the left pane, this form and its live preview in the
 * right one. The questions are the same questions — the user is simply no longer
 * answering them from memory of a file opened in another application.
 *
 * Since issue #214 they can also be answered *from* it: beside each column
 * select is a control that puts the file pane into **pick mode**, where the next
 * header click assigns that column to that field. Someone who has found the
 * right column by eye should not have to find its name again in a dropdown. Both
 * routes run the one `assign` below, and the value lives in the select either
 * way — the table is a second route to it, never a second source of truth.
 *
 * The sentence at the top and the two buttons at the bottom stay *outside* the
 * split, where the other steps put their banners and their commit rail: they are
 * about the step rather than about either pane, and leaving the step is not a
 * moment to make the user find a scroll position for.
 */
export function MappingStep({
  fileName,
  headers,
  rows,
  reason,
  draft,
  records,
  rowCount,
  dispatch,
}: {
  fileName: string;
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
  const { ratio, setRatio } = useSplitRatio(MAPPING_SPLIT_DEFAULT);
  const update = (patch: Partial<FormatDraft>) => dispatch({ type: "update-format-draft", patch });

  // Which column the file pane marks more strongly: the one the field the user
  // is currently in points at (issue #213). Focus is the whole of it — a column
  // select says which column it names when it is entered and again when it is
  // answered, and says nothing on the way out — so this is a fact about where
  // the cursor is rather than a second copy of the mapping, which is why it is
  // component state and not the draft's.
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  // The badges themselves, derived from the draft on every render: remapping a
  // field moves its mark because this no longer names the old column.
  const marks = draftColumnMarks(draft);

  // Which field, if any, the next header click answers (issue #214). One field
  // at a time by construction — it is one slot, so opening a second pick closes
  // the first, and the header the user clicks answers the question they last
  // asked. The *field* is held rather than a handler, so the update below is
  // always written against the draft as it stands at the moment of the click.
  const [picking, setPicking] = useState<ColumnField | null>(null);

  // The one update both routes run: the select's own change, and a header click
  // in pick mode. Two spellings of "the date column is now this" are two things
  // that can drift, and the table is a second route to one value rather than a
  // second value.
  const assign = (field: ColumnField, column: string) => {
    update(columnFieldPatch(draft, field, column));
    // The column just named is the one the file marks more strongly — except
    // when the click *removed* it from a list, where lighting it would say the
    // opposite of what happened.
    const removed = isMultiColumnField(field) && columnFieldValues(draft).includes(column);
    setActiveColumn(column === "" || removed ? null : column);
  };

  // A single-column field is answered by one click and its pick mode closes on
  // the answer. The **Label** holds a list, so its mode stays open and each
  // click adds a column — clicking a marked one again takes it back out. The way
  // out is then the same two the user already has: the Pick toggle, or Escape.
  const pickColumn = (header: string) => {
    if (picking === null) return;
    assign(picking, header);
    if (!isMultiColumnField(picking)) setPicking(null);
  };

  // Escape leaves pick mode having assigned nothing — the way any transient
  // surface is left, and the reason opening one is not a commitment. On the
  // document because the click it is waiting for is in the *other* pane, so
  // there is no one element focus can be assumed to be inside.
  useEffect(() => {
    if (picking === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPicking(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [picking]);

  // What every column select needs and none of them decides for itself: the
  // choices, which field is picking, and the two ways an answer gets out.
  const columns: ColumnPlumbing = {
    headers,
    draft,
    picking,
    // A second press closes it — the control that opened pick mode is the way
    // back out of it, and closing assigns nothing.
    onPick: (field) => setPicking((current) => (current === field ? null : field)),
    onAssign: assign,
    onActiveColumn: setActiveColumn,
  };

  // Whether the draft can read the file yet. Asked of the same function the
  // parent applies, so the table appears exactly when there is something true to
  // put in it — not when a subset of the fields happens to be filled.
  const readable = draftRules(draft) !== null;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gousse-muted">{reasonCopy(reason, fileName)}</p>

      <SplitView
        // Tall enough to read a statement in, and the reason each pane has
        // something to scroll *inside*: a single scrolling column would carry
        // the file off the top of the screen on the way down the form (#210).
        className="h-[85vh]"
        ratio={ratio}
        onRatioChange={setRatio}
        left={
          <CsvFileTable
            fileName={fileName}
            headers={headers}
            rows={rows}
            marks={marks}
            activeColumn={activeColumn}
            pickingFor={picking === null ? null : COLUMN_FIELD_BADGE[picking]}
            onPickColumn={pickColumn}
          />
        }
        right={
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-gousse-line bg-gousse-panel p-4">
              <Field label="Format name">
                <Input
                  aria-label="Format name"
                  value={draft.name}
                  placeholder="e.g. Green-Got"
                  onChange={(event) => update({ name: event.target.value })}
                />
              </Field>

              <ColumnSelect field="date" label="Operation date column" {...columns} />
              {/* A list, not a choice: the parts of a label a bank split across
                  columns, read in the order they were picked. */}
              <ColumnList field="label" label="Operation label columns" {...columns} />
              {/* Optional, and `null` is an *answer*: a bank that writes no
                  counterparty account number has to say so, or "carries none"
                  and "nobody got round to it" look alike in the stored record. */}
              <ColumnSelect
                field="iban"
                label="Counterparty IBAN column"
                none="This bank writes none"
                {...columns}
              />

              <SignFields onChange={(sign) => update({ sign })} {...columns} />

              {/* The two rules PRD #180 refuses to guess at. Both open
                  unanswered: a default here would be a choice the user never
                  made, and its wrongness reads as a perfectly plausible date
                  and a plausible number. */}
              <Field label="Date order">
                <Select
                  aria-label="Date order"
                  value={draft.dateOrder ?? ""}
                  onChange={(event) => update({ dateOrder: event.target.value as DateOrder })}
                >
                  <option value="" disabled>
                    How does this bank write dates?
                  </option>
                  <option value="iso">ISO — 2026-04-03</option>
                  <option value="day-first">Day first — 03/04/2026</option>
                  <option value="month-first">Month first — 04/03/2026</option>
                </Select>
              </Field>

              <Field label="Decimal separator">
                <Select
                  aria-label="Decimal separator"
                  value={draft.decimalSeparator ?? ""}
                  onChange={(event) =>
                    update({ decimalSeparator: event.target.value as DecimalSeparator })
                  }
                >
                  <option value="" disabled>
                    How does this bank write numbers?
                  </option>
                  <option value="dot">Dot — 1234.56</option>
                  <option value="comma">Comma — 1 234,56</option>
                </Select>
              </Field>

              {/* The optional row filter — one column equal to one value, which
                  is how "settled operations only" is said. */}
              <ColumnSelect
                field="filter"
                label="Only import rows where"
                none="Import every row"
                {...columns}
              />
              <Field label="…equals">
                <Input
                  aria-label="…equals"
                  value={draft.filter?.equals ?? ""}
                  disabled={draft.filter === null}
                  placeholder="e.g. COMPLETE"
                  onChange={(event) =>
                    update({
                      filter:
                        draft.filter === null
                          ? null
                          : { ...draft.filter, equals: event.target.value },
                    })
                  }
                />
              </Field>
            </div>

            {/* Beneath the form, still in the right pane. The raw rows opposite
                say what the bank wrote; these say what the draft reads of it,
                and a wrong date order or decimal separator is only ever visible
                in the second (PRD #208). */}
            {readable ? (
              <PreviewOfDraft records={records} rowCount={rowCount} />
            ) : (
              <p className="text-sm text-gousse-muted">
                Map the date, the label and the amount, and say how the dates and numbers are
                written — the rows of your file will be read here as you go.
              </p>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="md"
          // `rowCount` is in it because `canPreview` guards the action itself:
          // a file with a header row and nothing under it has nothing to
          // preview however well it is mapped, and a button that does nothing
          // is worse than a disabled one.
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
    </div>
  );
}

/** One labelled control. The visible text *is* the control's name. */
function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm text-gousse-muted", className)}>
      {label}
      {children}
    </label>
  );
}

/**
 * What every {@link ColumnSelect} on this step is handed, since none of it
 * differs between them: the file's headers, the draft each reads its own answer
 * out of, which field is in pick mode, and the ways an answer gets back.
 */
type ColumnPlumbing = {
  headers: readonly string[];
  draft: FormatDraft;
  /** The field whose next header click is being waited for, or `null`. */
  picking: ColumnField | null;
  /** Open pick mode for a field — or close it, if it is the one already open. */
  onPick: (field: ColumnField) => void;
  onAssign: (field: ColumnField, column: string) => void;
  onActiveColumn: (column: string | null) => void;
};

/**
 * One column-valued question: a `<select>` over the file's own headers, and
 * beside it the control that answers the same question from the file (issue
 * #214).
 *
 * `none` makes the empty choice a real answer ("this bank writes none", "import
 * every row") rather than an unanswered question; without it the placeholder is
 * disabled and the user must choose.
 *
 * **The select is the value.** Both routes run `onAssign`, the field's own read
 * and write live in `column-fields.ts`, and the table holds nothing — so what a
 * header click does is put a value in this select, and the two can never
 * disagree about what was chosen.
 *
 * It also says which column of the file the user is currently answering about,
 * so the pane opposite can mark it more strongly (issue #213): the one it names
 * when it is entered, the newly picked one the moment it is answered, and none
 * once the user has left it. `onActiveColumn` is not optional, because a select
 * that stayed silent would leave the previous field's column lit while the user
 * answered a different question.
 */
function ColumnSelect({
  field,
  label,
  none,
  headers,
  draft,
  picking,
  onPick,
  onAssign,
  onActiveColumn,
}: ColumnPlumbing & {
  field: SingleColumnField;
  label: string;
  none?: string;
}) {
  const value = columnFieldValue(draft, field) ?? "";
  const isPicking = picking === field;
  const select = useRef<HTMLSelectElement>(null);

  // When pick mode ends, the button the user was on stops existing — so hand
  // focus back to the field that asked rather than dropping it on the body,
  // which is where a keyboard user would otherwise have to start again.
  const wasPicking = useRef(false);
  useEffect(() => {
    if (wasPicking.current && !isPicking) select.current?.focus();
    wasPicking.current = isPicking;
  }, [isPicking]);

  return (
    <div className="flex items-end gap-2">
      <Field label={label} className="min-w-0 flex-1">
        <Select
          ref={select}
          aria-label={label}
          value={value}
          onChange={(event) => onAssign(field, event.target.value)}
          onFocus={() => onActiveColumn(value === "" ? null : value)}
          onBlur={() => onActiveColumn(null)}
        >
          <option value="" disabled={none === undefined}>
            {none ?? "Pick a column…"}
          </option>
          {headers.map((header) => (
            <option key={header} value={header}>
              {header}
            </option>
          ))}
        </Select>
      </Field>

      {/* A toggle, said as one: the name stays put and `aria-pressed` carries
          the state, so the way out of pick mode is the control that opened it.
          Named for the field it fills rather than for the word on it, since
          every one of them says the same word. */}
      <Button
        variant="secondary"
        size="sm"
        aria-pressed={isPicking}
        aria-label={`Pick the ${COLUMN_FIELD_BADGE[field]} column from the file`}
        className={cn("shrink-0", isPicking && "border-gousse-accent text-gousse-accent")}
        onClick={() => {
          onPick(field);
          // The column this field already names stays lit while the user looks
          // for the one they meant.
          onActiveColumn(value === "" ? null : value);
        }}
      >
        Pick
      </Button>
    </div>
  );
}

/**
 * One question answered by **several** columns: the ones picked so far, in the
 * order they will be joined, and the control that adds another from the file.
 *
 * A chip list rather than a multi-select. The order is the answer — it is what
 * the values are joined in — and a `<select multiple>` has none to offer;
 * neither does it say what the joined result will read like, which is the whole
 * question the user is answering. The chips are that sentence, and each one
 * carries the way to take it back out.
 *
 * Its pick mode **stays open**: the columns of a split label are found together,
 * and closing after each one would make the user re-open it for every part. The
 * way out is the Pick toggle or Escape, both of which the single-column fields
 * already taught.
 *
 * There is no empty choice. The label is required — a format that reads no
 * column for it produces rows with no identity — so "none" is not an answer it
 * has, and the list simply starts empty.
 */
function ColumnList({
  field,
  label,
  draft,
  headers,
  picking,
  onPick,
  onAssign,
  onActiveColumn,
}: ColumnPlumbing & {
  field: MultiColumnField;
  label: string;
}) {
  const chosen = columnFieldValues(draft);
  const isPicking = picking === field;
  const pick = useRef<HTMLButtonElement>(null);

  // Every column already picked is one the file cannot offer again from the
  // select — it is in the list, and the way to remove it is its own chip.
  const remaining = headers.filter((header) => !chosen.includes(header));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <Field label={label} className="min-w-0 flex-1">
          <Select
            aria-label={label}
            // Always the placeholder: this select *adds*, and a value left
            // sitting in it would read as the answer rather than as the last
            // thing added.
            value=""
            onChange={(event) => onAssign(field, event.target.value)}
          >
            <option value="" disabled>
              {chosen.length === 0 ? "Pick a column…" : "Add another column…"}
            </option>
            {remaining.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </Select>
        </Field>

        <Button
          ref={pick}
          variant="secondary"
          size="sm"
          aria-pressed={isPicking}
          aria-label={`Pick the ${COLUMN_FIELD_BADGE[field]} column from the file`}
          className={cn("shrink-0", isPicking && "border-gousse-accent text-gousse-accent")}
          onClick={() => {
            onPick(field);
            onActiveColumn(null);
          }}
        >
          Pick
        </Button>
      </div>

      {chosen.length > 0 ? (
        // A list, said as one: the order is the answer, so it reads in order and
        // each entry says its own place in it.
        <ol
          aria-label={`${COLUMN_FIELD_BADGE[field]} columns, in order`}
          className="flex flex-wrap gap-1.5"
        >
          {chosen.map((column, index) => (
            <li key={column}>
              <span className="inline-flex items-center gap-1 rounded-full border border-gousse-line bg-gousse-panel py-0.5 pr-0.5 pl-2 text-xs text-gousse-text">
                <span className="tabular-nums text-gousse-muted">{index + 1}</span>
                {column}
                <button
                  type="button"
                  aria-label={`Remove ${column} from the ${COLUMN_FIELD_BADGE[field]} columns`}
                  className="rounded-full px-1 text-gousse-muted transition-colors hover:text-gousse-text"
                  onMouseEnter={() => onActiveColumn(column)}
                  onMouseLeave={() => onActiveColumn(null)}
                  // The same patch a second pick of the column runs: one
                  // definition of "take this column back out".
                  onClick={() => onAssign(field, column)}
                >
                  &times;
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** A freshly chosen sign strategy, with the columns it reads still unanswered. */
function emptySign(strategy: SignRule["strategy"]): SignRule {
  switch (strategy) {
    case "signed-column":
      return { strategy, amountColumn: "" };
    case "direction-column":
      return {
        strategy,
        amountColumn: "",
        directionColumn: "",
        debitValue: "",
      };
    case "debit-credit-columns":
      return { strategy, debitColumn: "", creditColumn: "" };
  }
}

/**
 * How the row says whether money came in or went out — the strategy, then the
 * columns that strategy reads.
 *
 * Switching strategy replaces the rule rather than patching it: each one names
 * different columns, and a leftover `amountColumn` under a debit/credit pair
 * would be a stored answer to a question this format no longer asks.
 */
function SignFields({
  onChange,
  ...columns
}: ColumnPlumbing & {
  onChange: (sign: SignRule) => void;
}) {
  // Read off the draft the column selects already have rather than passed a
  // second time: two routes to `draft.sign` is one more than the rule has.
  const sign = columns.draft.sign;

  return (
    <>
      {/* The *strategy* answers how a row is read rather than which column it is
          read from, so it marks nothing on the file and offers no pick control
          — only the columns it goes on to ask for do. */}
      <Field label="How the amount is signed">
        <Select
          aria-label="How the amount is signed"
          value={sign.strategy}
          onChange={(event) => onChange(emptySign(event.target.value as SignRule["strategy"]))}
        >
          <option value="signed-column">One column, signed as written</option>
          <option value="direction-column">An amount column plus a direction column</option>
          <option value="debit-credit-columns">Separate debit and credit columns</option>
        </Select>
      </Field>

      {sign.strategy === "debit-credit-columns" ? (
        <>
          <ColumnSelect field="debit" label="Debit column" {...columns} />
          <ColumnSelect field="credit" label="Credit column" {...columns} />
        </>
      ) : (
        <ColumnSelect field="amount" label="Amount column" {...columns} />
      )}

      {sign.strategy === "direction-column" ? (
        <>
          <ColumnSelect field="direction" label="Direction column" {...columns} />
          <Field label="Value meaning a debit">
            <Input
              aria-label="Value meaning a debit"
              value={sign.debitValue}
              placeholder="e.g. DEBIT"
              onChange={(event) => onChange({ ...sign, debitValue: event.target.value })}
            />
          </Field>
        </>
      ) : null}
    </>
  );
}

/**
 * The file's real rows, read through the draft as it stands.
 *
 * A row the rules cannot read is shown as unreadable rather than as a plausible
 * wrong value — an Invalid Date has no rendering, and hiding the row would hide
 * the very thing the user is here to notice.
 */
function PreviewOfDraft({
  records,
  rowCount,
}: {
  records: readonly ParsedTransaction[];
  rowCount: number;
}) {
  const shown = records.slice(0, PREVIEW_ROWS);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-gousse-muted">
        {records.length === rowCount
          ? `${rowCount} ${rowCount === 1 ? "row" : "rows"} will be imported.`
          : `${records.length} of ${rowCount} rows will be imported.`}
      </p>
      <div className="overflow-hidden rounded-2xl border border-gousse-line">
        <table className="w-full text-sm" aria-label="Preview of the parsed rows">
          <thead className="bg-gousse-panel text-gousse-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Raw issuer</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {/* Nothing here has an identity yet — the rows are re-read from
                scratch on every keystroke and none of them is a candidate for
                anything — so the position is the key. */}
            {shown.map((record, index) => (
              <tr key={index} className="border-gousse-line border-t">
                <td className="px-3 py-2 tabular-nums text-gousse-ink">
                  {Number.isNaN(record.date.getTime())
                    ? "Unreadable date"
                    : formatShortDate(record.date)}
                </td>
                <td className="px-3 py-2 text-gousse-ink">{record.rawIssuerString}</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    record.amount < 0 ? "text-gousse-high" : "text-gousse-low"
                  }`}
                >
                  {Number.isNaN(record.amount)
                    ? "Unreadable amount"
                    : formatCurrency(record.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {records.length > shown.length ? (
        <p className="text-xs text-gousse-muted">
          Showing the first {shown.length} of {records.length} rows.
        </p>
      ) : null}
    </div>
  );
}
