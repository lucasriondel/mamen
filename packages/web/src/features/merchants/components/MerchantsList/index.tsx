import { useNavigate } from "@tanstack/react-router";
import { ArrowUpDown, Search, Store, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import {
	type MerchantSortField,
	type MerchantSortOrder,
	useMerchantsList,
} from "../../hooks/useMerchantsList";
import { isNewMerchant } from "../../utils/isNewMerchant";
import { MerchantListItem } from "../MerchantListItem";

const sortOptions: { value: MerchantSortField; label: string }[] = [
	{ value: "totalSpent", label: "Total Spent" },
	{ value: "name", label: "Name" },
	{ value: "transactionCount", label: "Transactions" },
	{ value: "lastSeen", label: "Last Seen" },
];

export function MerchantsList(): React.ReactElement {
	const navigate = useNavigate();
	const [searchQuery, setSearchQuery] = useState("");
	const [sortField, setSortField] = useState<MerchantSortField>("totalSpent");
	const [sortOrder, setSortOrder] = useState<MerchantSortOrder>("desc");
	const [showNewOnly, setShowNewOnly] = useState(false);

	const containerRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

	const { merchants: allMerchants, totalCount } = useMerchantsList({
		sortField,
		sortOrder,
		searchQuery: searchQuery || undefined,
	});

	const merchants = useMemo(() => {
		if (!showNewOnly) return allMerchants;
		return allMerchants.filter((m) => isNewMerchant(m.createdAt));
	}, [allMerchants, showNewOnly]);

	const handleSelect = useCallback(
		(index: number) => {
			const merchant = merchants[index];
			if (merchant) {
				navigate({
					to: "/merchants/$merchantId",
					params: { merchantId: String(merchant.id) },
				});
			}
		},
		[merchants, navigate],
	);

	const { focusedIndex } = useKeyboardNavigation({
		itemCount: merchants.length,
		onSelect: handleSelect,
		containerRef,
		enabled: true,
	});

	useEffect(() => {
		if (focusedIndex !== null) {
			const el = itemRefs.current.get(focusedIndex);
			el?.scrollIntoView({ block: "nearest" });
		}
	}, [focusedIndex]);

	const handleSortFieldChange = (value: string) => {
		const newField = value as MerchantSortField;
		if (newField === sortField) {
			setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortField(newField);
			setSortOrder(newField === "name" ? "asc" : "desc");
		}
	};

	const toggleSortOrder = () => {
		setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
	};

	const filteredCount = merchants.length;
	const isFiltered = searchQuery.length > 0 || showNewOnly;
	const countLabel = isFiltered
		? `${filteredCount} of ${totalCount} merchants${showNewOnly ? " (new only)" : ""}`
		: `${totalCount} merchant${totalCount !== 1 ? "s" : ""}`;

	// Empty state: no merchants at all
	if (totalCount === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 text-center p-6">
				<Store className="h-12 w-12 text-muted-foreground" />
				<div>
					<h3 className="text-lg font-semibold">No merchants yet</h3>
					<p className="text-sm text-muted-foreground mt-1 max-w-md">
						Merchants are created when you assign transactions using the R key.
						Import statements and start categorizing to see merchants here.
					</p>
				</div>
				<Button
					onClick={() => navigate({ to: "/transactions" })}
					variant="default"
				>
					View Transactions
				</Button>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			tabIndex={-1}
			className="flex flex-col h-full outline-none"
		>
			{/* Toolbar: search + sort + count */}
			<div className="flex items-center gap-3 px-4 py-3 border-b">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Filter merchants..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-8 pr-8 h-9"
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={() => setSearchQuery("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							aria-label="Clear search"
						>
							<X className="h-4 w-4" />
						</button>
					)}
				</div>

				<Select value={sortField} onValueChange={handleSortFieldChange}>
					<SelectTrigger className="w-[160px] h-9">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{sortOptions.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Button
					variant="ghost"
					size="icon"
					className="h-9 w-9"
					onClick={toggleSortOrder}
					aria-label={`Sort ${sortOrder === "asc" ? "descending" : "ascending"}`}
				>
					<ArrowUpDown className="h-4 w-4" />
				</Button>

				<Button
					variant={showNewOnly ? "default" : "outline"}
					size="sm"
					className="h-9 text-xs"
					onClick={() => setShowNewOnly((prev) => !prev)}
					aria-pressed={showNewOnly}
				>
					New only
				</Button>

				<span className="text-xs text-muted-foreground whitespace-nowrap">
					{countLabel}
				</span>
			</div>

			{/* Merchant list */}
			<div className="flex-1 overflow-auto">
				{merchants.length === 0 && isFiltered ? (
					<div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
						<p className="text-sm text-muted-foreground">
							{showNewOnly && !searchQuery
								? "No new merchants"
								: `No merchants matching "${searchQuery}"${showNewOnly ? " (new only)" : ""}`}
						</p>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setSearchQuery("");
								setShowNewOnly(false);
							}}
						>
							Clear filters
						</Button>
					</div>
				) : (
					merchants.map((merchant, index) => (
						<MerchantListItem
							key={merchant.id}
							ref={(el) => {
								if (el) {
									itemRefs.current.set(index, el);
								} else {
									itemRefs.current.delete(index);
								}
							}}
							merchant={merchant}
							isFocused={focusedIndex === index}
							onClick={() => handleSelect(index)}
						/>
					))
				)}
			</div>
		</div>
	);
}
