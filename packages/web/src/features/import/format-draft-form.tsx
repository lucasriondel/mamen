import type { DateOrder, DecimalSeparator, SignRule } from "@mamen/shared/contract";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ColumnPlumbing } from "./column-plumbing";
import { ColumnList } from "./column-list";
import { ColumnSelect } from "./column-select";
import { Field } from "./field";
import type { FormatDraft } from "./parsers/format-draft";
import { SignFields } from "./sign-fields";
import { WizardPanel } from "./wizard-panel";

/**
 * Every question a **Statement Format** is built by asking, in the order they are
 * asked (issue #186, PRD #180).
 *
 * The choices are the file's **real headers**, so the user is picking from what
 * the statement actually contains rather than typing column names at it. Nothing
 * here is written anywhere — the draft lives in wizard state and is saved by the
 * action that commits the rows, so abandoning the import leaves the account
 * exactly as it was found.
 *
 * Its own component because the step around it is a layout — a split, a sentence
 * and two buttons — and the form is the substance inside one of its panes. The
 * two answer to different things: where the panes sit is chrome the user drags,
 * and what is asked is the format.
 */
export function FormatDraftForm({
  draft,
  update,
  columns,
  onTouchValueRule,
}: {
  draft: FormatDraft;
  update: (patch: Partial<FormatDraft>) => void;
  /** What every column-valued question is handed, since none of it differs. */
  columns: ColumnPlumbing;
  /**
   * Answering one of the two **value rules** by hand takes it out of inference's
   * hands for good (issue #222) — a user who corrected the date order and then
   * remapped the amount column must not watch their correction vanish.
   */
  onTouchValueRule: (rule: "dateOrder" | "decimalSeparator") => void;
}) {
  return (
    <WizardPanel>
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

      <SignFields onChange={(sign: SignRule) => update({ sign })} {...columns} />

      {/* The two rules PRD #180 refuses to *guess* at. Both still open
          unanswered on a file that does not settle them — a default there would
          be a choice the user never made, and its wrongness reads as a perfectly
          plausible date and a plausible number. What issue #222 adds is not a
          guess: a column of `23/04/2026` has no month-first reading, so mapping
          it *answers* this field, and a column of `01/02/2026` leaves it blank as
          before. Either way the answer is a default the user overrides here, and
          doing so takes the field out of inference's hands for good. */}
      <Field label="Date order">
        <Select
          aria-label="Date order"
          value={draft.dateOrder ?? ""}
          onChange={(event) => {
            onTouchValueRule("dateOrder");
            update({ dateOrder: event.target.value as DateOrder });
          }}
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
          onChange={(event) => {
            onTouchValueRule("decimalSeparator");
            update({ decimalSeparator: event.target.value as DecimalSeparator });
          }}
        >
          <option value="" disabled>
            How does this bank write numbers?
          </option>
          <option value="dot">Dot — 1234.56</option>
          <option value="comma">Comma — 1 234,56</option>
        </Select>
      </Field>

      {/* The optional row filter — one column equal to one value, which is how
          "settled operations only" is said. */}
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
                draft.filter === null ? null : { ...draft.filter, equals: event.target.value },
            })
          }
        />
      </Field>
    </WizardPanel>
  );
}
