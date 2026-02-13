import { InboxZeroEmpty } from "@/components/InboxZeroEmpty";
import { SelectionStatusBar } from "@/components/SelectionStatusBar";
import { Button } from "@/components/ui/button";
import { useFocusMode } from "@/context/FocusModeContext";
import { useAnomalyDismiss } from "@/features/anomalies/hooks/useAnomalyDismiss";
import { useDuplicateActions } from "@/features/anomalies/hooks/useDuplicateActions";
import { MerchantAssignmentModal } from "@/features/merchants/components/MerchantAssignmentModal";
import { SubscriptionsView } from "@/features/subscriptions/components/SubscriptionsView";
import { useSubscriptions } from "@/features/subscriptions/hooks/useSubscriptions";
import { useCascadeAnimation } from "@/hooks/useCascadeAnimation";
import {
	accountsApi,
	categoriesApi,
	merchantsApi,
	queryKeys,
	transactionsApi,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import type { Transaction } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpDown, ListIcon, X } from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useBatchCategoryAssign } from "../../hooks/useBatchCategoryAssign";
import { useDeleteTransactions } from "../../hooks/useDeleteTransactions";
import { useDrillDownFilter } from "../../hooks/useDrillDownFilter";
import { useFilteredTransactions } from "../../hooks/useFilteredTransactions";
import { useNavigateToTransaction } from "../../hooks/useNavigateToTransaction";
import { useQuickCategoryAssign } from "../../hooks/useQuickCategoryAssign";
import { useRefundLink } from "../../hooks/useRefundLink";
import { useTransactionFilters } from "../../hooks/useTransactionFilters";
import { QuickCategoryPicker } from "../QuickCategoryPicker";
import { RefundLinkModal } from "../RefundLinkModal";
import { FilterToolbar } from "../TransactionFilters";
import { columns, type TransactionTableMeta } from "./columns";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import {
	type ActionKey,
	useTransactionTableKeyboard,
} from "./useTransactionTableKeyboard";

type TransactionDataTableProps = {
	highlightId?: number;
};

