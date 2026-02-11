import { Filter, Search, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Account } from "@/types";
import type { useTransactionFilters } from "../../hooks/useTransactionFilters";
import { AccountFilter } from "./AccountFilter";
import { AmountFilter } from "./AmountFilter";
import { CategoryFilter } from "./CategoryFilter";
import { DateFilter } from "./DateFilter";

type FilterToolbarProps = {
	filters: ReturnType<typeof useTransactionFilters>;
	accounts: Account[];
	totalCount: number;
	filteredCount: number;
};

export function FilterToolbar({
	filters,
	accounts,
	totalCount,
	filteredCount,
}: FilterToolbarProps) {
	const [expanded, setExpanded] = useState(false);

	const isOpen = expanded || filters.hasActiveFilters;

	return (
		<div className="border-b">
			<div className="flex items-center gap-2 px-4 py-1.5">
				<Button
					variant={isOpen ? "default" : "ghost"}
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={() => setExpanded((prev) => !prev)}
				>
					<Filter className="h-3.5 w-3.5" />
					Filters
					{filters.activeFilterCount > 0 && (
						<Badge
							variant="secondary"
							className="ml-0.5 h-4 min-w-4 px-1 text-[10px] leading-none"
						>
							{filters.activeFilterCount}
						</Badge>
					)}
				</Button>

				{filters.hasActiveFilters && (
					<>
						<span className="text-xs text-muted-foreground">
							Showing {filteredCount} of {totalCount}
						</span>
						<button
							type="button"
							onClick={filters.clearAllFilters}
							className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							Clear all
						</button>
					</>
				)}
			</div>

			{isOpen && (
				<div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/20">
					<div className="relative flex-shrink-0 w-48">
						<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
						<Input
							placeholder="Search description..."
							value={filters.filterValues.description ?? ""}
							onChange={(e) =>
								filters.setDescription(e.target.value || undefined)
							}
							className="h-8 pl-7 text-xs"
						/>
						{filters.filterValues.description && (
							<button
								type="button"
								onClick={() => filters.setDescription(undefined)}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							>
								<X className="h-3 w-3" />
							</button>
						)}
					</div>

					<AmountFilter
						filterValues={filters.filterValues}
						onAmountRange={filters.setAmountRange}
						onAmountPrecise={filters.setAmountPrecise}
						onClear={() => filters.clearFilter("amount")}
					/>

					<CategoryFilter
						filterValues={filters.filterValues}
						onCategory={filters.setCategory}
						onClear={() => filters.clearFilter("category")}
					/>

					<DateFilter
						filterValues={filters.filterValues}
						onDateExact={filters.setDateExact}
						onDateRange={filters.setDateRange}
						onMonthYear={filters.setMonthYear}
						onClear={() => filters.clearFilter("date")}
					/>

					<AccountFilter
						filterValues={filters.filterValues}
						accounts={accounts}
						onAccountIds={filters.setAccountIds}
						onClear={() => filters.clearFilter("account")}
					/>
				</div>
			)}
		</div>
	);
}
