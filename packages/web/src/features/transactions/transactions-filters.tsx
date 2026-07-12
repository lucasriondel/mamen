import type { Account } from "@mamen/shared/contract";
import { X } from "lucide-react";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The subset of filter state the controls read/write. */
export interface TransactionFilterValues {
	accountId?: number;
	importMonth?: string;
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

const selectClass = cn(
	"h-9 rounded-md border border-line bg-panel px-2 text-sm text-ink",
	"focus:outline-none focus:ring-2 focus:ring-accent",
);

/**
 * The account + month filter bar. Two native `<select>`s (AND-composed) plus a
 * "Clear" affordance shown only when a filter is active. Presentational: it
 * reads `value` and emits changes through `onChange`; the route turns those into
 * typed URL search params.
 */
export function TransactionsFilters({
	accounts,
	months,
	value,
	onChange,
}: TransactionsFiltersProps) {
	const hasFilters = value.accountId != null || value.importMonth != null;

	return (
		<div className="flex flex-wrap items-center gap-3">
			<label className="flex items-center gap-2 text-sm text-muted">
				Account
				<select
					aria-label="Filter by account"
					className={selectClass}
					value={value.accountId ?? ""}
					onChange={(e) =>
						onChange({
							accountId:
								e.target.value === "" ? undefined : Number(e.target.value),
						})
					}
				>
					<option value="">All accounts</option>
					{accounts.map((account) => (
						<option key={account.id} value={account.id}>
							{account.name}
						</option>
					))}
				</select>
			</label>

			<label className="flex items-center gap-2 text-sm text-muted">
				Month
				<select
					aria-label="Filter by month"
					className={selectClass}
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
				</select>
			</label>

			{hasFilters ? (
				<button
					type="button"
					onClick={() =>
						onChange({ accountId: undefined, importMonth: undefined })
					}
					className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-panel hover:text-ink"
				>
					<X size={14} />
					Clear
				</button>
			) : null}
		</div>
	);
}