export function TransactionDataTable({
	highlightId,
}: TransactionDataTableProps): React.ReactElement {
	const {
		activeFilters,
		currentMonthRange,
		toggleFocusMode,
		anomalyTypeFilter,
	} = useFocusMode();
	const isUnmatchedMode = activeFilters.has("unmatched");
	const isMonthMode = activeFilters.has("month");
	const isSubscriptionsMode = activeFilters.has("subscriptions");
	const isAnomaliesMode = activeFilters.has("anomalies");
	const { subscriptions: allSubscriptions } = useSubscriptions();

	const subscriptionTxIds = useMemo(() => {
		if (!isSubscriptionsMode) return undefined;
		const ids = new Set<number>();
		for (const sub of allSubscriptions) {
			for (const txId of sub.transactionIds) {
				ids.add(txId);
			}
		}
		return ids;
	}, [isSubscriptionsMode, allSubscriptions]);

	const {
		filter: drillDown,
		isActive: isDrillDown,
		clearDrillDownFilter,
		clearAllFilters,
	} = useDrillDownFilter();
	const transactionFilters = useTransactionFilters();
	const { data: accounts = [] } = useQuery({
		queryKey: queryKeys.accounts.all,
		queryFn: () => accountsApi.getAll(),
	});

	const { data: categoryName } = useQuery({
		queryKey: [...queryKeys.categories.all, "drillDown", drillDown.categoryId],
		queryFn: async () => {
			if (drillDown.categoryId == null) return null;
			const cat = await categoriesApi.get(drillDown.categoryId);
			if (!cat) return null;
			if (cat.parentId !== null) {
				const parent = await categoriesApi.get(cat.parentId);
				return parent ? `${parent.name} > ${cat.name}` : cat.name;
			}
			return cat.name;
		},
		enabled: drillDown.categoryId != null,
	});

	const { transactions, isLoading } = useFilteredTransactions({
		unmatchedOnly: isDrillDown ? false : isUnmatchedMode,
		anomaliesOnly: isDrillDown ? false : isAnomaliesMode,
		anomalyTypeFilter: isAnomaliesMode ? anomalyTypeFilter : undefined,
		monthRange: isDrillDown
			? undefined
			: isMonthMode
				? currentMonthRange
				: undefined,
		categoryId: drillDown.categoryId,
		periodRange:
			drillDown.periodStart && drillDown.periodEnd
				? { start: drillDown.periodStart, end: drillDown.periodEnd }
				: undefined,
		subscriptionTransactionIds: subscriptionTxIds,
	});

	const { data: merchantsMap } = useQuery({
		queryKey: [...queryKeys.merchants.all, "infoMap"],
		queryFn: async () => {
			const allMerchants = await merchantsApi.getAll();
			return new Map(
				allMerchants.map((m) => [
					m.id!,
					{
						name: m.name,
						imageUrl: m.imageUrl,
					},
				]),
			);
		},
	});

	const getMerchantInfo = useCallback(
		(merchantId: number | undefined) => {
			if (!merchantId || !merchantsMap) return undefined;
			return merchantsMap.get(merchantId) ?? undefined;
		},
		[merchantsMap],
	);

	const accountsMap = useMemo(
		() => new Map(accounts.map((a) => [a.id!, a.name])),
		[accounts],
	);

	const getAccountName = useCallback(
		(accountId: number) => accountsMap.get(accountId) ?? "Unknown",
		[accountsMap],
	);

	// --- Modal state ---
	const [merchantModalOpen, setMerchantModalOpen] = useState(false);
	const [merchantModalTransaction, setMerchantModalTransaction] =
		useState<Transaction | null>(null);
	const [merchantModalTransactions, setMerchantModalTransactions] = useState<
		Transaction[] | undefined
	>(undefined);
	const [merchantModalPowerMode, setMerchantModalPowerMode] = useState(false);
	const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
	const [categoryPickerTransaction, setCategoryPickerTransaction] =
		useState<Transaction | null>(null);
	const [categoryBatchIds, setCategoryBatchIds] = useState<number[]>([]);
	const [categoryBatchFirstId, setCategoryBatchFirstId] = useState<
		number | null
	>(null);
	const { assignCategory } = useQuickCategoryAssign();
	const { batchAssignCategory } = useBatchCategoryAssign();
	const refundLink = useRefundLink();
	const { handleDismiss: handleDismissAnomaly } = useAnomalyDismiss();
	const { handleDismissDuplicate, handleExcludeDuplicate } =
		useDuplicateActions();
	const { navigateToTransaction } = useNavigateToTransaction();
	const { triggerCascade, animatingIds, animationPhase } =
		useCascadeAnimation();
	const animatingIdSet = useMemo(() => new Set(animatingIds), [animatingIds]);
	const deleteTransactions = useDeleteTransactions();
	const navigate = useNavigate();
	const highlightHandledRef = useRef<number | undefined>(undefined);

	// --- Cursor + hover state ---
	const [cursorRowId, setCursorRowId] = useState<string | null>(null);
	const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

	// --- TanStack Table ---
	const [sorting, setSorting] = useState<SortingState>([]);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	const tableMeta: TransactionTableMeta = useMemo(
		() => ({
			getMerchantInfo,
			getAccountName,
			onDismissAnomaly: handleDismissAnomaly,
			onDismissDuplicate: handleDismissDuplicate,
			onExcludeDuplicate: handleExcludeDuplicate,
			onViewLinked: navigateToTransaction,
			onLinkClick: navigateToTransaction,
			animatingIds: animatingIdSet,
			animationPhase,
		}),
		[
			getMerchantInfo,
			getAccountName,
			handleDismissAnomaly,
			handleDismissDuplicate,
			handleExcludeDuplicate,
			navigateToTransaction,
			animatingIdSet,
			animationPhase,
		],
	);

	const table = useReactTable({
		data: transactions,
		columns,
		state: {
			sorting,
			rowSelection,
			columnFilters: transactionFilters.columnFilters,
		},
		onSortingChange: setSorting,
		onRowSelectionChange: setRowSelection,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getRowId: (row) => String(row.id),
		meta: tableMeta,
	});

	const { rows: tableRows } = table.getRowModel();
	const flatRows = useMemo(() => tableRows.map((r) => r.original), [tableRows]);

	const selectionCount = Object.keys(rowSelection).filter(
		(k) => rowSelection[k],
	).length;

	const anyModalOpen =
		merchantModalOpen ||
		categoryPickerOpen ||
		refundLink.isOpen ||
		deleteTransactions.isDeleteDialogOpen;

	// --- Virtualizer ---
	const parentRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: tableRows.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 48,
		overscan: 5,
	});

	// --- Action handler ---
	const handleAction = useCallback(
		(
			key: ActionKey,
			target:
				| { mode: "batch"; ids: number[] }
				| { mode: "single"; transaction: Transaction },
		) => {
			if (key === "r") {
				if (target.mode === "batch") {
					transactionsApi.bulkGet(target.ids).then((txs) => {
						const validTxs = txs.filter(Boolean) as Transaction[];
						if (validTxs.length > 1) {
							setMerchantModalTransactions(validTxs);
							setMerchantModalTransaction(null);
							setMerchantModalPowerMode(false);
							setMerchantModalOpen(true);
						}
					});
				} else {
					setMerchantModalTransaction(target.transaction);
					setMerchantModalTransactions(undefined);
					setMerchantModalPowerMode(false);
					setMerchantModalOpen(true);
				}
			} else if (key === "c") {
				if (target.mode === "batch") {
					setCategoryBatchIds(target.ids);
					setCategoryBatchFirstId(target.ids[0] ?? null);
					setCategoryPickerTransaction(null);
					setCategoryPickerOpen(true);
				} else {
					setCategoryBatchIds([]);
					setCategoryBatchFirstId(null);
					setCategoryPickerTransaction(target.transaction);
					setCategoryPickerOpen(true);
				}
			} else if (key === "f") {
				if (target.mode === "single") {
					refundLink.openRefundLink(target.transaction);
				}
			} else if (key === "d") {
				if (target.mode === "batch") {
					deleteTransactions.requestDelete(target.ids);
				} else {
					deleteTransactions.requestDelete([target.transaction.id!]);
				}
			}
		},
		[refundLink, deleteTransactions],
	);

	// --- Keyboard ---
	useTransactionTableKeyboard({
		table,
		rows: flatRows,
		cursorRowId,
		setCursorRowId,
		hoveredRowId,
		virtualizer,
		onAction: handleAction,
		enabled: !anyModalOpen,
	});

	// --- Clear drill-down on A key ---
	useEffect(() => {
		if (!isDrillDown) return;
		const handleKeyDown = (e: globalThis.KeyboardEvent): void => {
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			)
				return;
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key.toLowerCase() === "a") {
				clearDrillDownFilter();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isDrillDown, clearDrillDownFilter]);

	// --- Clear selection/cursor/column-filters when focus mode or drill-down changes ---
	const filtersKey = Array.from(activeFilters).sort().join(",");
	const drillDownKey = isDrillDown
		? `${drillDown.categoryId}-${drillDown.periodStart}-${drillDown.periodEnd}`
		: "";
	const combinedKey = `${filtersKey}|${drillDownKey}`;
	const prevFiltersKeyRef = useRef(combinedKey);
	useEffect(() => {
		if (prevFiltersKeyRef.current === combinedKey) return;
		prevFiltersKeyRef.current = combinedKey;
		table.resetRowSelection();
		setCursorRowId(null);
		transactionFilters.clearAllFilters();
	}, [
		combinedKey,
		table,
		transactionFilters.clearAllFilters,
		transactionFilters,
	]);

	// --- Handle highlight from search navigation ---
	useEffect(() => {
		if (
			highlightId === undefined ||
			transactions.length === 0 ||
			highlightHandledRef.current === highlightId
		) {
			return;
		}

		highlightHandledRef.current = highlightId;
		const index = flatRows.findIndex((tx) => tx.id === highlightId);
		if (index === -1) return;

		setCursorRowId(String(highlightId));
		virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });

		const timer = setTimeout(() => {
			setCursorRowId((current) =>
				current === String(highlightId) ? null : current,
			);
			navigate({ to: "/transactions", search: {}, replace: true });
		}, 3000);

		return () => clearTimeout(timer);
	}, [highlightId, transactions, flatRows, virtualizer, navigate]);

	// --- Row click ---
	const handleRowClick = useCallback(
		(rowId: string) => {
			if (selectionCount > 0) {
				const row = table.getRow(rowId);
				row?.toggleSelected();
			}
			setCursorRowId(rowId);
		},
		[selectionCount, table],
	);

	// --- Refund summary for drill-down ---
	const drillDownRefundSummary = useMemo(() => {
		if (!isDrillDown) return null;

		let grossAmount = 0;
		let refundAmount = 0;

		for (const tx of transactions) {
			if (tx.isRefund && tx.linkedRefundId) {
				refundAmount += tx.amount;
			} else if (tx.amount < 0 && !tx.isRefund) {
				grossAmount += Math.abs(tx.amount);
			}
		}

		if (refundAmount === 0) return null;

		return { grossAmount, refundAmount, netAmount: grossAmount - refundAmount };
	}, [isDrillDown, transactions]);

	// --- Early returns ---
	if (isSubscriptionsMode) {
		return <SubscriptionsView />;
	}

	if (isLoading) {
		return <div className="p-4 text-muted-foreground">Loading...</div>;
	}

	if (transactions.length === 0 && isUnmatchedMode) {
		return <InboxZeroEmpty />;
	}

	if (transactions.length === 0 && isMonthMode) {
		const monthLabel = new Intl.DateTimeFormat("en-US", {
			month: "long",
			year: "numeric",
		}).format(currentMonthRange.start);
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
				<div className="text-muted-foreground">
					<ListIcon className="w-12 h-12 mb-4 mx-auto opacity-50" />
					<h3 className="text-lg font-medium">No transactions this month</h3>
					<p className="text-sm mt-2">
						Import a statement to see your spending for {monthLabel}
					</p>
				</div>
				<div className="flex gap-2">
					<Button asChild>
						<Link to="/accounts">Import Statement</Link>
					</Button>
					<Button variant="outline" onClick={() => toggleFocusMode("all")}>
						View All Transactions
					</Button>
				</div>
			</div>
		);
	}

	if (transactions.length === 0 && isDrillDown) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
				<div className="text-muted-foreground">
					<ListIcon className="w-12 h-12 mb-4 mx-auto opacity-50" />
					<h3 className="text-lg font-medium">
						No transactions in {categoryName ?? "this category"} for this period
					</h3>
				</div>
				<Button variant="outline" onClick={clearDrillDownFilter}>
					View All Transactions
				</Button>
			</div>
		);
	}

	if (transactions.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
				<div className="text-muted-foreground">
					<ListIcon className="w-12 h-12 mb-4 mx-auto opacity-50" />
					<h3 className="text-lg font-medium">No transactions yet</h3>
					<p className="text-sm mt-2">
						Import your bank statements to see your transactions here.
					</p>
				</div>
				<Button asChild>
					<Link to="/accounts">Import Statements</Link>
				</Button>
			</div>
		);
	}

	const headerGroups = table.getHeaderGroups();

	return (
		<div className="flex flex-col h-full">
			{isDrillDown && (
				<div
					className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30"
					data-testid="drill-down-filter-bar"
				>
					<span className="text-xs text-muted-foreground">Filtered:</span>
					{categoryName && (
						<button
							type="button"
							onClick={clearDrillDownFilter}
							className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
							data-testid="category-filter-chip"
						>
							{categoryName}
							<X className="h-3 w-3" />
						</button>
					)}
					<button
						type="button"
						onClick={clearAllFilters}
						className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						Clear All (A)
					</button>
					<span className="text-xs text-muted-foreground">
						Showing {transactions.length} transactions
					</span>
				</div>
			)}
			{isDrillDown && drillDownRefundSummary && (
				<div
					className="text-sm text-muted-foreground px-4 py-1.5 border-b"
					data-testid="drill-down-refund-summary"
				>
					<span>
						Gross: {formatCurrency(drillDownRefundSummary.grossAmount)} |
						Refunds: -{formatCurrency(drillDownRefundSummary.refundAmount)} |{" "}
						<strong className="text-foreground">
							Net: {formatCurrency(drillDownRefundSummary.netAmount)}
						</strong>
					</span>
				</div>
			)}

			<FilterToolbar
				filters={transactionFilters}
				accounts={accounts}
				totalCount={transactions.length}
				filteredCount={tableRows.length}
			/>

			{/* Column header */}
			<div className="flex items-center h-10 px-4 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b">
				{headerGroups.map((headerGroup) =>
					headerGroup.headers.map((header) => {
						if (header.id === "select") {
							return (
								<div key={header.id} className="w-8 shrink-0 flex items-center">
									{flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)}
								</div>
							);
						}
						if (header.id === "date") {
							return (
								<div key={header.id} className="w-20 shrink-0">
									{header.column.getCanSort() ? (
										<button
											type="button"
											className="flex items-center gap-1 hover:text-foreground transition-colors"
											onClick={header.column.getToggleSortingHandler()}
										>
											{flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
											<ArrowUpDown className="h-3 w-3" />
										</button>
									) : (
										flexRender(
											header.column.columnDef.header,
											header.getContext(),
										)
									)}
								</div>
							);
						}
						if (header.id === "rawMerchantString") {
							return (
								<div key={header.id} className="flex-1">
									{header.column.getCanSort() ? (
										<button
											type="button"
											className="flex items-center gap-1 hover:text-foreground transition-colors"
											onClick={header.column.getToggleSortingHandler()}
										>
											{flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
											<ArrowUpDown className="h-3 w-3" />
										</button>
									) : (
										flexRender(
											header.column.columnDef.header,
											header.getContext(),
										)
									)}
								</div>
							);
						}
						if (header.id === "category") {
							return (
								<div key={header.id} className="w-32 shrink-0">
									{flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)}
								</div>
							);
						}
						if (header.id === "accountId") {
							return (
								<div key={header.id} className="w-24 shrink-0">
									{flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)}
								</div>
							);
						}
						if (header.id === "amount") {
							return (
								<div key={header.id} className="w-24 shrink-0 text-right">
									{header.column.getCanSort() ? (
										<button
											type="button"
											className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors"
											onClick={header.column.getToggleSortingHandler()}
										>
											{flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
											<ArrowUpDown className="h-3 w-3" />
										</button>
									) : (
										flexRender(
											header.column.columnDef.header,
											header.getContext(),
										)
									)}
								</div>
							);
						}
						return null;
					}),
				)}
			</div>

			{/* Virtualized body */}
			<div
				ref={parentRef}
				tabIndex={0}
				role="listbox"
				aria-multiselectable={selectionCount > 0}
				aria-activedescendant={cursorRowId ? `tx-${cursorRowId}` : undefined}
				className="flex-1 overflow-auto outline-none focus:outline-none"
			>
				<div
					style={{
						height: `${virtualizer.getTotalSize()}px`,
						width: "100%",
						position: "relative",
					}}
				>
					<AnimatePresence initial={false} mode="popLayout">
						{virtualizer.getVirtualItems().map((virtualRow) => {
							const row = tableRows[virtualRow.index];
							const tx = row.original;
							const rowId = String(tx.id);
							const isSelected = row.getIsSelected();
							const isCursor = cursorRowId === rowId;
							const isHighlighted =
								animatingIdSet.has(rowId) &&
								(animationPhase === "highlight" || animationPhase === "settle");

							return (
								<motion.div
									key={rowId}
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{
										duration: 0.2,
										ease: [0.22, 1, 0.36, 1],
									}}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
										height: `${virtualRow.size}px`,
										transform: `translateY(${virtualRow.start}px)`,
									}}
								>
									{/* biome-ignore lint/a11y/useFocusableInteractive: focus managed by parent listbox via aria-activedescendant */}
									{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard navigation handled by parent listbox component */}
									<div
										id={`tx-${rowId}`}
										role="option"
										aria-selected={isSelected}
										onClick={() => handleRowClick(rowId)}
										onMouseEnter={() => setHoveredRowId(rowId)}
										onMouseLeave={() =>
											setHoveredRowId((prev) =>
												prev === rowId ? null : prev,
											)
										}
										className={cn(
											"flex items-center h-full px-4 gap-4 border-b cursor-pointer transition-colors",
											"hover:bg-muted/50",
											isCursor && !isSelected && "bg-muted/30",
											isSelected &&
											"bg-ring/8 border-l-2 border-l-ring",
											isCursor &&
											isSelected &&
											"bg-ring/15 ring-1 ring-ring/30 ring-inset",
											isHighlighted && "bg-primary/10",
										)}
									>
										{row.getVisibleCells().map((cell) => (
											<div
												key={cell.id}
												className={cn(
													cell.column.id === "select" &&
													"w-8 shrink-0 flex items-center",
													cell.column.id === "date" &&
													"w-20 shrink-0",
													cell.column.id ===
													"rawMerchantString" &&
													"flex-1 min-w-0",
													cell.column.id === "category" &&
													"w-32 shrink-0",
													cell.column.id === "accountId" &&
													"w-24 shrink-0",
													cell.column.id === "amount" &&
													"w-24 shrink-0",
												)}
											>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</div>
										))}
									</div>
								</motion.div>
							);
						})}
					</AnimatePresence>
				</div>
			</div>

			<SelectionStatusBar
				count={selectionCount}
				onClear={() => table.resetRowSelection()}
			/>

			<DeleteConfirmDialog
				open={deleteTransactions.isDeleteDialogOpen}
				onOpenChange={(open) => {
					if (!open) deleteTransactions.cancelDelete();
				}}
				count={deleteTransactions.pendingDeleteIds.length}
				onConfirm={() => {
					deleteTransactions.confirmDelete().then(() => {
						table.resetRowSelection();
					});
				}}
				isDeleting={deleteTransactions.isDeleting}
			/>

			<MerchantAssignmentModal
				open={merchantModalOpen}
				onOpenChange={setMerchantModalOpen}
				transaction={merchantModalTransaction}
				transactions={merchantModalTransactions}
				powerMode={merchantModalPowerMode}
				onComplete={() => {
					if (merchantModalTransactions) {
						table.resetRowSelection();
					}
				}}
				onCascade={triggerCascade}
			/>

			<QuickCategoryPicker
				open={categoryPickerOpen}
				onOpenChange={setCategoryPickerOpen}
				batchCount={
					categoryBatchIds.length > 1 ? categoryBatchIds.length : undefined
				}
				onCategorySelect={(categoryId, subcategoryId) => {
					if (categoryBatchIds.length > 1) {
						const idsForCascade = categoryBatchIds.map(String);
						batchAssignCategory(categoryBatchIds, categoryId, subcategoryId);
						triggerCascade(idsForCascade);
						table.resetRowSelection();
						if (categoryBatchFirstId !== null) {
							const idx = flatRows.findIndex(
								(t) => t.id === categoryBatchFirstId,
							);
							if (idx !== -1) {
								setCursorRowId(String(categoryBatchFirstId));
							}
						}
						setCategoryBatchIds([]);
						setCategoryBatchFirstId(null);
					} else if (categoryPickerTransaction?.id !== undefined) {
						assignCategory(
							categoryPickerTransaction.id,
							categoryId,
							subcategoryId,
						);
					}
					setCategoryPickerOpen(false);
					setCategoryPickerTransaction(null);
				}}
			/>

			<RefundLinkModal
				open={refundLink.isOpen}
				onOpenChange={(open) => {
					if (!open) refundLink.closeRefundLink();
				}}
				sourceTransaction={refundLink.sourceTransaction}
				modalView={refundLink.modalView}
				onConfirmLink={refundLink.handleConfirmLink}
				onConfirmOrphan={refundLink.handleConfirmOrphan}
				onUnlink={refundLink.handleUnlink}
				onChangeLink={refundLink.handleChangeLink}
				onReplaceLink={refundLink.handleReplaceLink}
			/>
		</div>
	);
}
