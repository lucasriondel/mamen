import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { monthKeyOf, type Period, type PeriodKind } from "./period";

const inputClass = cn(
	"h-9 rounded-md border border-gousse-line bg-gousse-panel px-2 text-sm text-gousse-ink",
	"focus:outline-none focus:ring-2 focus:ring-gousse-accent",
);

const KINDS: ReadonlyArray<{ kind: PeriodKind; label: string }> = [
	{ kind: "month", label: "Month" },
	{ kind: "year", label: "Year" },
	{ kind: "all", label: "All time" },
];

export interface PeriodSelectorProps {
	/** The resolved period (kind + its month/year). */
	period: Period;
	/** The `YYYY-MM` months present in the data, for the month dropdown. */
	months: readonly string[];
	/** The `YYYY` years present in the data, for the year dropdown. */
	years: readonly string[];
	/** Emit a new period; the caller writes it to the URL. */
	onChange: (period: Period) => void;
}

/**
 * The recap period selector (issue #35): a segmented month/year/all toggle, plus
 * a specific month or year dropdown when that kind is active. Switching kind
 * lands on the most recent available month/year so the view always has data to
 * show; "All time" needs no second control.
 *
 * Presentational — it reads `period` and emits changes through `onChange`; the
 * route turns those into typed URL search params.
 */
export function PeriodSelector({
	period,
	months,
	years,
	onChange,
}: PeriodSelectorProps) {
	const selectKind = (kind: PeriodKind) => {
		if (kind === period.kind) return;
		if (kind === "all") return onChange({ kind: "all" });
		if (kind === "month") {
			return onChange({
				kind: "month",
				month: months[0] ?? monthKeyOf(new Date()),
			});
		}
		return onChange({
			kind: "year",
			year: years[0] ?? String(new Date().getFullYear()),
		});
	};

	return (
		<div className="flex flex-wrap items-center gap-3">
			<div
				role="toolbar"
				aria-label="Recap period"
				className="inline-flex items-center gap-1 rounded-lg border border-gousse-line bg-gousse-panel p-1"
			>
				{KINDS.map(({ kind, label }) => (
					<button
						key={kind}
						type="button"
						aria-pressed={period.kind === kind}
						onClick={() => selectKind(kind)}
						className={cn(
							"rounded-md px-3 py-1.5 text-sm font-medium transition-colors transition-transform active:scale-[0.97]",
							period.kind === kind
								? "bg-gousse-accent/10 text-gousse-accent"
								: "text-gousse-muted hover:text-gousse-ink",
						)}
					>
						{label}
					</button>
				))}
			</div>

			{period.kind === "month" ? (
				<select
					aria-label="Select month"
					className={inputClass}
					value={period.month}
					onChange={(e) => onChange({ kind: "month", month: e.target.value })}
				>
					{months.map((month) => (
						<option key={month} value={month}>
							{formatMonth(month)}
						</option>
					))}
				</select>
			) : null}

			{period.kind === "year" ? (
				<select
					aria-label="Select year"
					className={inputClass}
					value={period.year}
					onChange={(e) => onChange({ kind: "year", year: e.target.value })}
				>
					{years.map((year) => (
						<option key={year} value={year}>
							{year}
						</option>
					))}
				</select>
			) : null}
		</div>
	);
}
