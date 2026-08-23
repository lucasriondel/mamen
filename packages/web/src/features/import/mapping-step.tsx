import type { DateOrder, DecimalSeparator, SignRule } from "@mamen/shared/contract";
import type { ReactNode } from "react";
import { SplitView } from "@/components/split-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatShortDate } from "@/lib/format";
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
 * Sixty-forty, the PDF step's ratio rather than the CSV preview's even one: the
 * file is what is being read *from* here — the answer to "which column holds the
 * label" is in its values — while the right pane holds a column of selects that
 * needs no width at all. The preview step's two panes are both tables of the
 * same rows, so it splits them evenly. The first drag replaces every one of
 * these (issue #210).
 */
const MAPPING_SPLIT_DEFAULT = 0.6;

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
        left={<CsvFileTable fileName={fileName} headers={headers} rows={rows} />}
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

              <ColumnSelect
                label="Operation date column"
                headers={headers}
                value={draft.mapping.date}
                onChange={(date) => update({ mapping: { ...draft.mapping, date } })}
              />
              <ColumnSelect
                label="Operation label column"
                headers={headers}
                value={draft.mapping.rawIssuerString}
                onChange={(rawIssuerString) =>
                  update({ mapping: { ...draft.mapping, rawIssuerString } })
                }
              />
              {/* Optional, and `null` is an *answer*: a bank that writes no
                  counterparty account number has to say so, or "carries none"
                  and "nobody got round to it" look alike in the stored record. */}
              <ColumnSelect
                label="Counterparty IBAN column"
                headers={headers}
                value={draft.mapping.counterpartyIban ?? ""}
                none="This bank writes none"
                onChange={(column) =>
                  update({
                    mapping: { ...draft.mapping, counterpartyIban: column === "" ? null : column },
                  })
                }
              />

              <SignFields
                headers={headers}
                sign={draft.sign}
                onChange={(sign) => update({ sign })}
              />

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
                label="Only import rows where"
                headers={headers}
                value={draft.filter?.column ?? ""}
                none="Import every row"
                onChange={(column) =>
                  update({
                    filter: column === "" ? null : { column, equals: draft.filter?.equals ?? "" },
                  })
                }
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
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gousse-muted">
      {label}
      {children}
    </label>
  );
}

/**
 * A `<select>` over the file's own headers. `none` makes the empty choice a real
 * answer ("this bank writes none", "import every row") rather than an unanswered
 * question; without it the placeholder is disabled and the user must choose.
 */
function ColumnSelect({
  label,
  headers,
  value,
  none,
  onChange,
}: {
  label: string;
  headers: readonly string[];
  value: string;
  none?: string;
  onChange: (column: string) => void;
}) {
  return (
    <Field label={label}>
      <Select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
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
  headers,
  sign,
  onChange,
}: {
  headers: readonly string[];
  sign: SignRule;
  onChange: (sign: SignRule) => void;
}) {
  return (
    <>
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
          <ColumnSelect
            label="Debit column"
            headers={headers}
            value={sign.debitColumn}
            onChange={(debitColumn) => onChange({ ...sign, debitColumn })}
          />
          <ColumnSelect
            label="Credit column"
            headers={headers}
            value={sign.creditColumn}
            onChange={(creditColumn) => onChange({ ...sign, creditColumn })}
          />
        </>
      ) : (
        <ColumnSelect
          label="Amount column"
          headers={headers}
          value={sign.amountColumn}
          onChange={(amountColumn) => onChange({ ...sign, amountColumn })}
        />
      )}

      {sign.strategy === "direction-column" ? (
        <>
          <ColumnSelect
            label="Direction column"
            headers={headers}
            value={sign.directionColumn}
            onChange={(directionColumn) => onChange({ ...sign, directionColumn })}
          />
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
