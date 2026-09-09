import { useState } from "react";
import { cn } from "@/lib/utils";
import { editableCellClass } from "./editable-cell";

/**
 * The signed-amount cell of the **side-by-side validation** view.
 *
 * A plain number input coerces every keystroke and drops intermediate states like
 * a lone `-` or a trailing `.`, so this keeps a local string draft while focused
 * (letting the user type `-42` or `3.` freely) and commits the parsed number to
 * the wizard whenever the draft parses. On blur the draft is dropped and the field
 * reflects the committed number.
 *
 * `inputMode="decimal"` rather than `type="number"` for the same reason: the
 * intermediate states are the point, and a number input refuses to hold them.
 */
export function AmountInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  /** True while the row is a **skipped row** — its fields are inert. */
  disabled: boolean;
  onChange: (amount: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={draft ?? String(value)}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const n = Number.parseFloat(next);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setDraft(null)}
      // Narrower than a text cell and centred: an amount is read against the
      // amounts above and below it, which is what tabular figures are for.
      className={cn(editableCellClass({ struck: disabled }), "w-24 text-center tabular-nums")}
    />
  );
}
