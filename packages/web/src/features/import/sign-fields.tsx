import type { SignRule } from "@mamen/shared/contract";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ColumnPlumbing } from "./column-plumbing";
import { ColumnSelect } from "./column-select";
import { Field } from "./field";

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
export function SignFields({
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
