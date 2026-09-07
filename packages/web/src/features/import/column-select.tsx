import { useEffect, useRef } from "react";
import { Select } from "@/components/ui/select";
import { columnFieldValue, type SingleColumnField } from "./column-fields";
import type { ColumnPlumbing } from "./column-plumbing";
import { Field } from "./field";
import { PickColumnButton } from "./pick-column-button";

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
 * header click does is put a value in this select, and the two can never disagree
 * about what was chosen.
 *
 * It also says which column of the file the user is currently answering about, so
 * the pane opposite can mark it more strongly (issue #213): the one it names when
 * it is entered, the newly picked one the moment it is answered, and none once the
 * user has left it. `onActiveColumn` is not optional, because a select that stayed
 * silent would leave the previous field's column lit while the user answered a
 * different question.
 */
export function ColumnSelect({
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

      <PickColumnButton
        field={field}
        isPicking={isPicking}
        onClick={() => {
          onPick(field);
          // The column this field already names stays lit while the user looks
          // for the one they meant.
          onActiveColumn(value === "" ? null : value);
        }}
      />
    </div>
  );
}
