import type { Account } from "@mamen/shared/contract";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { UncuratedToggle } from "./uncurated-toggle";

/** The subset of filter state the controls read/write. */
export interface TransactionFilterValues {
	accountId?: number;
	importMonth?: string;
	search?: string;
	/** Narrow to rows with no issuer, no derived category and no note. */
	uncurated?: boolean;
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
	"h-9 rounded-md border border-gousse-line bg-gousse-panel px-2 text-sm text-gousse-ink",
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
	const hasFilters =
		value.accountId != null ||
		value.importMonth != null ||
		value.search != null ||
		value.uncurated === true;

	return (
		<div className="flex flex-wrap items-center gap-3">
			<TransactionsSearchInput
				value={value.search}
				onChange={(search) => onChange({ search })}
			/>

			<label className="flex items-center gap-2 text-sm text-gousse-muted">
				Account
				<select
					aria-label="Filter by account"
					className={inputClass}
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

			<label className="flex items-center gap-2 text-sm text-gousse-muted">
				Month
				<select
					aria-label="Filter by month"
					className={inputClass}
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

			<UncuratedToggle
				pressed={value.uncurated === true}
				// `undefined` rather than `false` when cleared: the filter is a toggle,
				// so its off state is "no filter" and stays out of the URL.
				onPressedChange={(pressed) =>
					onChange({ uncurated: pressed ? true : undefined })
				}
			/>

			{hasFilters ? (
				<Button
					variant="ghost"
					size="sm"
					onClick={() =>
						onChange({
							accountId: undefined,
							importMonth: undefined,
							search: undefined,
							uncurated: undefined,
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
function TransactionsSearchInput({
	value,
	onChange,
}: TransactionsSearchInputProps) {
	const [text, setText] = useState(value ?? "");
	// Keep the latest `onChange` without making it a debounce dependency.
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	// Reflect external changes to the applied term (Clear, history nav) into the
	// field. `value ?? ""` compared to `text` avoids clobbering in-flight typing.
	const applied = value ?? "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: sync only on the
	// applied value; `text` is intentionally excluded so typing isn't overwritten.
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
			<Search
				size={14}
				className="pointer-events-none absolute left-2 text-gousse-muted"
			/>
			<input
				type="search"
				aria-label="Search transactions"
				placeholder="Search transactions…"
				className={cn(inputClass, "w-56 pl-7")}
				value={text}
				onChange={(e) => setText(e.target.value)}
			/>
		</div>
	);
}
