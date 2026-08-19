import { useId } from "react";
import { Input } from "@/components/ui/input";
import { isPlausibleIban, normalizeIban } from "./account-iban";

export interface IbanFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Rendered above the input; omitted when the field sits in a labelled row. */
  label?: string;
  className?: string;
}

/**
 * The IBAN text field, shared by the create dialog and the card's edit form so
 * both spell the same rules once.
 *
 * The field keeps the user's own keystrokes in state rather than reformatting as
 * they type: rewriting the value under the caret is how a "helpful" IBAN input
 * ends up putting the cursor in the middle of the string every fourth character.
 * Normalisation happens at submit ({@link ibanPayload}), and the grouped form is
 * a read-time concern ({@link formatIban}) — so what is typed, what is stored
 * and what is displayed are three separate steps and none of them fights the
 * caret.
 *
 * The shape check ({@link isPlausibleIban}) only ever paints `aria-invalid`; it
 * does not block submit. An IBAN this app does not recognise is still the user's
 * real account number, and the cost of being wrong in that direction is an
 * account that cannot be saved — much worse than a stored string with a typo the
 * user can see and fix on the card.
 */
export function IbanField({ value, onChange, label = "IBAN", className }: IbanFieldProps) {
  const hintId = useId();
  const invalid = !isPlausibleIban(normalizeIban(value));

  return (
    <label className={className ?? "flex flex-col gap-1 text-gousse-muted text-sm"}>
      {label}
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. FR76 9999 9000 0112 3456 7890 189"
        aria-label="Account IBAN"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? hintId : undefined}
        autoComplete="off"
        spellCheck={false}
        // IBANs are entered upper-case; the value is normalised at submit
        // anyway, so this only spares the user the shift key.
        className="uppercase"
      />
      {invalid ? (
        <span id={hintId} className="text-gousse-high text-xs">
          That doesn't look like an IBAN — you can still save it.
        </span>
      ) : (
        <span className="text-gousse-muted text-xs">Optional.</span>
      )}
    </label>
  );
}
