import type { Account } from "@mamen/shared/contract";
import { ArrowLeftRight, ChartPie, CircleAlert, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountFilterPicker } from "./account-filter-picker";
import { FilterIconMenu } from "./filter-icon-menu";
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

/**
 * *Recap* — a real three-way filter; see the tri-state note below. `all` leads
 * because {@link FilterIconMenu} treats the first option as the resting, "no
 * filter" state — the one that leaves the button untinted.
 */
const RECAP_OPTIONS = [
  { value: "all", label: "All" },
  { value: "counted", label: "Counted" },
  { value: "excluded", label: "Excluded" },
] as const;

/** *Transfers* — three-way for the same reason *Recap* is, `all` first for the same reason. */
const TRANSFER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "only", label: "Only" },
  { value: "exclude", label: "Exclude" },
] as const;

/**
 * The transactions filter bar.
 *
 * Every filter the bar has always had — search, accounts, period, grouped,
 * uncurated, recap, transfers — on **one row**, in a single rail that keeps its
 * shape at any width, rather than eight pills wrapping onto three rows that
 * moved with the window. Three ideas carry that:
 *
 * - **A rail.** Search, accounts and period share one bordered container with
 *   internal dividers instead of drawing three borders around three pills.
 * - **Icons for the four narrow filters.** *Grouped*, *Uncurated*, *Recap* and
 *   *Transfers* are glyphs, tinted when applied (`accent`, or `high` for
 *   *Uncurated* — the colour the table paints on the rows it isolates). The
 *   text came off because the glyph carried the meaning; the name is in the
 *   tooltip and in `aria-label`, one hover or one screen-reader stop away.
 * - **Toggle or menu, by arity.** The two-state filters apply on click
 *   ({@link FilterIconToggle}); the three-state ones open their choices
 *   ({@link FilterIconMenu}), because three states cannot be cycled with one
 *   button in a way a user can predict.
 *
 * *Recap* and *Transfers* were segmented controls on a second row, each under
 * the word naming it. That row cost the bar its whole height again to
 * permanently show every option of the two filters that are least often
 * touched, while the other two sat in the rail as bare glyphs — two shapes for
 * one kind of thing. Collapsing them into the rail costs a click to *see* the
 * three states and returns the row.
 *
 * The controls that take a value label themselves with **the value** rather
 * than their name — "2 accounts", "March 2026" — so the bar says whether the
 * list is narrowed, which a row of "All …" pills could not.
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
    // One rail, one row. It wraps rather than scrolls at a width that cannot
    // hold it, so no control is ever off-screen with nothing to say it is.
    <div className="flex w-full flex-wrap items-center gap-2 rounded-full border border-gousse-line bg-gousse-panel px-2.5 py-1.5 shadow-gousse-sm">
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
        icon={Package}
        label="Grouped only"
        pressed={value.kind === "bundle"}
        onPressedChange={(pressed) => onChange({ kind: pressed ? "bundle" : undefined })}
      />

      <FilterIconToggle
        icon={CircleAlert}
        label="Uncurated only"
        tone="high"
        pressed={value.uncurated === true}
        // `undefined` rather than `false` when cleared: the filter is a
        // toggle, so its off state is "no filter" and stays out of the URL.
        onPressedChange={(pressed) => onChange({ uncurated: pressed ? true : undefined })}
      />

      {/*
       * **Excluded from recap** (issue #67) — three-way rather than a toggle
       * like *Uncurated only*: both halves are views the user asks for ("what
       * have I held out of my totals?" and "what actually counts?"), so
       * neither can be the mere absence of the control. A menu is what lets
       * it keep the rail's icon shape while still offering three states.
       */}
      <FilterIconMenu
        icon={ChartPie}
        label="Recap"
        options={RECAP_OPTIONS}
        value={recap}
        onChange={(next) =>
          onChange({ excludedFromRecap: next === "all" ? undefined : next === "excluded" })
        }
      />

      {/*
       * **Transfers** — three-way for the same reason *Recap* is: "money I
       * moved between my own accounts" and "everything that isn't that" are
       * both views the user asks for. This is what the recap's *Internal
       * transfers* line opens.
       */}
      <FilterIconMenu
        icon={ArrowLeftRight}
        label="Transfers"
        options={TRANSFER_OPTIONS}
        value={transfers}
        onChange={(next) =>
          onChange({ isTransferLeg: next === "all" ? undefined : next === "only" })
        }
      />

      {actions}

      {/*
       * **Clear** — in the rail now that there is no second row to hold it,
       * and only when there is something to clear: a permanently visible
       * Clear reads as a control rather than as the state it actually is.
       * `ml-auto` pushes it to the far end, away from the filters it undoes,
       * so it cannot be hit while reaching for one of them.
       */}
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
  );
}

/** A hairline between two groups inside the rail. */
function Divider() {
  return <span aria-hidden className="h-6 w-px shrink-0 bg-gousse-line" />;
}
