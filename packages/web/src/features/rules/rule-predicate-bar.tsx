import type { Account } from "@mamen/shared/contract";
import type { RefObject } from "react";
import { Select } from "@/components/ui/select";

/**
 * The four predicate cells, in the order the rule reads: **account · pattern ·
 * direction · value**. The pattern takes the one flexible column so a long
 * regex widens into the space the three constrained predicates don't need,
 * rather than wrapping the bar.
 *
 * Kept in one place so the legend row and the bar itself cannot drift apart —
 * they are the same grid, and a column added to one without the other would
 * silently mislabel every field to its right.
 */
const BAR_GRID = "grid grid-cols-1 gap-2.5 md:grid-cols-[190px_minmax(240px,1fr)_150px_140px]";

/**
 * A field inside the bar. Flat by default — the bar owns the border, so the
 * cells read as segments of one control rather than as four stacked inputs —
 * and it lifts onto the panel surface on focus, which is what says *this*
 * segment is the one taking keys.
 */
const CELL_CLASS =
  "w-full rounded-full border border-transparent bg-gousse-bg px-4 text-sm text-gousse-ink outline-none focus:border-gousse-accent focus:bg-gousse-panel";

/** The bar's legend — the labels that used to sit above each stacked field. */
function PredicateLegend() {
  return (
    <div className={`${BAR_GRID} hidden px-3 pb-1.5 md:grid`} aria-hidden>
      {["Account", "Pattern", "Direction", "Value"].map((label) => (
        <span key={label} className="text-[11px] uppercase tracking-wider text-gousse-muted">
          {label}
        </span>
      ))}
    </div>
  );
}

export interface RulePredicateBarProps {
  pattern: string;
  onPatternChange: (next: string) => void;
  /** Focused on mount and the target the regex-token chips splice into. */
  patternRef: RefObject<HTMLInputElement | null>;
  patternError: string | null;
  account: string;
  onAccountChange: (next: string) => void;
  accounts: ReadonlyArray<Account>;
  sign: string;
  onSignChange: (next: string) => void;
  value: string;
  onValueChange: (next: string) => void;
  valueError: string | null;
}

/**
 * The Matching Rule's predicates as **one line** — a single pill holding all
 * four, in the order the rule reads them.
 *
 * The four predicates used to stack as full-width labelled fields, each with a
 * helper sentence underneath, which spread the whole rule over more vertical
 * space than the preview it was meant to be read against. They are one
 * statement, so they get one control.
 *
 * The helper sentences go with the stacking. Each opt-out is now the field's
 * own first option or placeholder — **"Any account"**, **"Any"**, **"Any
 * value"** — which says *optional, and currently unscoped* in the place the
 * reader is already looking, rather than in a sentence below the fold. The
 * uppercase legend above carries the names on wide viewports; each field keeps
 * its `aria-label`, so the names are never only visual, and the legend is
 * `aria-hidden` rather than read twice.
 *
 * Errors stay out of the bar: a compile failure or an unparseable amount is
 * reported once, below, by {@link RulePatternMeta}. The field marks itself
 * `aria-invalid` and lets that line do the talking.
 */
export function RulePredicateBar({
  pattern,
  onPatternChange,
  patternRef,
  patternError,
  account,
  onAccountChange,
  accounts,
  sign,
  onSignChange,
  value,
  onValueChange,
  valueError,
}: RulePredicateBarProps) {
  return (
    <div>
      <PredicateLegend />
      <div
        className={`${BAR_GRID} items-center rounded-3xl border border-gousse-line bg-gousse-panel p-3 shadow-gousse-md md:rounded-full`}
      >
        <Select
          value={account}
          onChange={(event) => onAccountChange(event.target.value)}
          aria-label="Matching Rule account"
          className={`${CELL_CLASS} h-9`}
        >
          <option value="">Any account</option>
          {accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>

        <input
          ref={patternRef}
          className={`${CELL_CLASS} h-9 font-mono`}
          value={pattern}
          onChange={(event) => onPatternChange(event.target.value)}
          placeholder="e.g. amazon"
          aria-label="Matching Rule pattern"
          aria-invalid={patternError !== null}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus the primary field on open
          autoFocus
        />

        <Select
          value={sign}
          onChange={(event) => onSignChange(event.target.value)}
          aria-label="Matching Rule direction"
          className={`${CELL_CLASS} h-9`}
        >
          <option value="">Any</option>
          <option value="positive">Money in</option>
          <option value="negative">Money out</option>
        </Select>

        <input
          className={`${CELL_CLASS} h-9 tabular-nums`}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Any value"
          aria-label="Matching Rule value"
          aria-invalid={valueError !== null}
        />
      </div>
    </div>
  );
}
