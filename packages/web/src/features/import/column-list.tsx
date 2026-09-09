import { Select } from "@/components/ui/select";
import { COLUMN_FIELD_BADGE, columnFieldValues, type MultiColumnField } from "./column-fields";
import type { ColumnPlumbing } from "./column-plumbing";
import { Field } from "./field";
import { PickColumnButton } from "./pick-column-button";
import { PickedColumnChips } from "./picked-column-chips";

/**
 * One question answered by **several** columns: the ones picked so far, in the
 * order they will be joined, and the control that adds another from the file.
 *
 * A chip list rather than a multi-select. The order is the answer — it is what the
 * values are joined in — and a `<select multiple>` has none to offer; neither does
 * it say what the joined result will read like, which is the whole question the
 * user is answering.
 *
 * Its pick mode **stays open**: the columns of a split label are found together,
 * and closing after each one would make the user re-open it for every part. The
 * way out is the Pick toggle or Escape, both of which the single-column fields
 * already taught.
 *
 * There is no empty choice. The label is required — a format that reads no column
 * for it produces rows with no identity — so "none" is not an answer it has, and
 * the list simply starts empty.
 */
export function ColumnList({
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

        <PickColumnButton
          field={field}
          isPicking={isPicking}
          onClick={() => {
            onPick(field);
            onActiveColumn(null);
          }}
        />
      </div>

      {chosen.length > 0 ? (
        <PickedColumnChips
          columns={chosen}
          badge={COLUMN_FIELD_BADGE[field]}
          // The same patch a second pick of the column runs: one definition of
          // "take this column back out".
          onRemove={(column) => onAssign(field, column)}
          onActiveColumn={onActiveColumn}
        />
      ) : null}
    </div>
  );
}
