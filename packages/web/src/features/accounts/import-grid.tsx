import type { Account, AccountId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Select } from "@/components/ui/select";
import { accountQueries } from "@/lib/sdk";
import { type CellState, MonthCell } from "./month-cell";
import {
	availableYears,
	isMonthImportable,
	monthKey,
	monthsOfYear,
} from "./month-grid";
import { importedKey, useImportedMonths } from "./use-imported-months";

/** Short month-column headers, January → December. */
const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

/** The `YYYY-MM` and year for a given instant (defaults to now). */
function nowMonth(now: Date): { month: string; year: number } {
	return {
		month: monthKey(now.getFullYear(), now.getMonth() + 1),
		year: now.getFullYear(),
	};
}

/**
 * The accounts import grid (issue #36): accounts down the side, the twelve
 * months of a chosen year across the top. Each cell is a dropzone whose state
 * reflects the calendar and existing data — a past month is available (or marked
 * imported), the current and future months are inert. A year selector switches
 * which year's grid is shown. Dropping a statement on a cell (or clicking it)
 * hands off to the import wizard pre-filled with that account.
 */
export function ImportGrid({
	now = new Date(),
}: {
	/** The reference instant for "past vs current vs future" — injectable in tests. */
	now?: Date;
}) {
	const { month: currentMonth, year: currentYear } = nowMonth(now);
	const accountsQuery = useQuery(accountQueries.list());
	const imported = useImportedMonths();

	const [year, setYear] = useState(currentYear);

	const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];
	const years = useMemo(
		() => availableYears(imported.months, currentYear),
		[imported.months, currentYear],
	);
	const months = useMemo(() => monthsOfYear(year), [year]);

	if (accounts.length === 0) return null;

	const cellState = (accountId: AccountId, month: string): CellState => {
		if (!isMonthImportable(month, currentMonth)) return "disabled";
		return imported.pairs.has(importedKey(accountId, month))
			? "imported"
			: "available";
	};

	return (
		<section className="flex flex-col gap-4">
			<header className="flex items-center justify-between gap-3">
				<div>
					<h2 className="text-balance text-lg font-semibold text-gousse-ink">
						Import statements
					</h2>
					<p className="mt-0.5 text-sm text-gousse-muted">
						Drop a CSV on a month to import it. Committed months show as
						imported; the current and future months aren't ready yet.
					</p>
				</div>
				<label className="flex items-center gap-2 text-sm text-gousse-muted">
					Year
					<Select
						value={year}
						onChange={(event) => setYear(Number(event.target.value))}
						aria-label="Grid year"
					>
						{years.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</Select>
				</label>
			</header>

			{imported.isError ? (
				<p role="alert" className="text-sm text-gousse-high">
					Couldn't load your import history — imported months may not be marked.
				</p>
			) : null}

			<div className="overflow-x-auto">
				<div className="min-w-[720px]">
					<div className="grid grid-cols-[10rem_repeat(12,1fr)] gap-1">
						<div />
						{MONTH_LABELS.map((label) => (
							<div
								key={label}
								className="pb-1 text-center text-xs font-medium text-gousse-muted"
							>
								{label}
							</div>
						))}

						{accounts.map((account) => (
							<AccountRowCells
								key={account.id}
								account={account}
								months={months}
								cellState={cellState}
							/>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}

/** One account's row: its name label followed by twelve month cells. */
function AccountRowCells({
	account,
	months,
	cellState,
}: {
	account: Account;
	months: readonly string[];
	cellState: (accountId: AccountId, month: string) => CellState;
}) {
	return (
		<>
			<div className="flex items-center truncate pr-2 text-sm font-medium text-gousse-ink">
				{account.name}
			</div>
			{months.map((month, index) => (
				<MonthCell
					key={month}
					accountId={account.id}
					month={month}
					monthLabel={MONTH_LABELS[index]}
					state={cellState(account.id, month)}
				/>
			))}
		</>
	);
}
