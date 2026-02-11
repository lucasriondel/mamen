import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import type { Subscription, SubscriptionFrequency } from "@/types";
import { SubscriptionDetail } from "../SubscriptionDetail";
import { SubscriptionRow } from "../SubscriptionRow";

type SortField =
	| "amount-desc"
	| "amount-asc"
	| "name"
	| "lastCharge"
	| "frequency";
type FrequencyFilter = "all" | SubscriptionFrequency;
type StatusFilter = "all" | "active" | "possibly-cancelled";

type SubscriptionsListProps = {
	subscriptions: Subscription[];
};

const sortOptions: { value: SortField; label: string }[] = [
	{ value: "amount-desc", label: "Amount (highest)" },
	{ value: "amount-asc", label: "Amount (lowest)" },
	{ value: "name", label: "Merchant name (A-Z)" },
	{ value: "lastCharge", label: "Last charge (recent)" },
	{ value: "frequency", label: "Frequency" },
];

const frequencyOrder: Record<SubscriptionFrequency, number> = {
	weekly: 0,
	monthly: 1,
	yearly: 2,
};

const sortSubscriptions = (
	subs: Subscription[],
	field: SortField,
): Subscription[] => {
	const sorted = [...subs];
	switch (field) {
		case "amount-desc":
			return sorted.sort(
				(a, b) => Math.abs(b.typicalAmount) - Math.abs(a.typicalAmount),
			);
		case "amount-asc":
			return sorted.sort(
				(a, b) => Math.abs(a.typicalAmount) - Math.abs(b.typicalAmount),
			);
		case "name":
			return sorted.sort((a, b) =>
				a.merchantName.localeCompare(b.merchantName),
			);
		case "lastCharge":
			return sorted.sort((a, b) =>
				b.lastChargeDate.localeCompare(a.lastChargeDate),
			);
		case "frequency":
			return sorted.sort(
				(a, b) => frequencyOrder[a.frequency] - frequencyOrder[b.frequency],
			);
	}
};

export function SubscriptionsList({
	subscriptions,
}: SubscriptionsListProps): React.ReactElement {
	const [sortField, setSortField] = useState<SortField>("amount-desc");
	const [frequencyFilter, setFrequencyFilter] =
		useState<FrequencyFilter>("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [expandedId, setExpandedId] = useState<number | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

	const filtered = useMemo(() => {
		let result = subscriptions;
		if (frequencyFilter !== "all") {
			result = result.filter((s) => s.frequency === frequencyFilter);
		}
		if (statusFilter !== "all") {
			result = result.filter((s) => s.status === statusFilter);
		}
		return sortSubscriptions(result, sortField);
	}, [subscriptions, sortField, frequencyFilter, statusFilter]);

	const handleSelect = useCallback(
		(index: number) => {
			const sub = filtered[index];
			if (sub?.id !== undefined) {
				setExpandedId((prev) => (prev === sub.id ? null : sub.id!));
			}
		},
		[filtered],
	);

	const { focusedIndex } = useKeyboardNavigation({
		itemCount: filtered.length,
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

	if (filtered.length === 0) {
		return (
			<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
				No subscriptions match filters
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			tabIndex={-1}
			className="flex flex-col flex-1 outline-none"
		>
			<div className="flex items-center gap-3 px-4 py-3 border-b">
				<Select
					value={sortField}
					onValueChange={(v) => setSortField(v as SortField)}
				>
					<SelectTrigger className="w-[180px] h-9" aria-label="Sort">
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

				<Select
					value={frequencyFilter}
					onValueChange={(v) => setFrequencyFilter(v as FrequencyFilter)}
				>
					<SelectTrigger className="w-[140px] h-9" aria-label="Frequency">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All frequencies</SelectItem>
						<SelectItem value="monthly">Monthly</SelectItem>
						<SelectItem value="yearly">Yearly</SelectItem>
						<SelectItem value="weekly">Weekly</SelectItem>
					</SelectContent>
				</Select>

				<Select
					value={statusFilter}
					onValueChange={(v) => setStatusFilter(v as StatusFilter)}
				>
					<SelectTrigger className="w-[160px] h-9" aria-label="Status">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						<SelectItem value="active">Active only</SelectItem>
						<SelectItem value="possibly-cancelled">
							Possibly cancelled
						</SelectItem>
					</SelectContent>
				</Select>

				<span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
					{filtered.length} subscription{filtered.length !== 1 ? "s" : ""}
				</span>
			</div>

			<div className="flex-1 overflow-auto">
				{filtered.map((sub, index) => (
					<div key={sub.id}>
						<SubscriptionRow
							ref={(el) => {
								if (el) {
									itemRefs.current.set(index, el);
								} else {
									itemRefs.current.delete(index);
								}
							}}
							subscription={sub}
							isFocused={focusedIndex === index}
							isExpanded={expandedId === sub.id}
							onClick={() => handleSelect(index)}
						/>
						{expandedId === sub.id && <SubscriptionDetail subscription={sub} />}
					</div>
				))}
			</div>
		</div>
	);
}
