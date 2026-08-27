import type { Account } from "@mamen/shared/contract";
import { Layers, ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { AccountFilterPicker } from "./account-filter-picker";
import { FilterIconToggle } from "./filter-icon-toggle";
import { PeriodPicker } from "./period-picker";
import { TransactionsSearchInput } from "./transactions-search-input";

/** The subset of filter state the controls read/write. */
export interface TransactionFilterValues {
  /** The selected accounts; empty or absent means all of them. */
  accountId?: number[];
  importMonth?: string;
  /**
   * ISO date bounds. Set by a link from the recap **and**, since the period
   * picker, by a control here — the *Date range* tab and *This year* write them.
   */
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
  /** Distinct `YYYY-MM` months present in the data, for the period picker. */
  months: readonly string[];
  /** The currently-applied filter values (from the URL). */
  value: TransactionFilterValues;
  /**
   * Apply a filter change. A field set to `undefined` clears that filter; the
   * caller writes the result to the URL search params.
   */
  onChange: (patch: TransactionFilterValues) => void;
  /**
   * The columns menu, rendered at the end of the rail. Passed in rather than
   * built here because only the unscoped view offers one — it belongs to the
   * table's layout, not to the query.
   */
  actions?: React.ReactNode;
}

/** *Recap* — a real three-way filter; see the tri-state note below. */
const RECAP_OPTIONS = [
  { value: "all", label: "All" },
  { value: "counted", label: "Counted" },
  { value: "excluded", label: "Excluded" },
] as const;

/** *Transfers* — three-way for the same reason *Recap* is. */
const TRANSFER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "only", label: "Only" },
  { value: "exclude", label: "Exclude" },
] as const;

/**
 * The transactions filter bar.
 *
 * Every filter the bar has always had — search, accounts, period, recap,
 * transfers, grouped, uncurated — in two rows that keep their shape at any
 * width, rather than eight pills wrapping onto three rows that moved with the
 * window. Three changes carry that:
 *
 * - **A rail.** Search, accounts and period share one bordered container with
 *   internal dividers instead of drawing three borders around three pills.
 * - **Segmented tri-states.** *Recap* and *Transfers* were `<select>`s, which
 *   show only the chosen option: "All rows" and "Excluded only" looked
 *   identical until read. All three states are visible now and the one in force
 *   is lit.
 * - **Icon toggles.** *Grouped* and *Uncurated* keep their glyphs and their
 *   tints (`accent` and `high`, the colour the table paints the rows each one
 *   isolates) and drop their text, which the icon was already carrying.
 *
 * Each control also labels itself with its **value** rather than its name — "2
 * accounts", "March 2026" — so the bar says whether the list is narrowed, which
 * a row of "All …" pills could not.
 */
export function TransactionsFilters({
  accounts,
  months,
  value,
  onChange,
  actions,
}: TransactionsFiltersProps) {
  // The date bounds count as an active filter, and now have a control that
  // shows them: the period picker reads them back out of the URL, so a recap
  // link's period is visible in the bar rather than only clearable from it.
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

  const recap =
    value.excludedFromRecap == null ? "all" : value.excludedFromRecap ? "excluded" : "counted";
  const transfers = value.isTransferLeg == null ? "all" : value.isTransferLeg ? "only" : "exclude";

  return (
    <div className="flex w-full flex-col gap-3">
      {/* The rail — one border around the three controls that take a value. */}
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-gousse-line bg-gousse-panel px-2.5 py-1.5 shadow-gousse-sm">
        <TransactionsSearchInput value={value.search} onChange={(search) => onChange({ search })} />

        <Divider />

        {/*
         * Multi-select, and colour-coded: the recap's summary lines link here
         * carrying a multi-account selection, so this bar has to be able to show
         * one. An empty selection is the absent filter (all accounts).
         */}
        <AccountFilterPicker
          accounts={accounts}
          selected={value.accountId ?? []}
          onChange={(ids) => onChange({ accountId: ids.length > 0 ? ids : undefined })}
        />

        <Divider />

        {/*
         * One control for every way of naming a span of time — the month this
         * bar could always filter by, plus the `startDate`/`endDate` bounds it
         * could apply from a link but never show.
         */}
        <PeriodPicker
          months={months}
          value={{
            importMonth: value.importMonth,
            startDate: value.startDate,
            endDate: value.endDate,
          }}
          onChange={(fields) => onChange(fields)}
        />

        <Divider />

        {/*
         * **Grouped** — a toggle, not a tri-state: "show me my bundles" is a
         * view, but "show me everything that isn't a bundle parent" is not one
         * anyone asks for. Each row it returns expands in place to the
         * transactions it stands for.
         */}
        <FilterIconToggle
          icon={Layers}
          label="Grouped only"
          pressed={value.kind === "bundle"}
          onPressedChange={(pressed) => onChange({ kind: pressed ? "bundle" : undefined })}
        />

        <FilterIconToggle
          icon={ListChecks}
          label="Uncurated only"
          tone="high"
          pressed={value.uncurated === true}
          // `undefined` rather than `false` when cleared: the filter is a
          // toggle, so its off state is "no filter" and stays out of the URL.
          onPressedChange={(pressed) => onChange({ uncurated: pressed ? true : undefined })}
        />

        {actions}
      </div>

      {/* The two tri-states, and Clear. Below the rail because they are read
          less often than they are glanced at — and because a segmented control
          is wide enough that squeezing both into the rail would reintroduce the
          wrapping this layout exists to end. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
        <LabelledFilter label="Recap">
          {/*
           * **Excluded from recap** (issue #67) — three-way rather than a
           * toggle like *Uncurated only*: both halves are views the user asks
           * for ("what have I held out of my totals?" and "what actually
           * counts?"), so neither can be the mere absence of the control.
           */}
          <Segmented
            label="Filter by recap exclusion"
            options={RECAP_OPTIONS}
            value={recap}
            onChange={(next) =>
              onChange({
                excludedFromRecap: next === "all" ? undefined : next === "excluded",
              })
            }
          />
        </LabelledFilter>

        <LabelledFilter label="Transfers">
          {/*
           * **Transfers** — three-way for the same reason *Recap* is: "money I
           * moved between my own accounts" and "everything that isn't that" are
           * both views the user asks for. This is what the recap's *Internal
           * transfers* line opens.
           */}
          <Segmented
            label="Filter by transfer"
            options={TRANSFER_OPTIONS}
            value={transfers}
            onChange={(next) =>
              onChange({ isTransferLeg: next === "all" ? undefined : next === "only" })
            }
          />
        </LabelledFilter>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
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
    </div>
  );
}

/** A hairline between two groups inside the rail. */
function Divider() {
  return <span aria-hidden className="h-6 w-px shrink-0 bg-gousse-line" />;
}

/** A tri-state and the word naming it, stacked. */
function LabelledFilter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex flex-col gap-1.5">
      <span className="text-[11px] tracking-wider text-gousse-muted uppercase">{label}</span>
      {children}
    </span>
  );
}
