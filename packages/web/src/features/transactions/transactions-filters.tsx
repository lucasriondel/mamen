import type { Account } from "@mamen/shared/contract";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AccountMultiSelect } from "@/components/ui/account-multi-select";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GroupedToggle } from "./grouped-toggle";
import { UncuratedToggle } from "./uncurated-toggle";

/** The subset of filter state the controls read/write. */
export interface TransactionFilterValues {
  /** The selected accounts; empty or absent means all of them. */
  accountId?: number[];
  importMonth?: string;
  /** ISO date bounds — set by a link from the recap, not by a control here. */
  startDate?: string;
  endDate?: string;
  search?: string;
  /** Narrow to rows with no issuer, no derived category and no note. */
  uncurated?: boolean;
  /**
   * Narrow by **excluded from recap** state (issue #67): `true` shows only the
   * rows held out of spend totals, `false` only the rows that count, absent
   * shows both.
   */
  excludedFromRecap?: boolean;
  /** Narrow to **transfer legs** (`true`) or to everything else (`false`). */
  isTransferLeg?: boolean;
  /** `"bundle"` narrows to the **bundle parents**; absent shows every kind. */
  kind?: "bundle";
}

export interface TransactionsFiltersProps {
  /** Accounts to offer in the account picker. */
  accounts: readonly Account[];
  /** Distinct `YYYY-MM` months present in the data, for the month picker. */
  months: readonly string[];
  /** The currently-applied filter values (from the URL). */
  value: TransactionFilterValues;
  /**
   * Apply a filter change. A field set to `undefined` clears that filter; the
   * caller writes the result to the URL search params.
   */
  onChange: (patch: TransactionFilterValues) => void;
}

const inputClass = cn(
  "h-9 rounded-full border border-gousse-line bg-gousse-panel px-4 text-sm text-gousse-ink",
  "focus:outline-none focus:ring-2 focus:ring-gousse-accent",
);

/** How long typing pauses before a search term is written to the URL/query. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * The account + month + text-search filter bar. Two native `<select>`s and a
 * search box, all AND-composed, plus a "Clear" affordance shown only when a
 * filter is active. Presentational: it reads `value` and emits changes through
 * `onChange`; the route turns those into typed URL search params.
 *
 * The search box keeps its own local state and debounces `onChange`, so a URL
 * write (which resets pagination and adds a history entry) fires once the user
 * pauses rather than on every keystroke.
 */
export function TransactionsFilters({
  accounts,
  months,
  value,
  onChange,
}: TransactionsFiltersProps) {
  // The date bounds count as an active filter even though no control here shows
  // them: a recap link sets them to pin the period it was opened for, and a
  // narrowing the user can neither see nor undo is worse than one they can only
  // undo. Clear therefore drops them too — which is the honest reading of a
  // button labelled *Clear*, and the period is one Back away.
  const hasFilters =
    (value.accountId != null && value.accountId.length > 0) ||
    value.importMonth != null ||
    value.startDate != null ||
    value.endDate != null ||
    value.search != null ||
    value.uncurated === true ||
    value.excludedFromRecap != null ||
    value.isTransferLeg != null ||
    value.kind != null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <TransactionsSearchInput value={value.search} onChange={(search) => onChange({ search })} />

      {/*
       * Multi-select, sharing the recap's control: the recap's summary lines link
       * here carrying a multi-account selection, so this bar has to be able to
       * show one. An empty selection is the absent filter (all accounts).
       */}
      <AccountMultiSelect
        accounts={accounts}
        selected={value.accountId ?? []}
        onChange={(ids) => onChange({ accountId: ids.length > 0 ? ids : undefined })}
      />

      <label className="flex items-center gap-2 text-sm text-gousse-muted">
        Month
        <Select
          aria-label="Filter by month"
          value={value.importMonth ?? ""}
          onChange={(e) =>
            onChange({
              importMonth: e.target.value === "" ? undefined : e.target.value,
            })
          }
        >
          <option value="">All months</option>
          {months.map((month) => (
            <option key={month} value={month}>
              {formatMonth(month)}
            </option>
          ))}
        </Select>
      </label>

      {/*
       * **Excluded from recap** (issue #67) — a three-way select rather than a
       * toggle like *Uncurated only*: both halves are views the user asks for
       * ("what have I held out of my totals?" and "what actually counts?"), so
       * neither can be the mere absence of the control.
       */}
      <label className="flex items-center gap-2 text-sm text-gousse-muted">
        Recap
        <Select
          aria-label="Filter by recap exclusion"
          value={
            value.excludedFromRecap == null ? "" : value.excludedFromRecap ? "excluded" : "counted"
          }
          onChange={(e) =>
            onChange({
              excludedFromRecap: e.target.value === "" ? undefined : e.target.value === "excluded",
            })
          }
        >
          <option value="">All rows</option>
          <option value="counted">Counted only</option>
          <option value="excluded">Excluded only</option>
        </Select>
      </label>

      {/*
       * **Transfers** — three-way for the same reason *Recap* is: "money I moved
       * between my own accounts" and "everything that isn't that" are both views
       * the user asks for, so neither can be the absence of the control. This is
       * what the recap's *Internal transfers* line opens.
       */}
      <label className="flex items-center gap-2 text-sm text-gousse-muted">
        Transfers
        <Select
          aria-label="Filter by transfer"
          value={value.isTransferLeg == null ? "" : value.isTransferLeg ? "transfers" : "other"}
          onChange={(e) =>
            onChange({
              isTransferLeg: e.target.value === "" ? undefined : e.target.value === "transfers",
            })
          }
        >
          <option value="">All rows</option>
          <option value="transfers">Transfers only</option>
          <option value="other">Exclude transfers</option>
        </Select>
      </label>

      {/*
       * **Grouped** — a toggle, not a tri-state: "show me my bundles" is a view,
       * but "show me everything that isn't a bundle parent" is not one anyone
       * asks for. Each row it returns expands in place to the transactions it
       * stands for, so the filter answers *which* groups exist and *what* is in
       * them with one control.
       */}
      <GroupedToggle
        pressed={value.kind === "bundle"}
        onPressedChange={(pressed) => onChange({ kind: pressed ? "bundle" : undefined })}
      />

      <UncuratedToggle
        pressed={value.uncurated === true}
        // `undefined` rather than `false` when cleared: the filter is a toggle,
        // so its off state is "no filter" and stays out of the URL.
        onPressedChange={(pressed) => onChange({ uncurated: pressed ? true : undefined })}
      />

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              accountId: undefined,
              importMonth: undefined,
              startDate: undefined,
              endDate: undefined,
              search: undefined,
              uncurated: undefined,
              excludedFromRecap: undefined,
              isTransferLeg: undefined,
              kind: undefined,
            })
          }
        >
          <X size={14} />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

type TransactionsSearchInputProps = {
  /** The applied search term from the URL, or `undefined` when cleared. */
  value: string | undefined;
  /** Emit a (debounced) term change; `undefined` clears the search. */
  onChange: (search: string | undefined) => void;
};

/**
 * The debounced search box. Local `text` state gives an immediate, responsive
 * field; a trailing-edge timer commits the trimmed term to `onChange` after the
 * user pauses. The applied `value` (from the URL) is mirrored back into `text`
 * whenever it changes externally (Clear button, back/forward), but never mid-typing.
 */
function TransactionsSearchInput({ value, onChange }: TransactionsSearchInputProps) {
  const [text, setText] = useState(value ?? "");
  // Keep the latest `onChange` without making it a debounce dependency.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Reflect external changes to the applied term (Clear, history nav) into the
  // field. `value ?? ""` compared to `text` avoids clobbering in-flight typing.
  const applied = value ?? "";
  // Sync only on the applied value; `text` is deliberately not a dependency, so
  // typing is not overwritten by the effect that mirrors the prop in.
  useEffect(() => {
    setText(applied);
  }, [applied]);

  // Debounce committing the trimmed term. A no-op when it already matches the
  // applied value, so mirroring `value` in doesn't echo back out.
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === applied) return;
    const id = setTimeout(() => {
      onChangeRef.current(trimmed === "" ? undefined : trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text, applied]);

  return (
    <div className="relative flex items-center">
      <Search size={14} className="pointer-events-none absolute left-3 text-gousse-muted" />
      <input
        type="search"
        aria-label="Search transactions"
        placeholder="Search transactions…"
        // The leading icon moves in with the field's own inset (issue #97):
        // a pill's ends curve away, so an adornment left where a square
        // field put it reads as hanging off the edge.
        className={cn(inputClass, "w-56 pl-8")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
