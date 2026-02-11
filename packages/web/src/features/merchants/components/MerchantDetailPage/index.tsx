import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useRuleMutations } from "@/features/rules/hooks/useRuleMutations";
import {
	addRuleToMerchant,
	undoAddRule,
} from "@/features/rules/services/addRuleToMerchant";
import { invalidateEntity } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
	type TimePeriod,
	useMerchantDetail,
} from "../../hooks/useMerchantDetail";
import { EditMerchantModal } from "../EditMerchantModal";
import { MerchantDetailRules } from "../MerchantDetailRules";
import { MerchantHeader } from "../MerchantHeader";
import { MerchantStatsCards } from "../MerchantStatsCards";
import { MerchantTransactionList } from "../MerchantTransactionList";
import { RuleDetailModal } from "../RuleDetailModal";

export type MerchantDetailPageProps = {
	merchantId: number;
};

export function MerchantDetailPage({
	merchantId,
}: MerchantDetailPageProps): React.ReactElement {
	const navigate = useNavigate();
	const [timePeriod, setTimePeriod] = useState<TimePeriod>("all-time");
	const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
	const [isAddingRule, setIsAddingRule] = useState(false);
	const [isEditingMerchant, setIsEditingMerchant] = useState(false);
	const { updateRule, deleteRule } = useRuleMutations();

	const {
		merchant,
		stats,
		rules,
		transactions,
		categoryDistribution,
		isMixed,
		isLoading,
	} = useMerchantDetail(merchantId, timePeriod);

	const isAnyModalOpen =
		editingRuleId !== null || isAddingRule || isEditingMerchant;

	const handleBack = useCallback(() => {
		navigate({ to: "/merchants" });
	}, [navigate]);

	const handleEditRule = useCallback((ruleId: number) => {
		setEditingRuleId(ruleId);
	}, []);

	const handleAddRule = useCallback(() => {
		setIsAddingRule(true);
	}, []);

	const handleSaveEditRule = useCallback(
		async (data: { pattern: string; categoryOverride: number | undefined }) => {
			if (editingRuleId === null) return;
			await updateRule(editingRuleId, {
				pattern: data.pattern,
				categoryOverride: data.categoryOverride,
			});
		},
		[editingRuleId, updateRule],
	);

	const handleDeleteRule = useCallback(
		async (ruleId: number) => {
			await deleteRule(ruleId);
		},
		[deleteRule],
	);

	const handleSaveAddRule = useCallback(
		async (data: { pattern: string; categoryOverride: number | undefined }) => {
			const result = await addRuleToMerchant({
				merchantId,
				pattern: data.pattern,
				categoryOverrideId: data.categoryOverride ?? null,
			});
			invalidateEntity("rules", "transactions");
			toast(
				`Rule added: ${result.matchCount} transaction${result.matchCount !== 1 ? "s" : ""} matched`,
				{
					action: {
						label: "Undo",
						onClick: () => {
							undoAddRule(result.ruleId, result.affectedTransactionIds)
								.then(() => {
									invalidateEntity("rules", "transactions");
								})
								.catch(() => {
									toast.error("Failed to undo rule addition");
								});
						},
					},
					duration: 10000,
				},
			);
		},
		[merchantId],
	);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (isAnyModalOpen) return;
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;

			switch (e.key) {
				case "e":
				case "E":
					e.preventDefault();
					setIsEditingMerchant(true);
					break;
				case "d":
				case "D":
					e.preventDefault();
					setIsEditingMerchant(true);
					break;
			}
		},
		[isAnyModalOpen],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	if (isLoading) {
		return (
			<div className="-m-6 flex flex-col h-full">
				<div className="px-6 py-4 space-y-8 animate-pulse">
					<div className="space-y-2">
						<div className={cn("h-8 w-24 rounded bg-muted")} />
						<div className={cn("h-8 w-48 rounded bg-muted")} />
						<div className={cn("h-7 w-32 rounded bg-muted")} />
					</div>
					<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
						{[1, 2, 3, 4].map((i) => (
							<div key={i} className={cn("h-20 rounded-xl bg-muted")} />
						))}
					</div>
					<div className={cn("h-40 rounded bg-muted")} />
					<div className={cn("h-60 rounded bg-muted")} />
				</div>
			</div>
		);
	}

	if (!merchant) {
		return (
			<div className="-m-6 flex flex-col items-center justify-center h-full gap-4">
				<p className="text-lg text-muted-foreground">Merchant not found</p>
				<button
					type="button"
					onClick={handleBack}
					className="text-sm text-primary underline hover:no-underline"
				>
					Back to Merchants
				</button>
			</div>
		);
	}

	const editingRule =
		editingRuleId !== null
			? (rules.find((r) => r.id === editingRuleId) ?? null)
			: null;

	return (
		<div className="-m-6 flex flex-col h-full">
			<div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-8">
				<MerchantHeader
					name={merchant.name}
					imageUrl={merchant.imageUrl}
					defaultCategoryId={merchant.defaultCategoryId}
					createdAt={merchant.createdAt}
					onBack={handleBack}
				/>

				<MerchantStatsCards stats={stats} />

				<MerchantDetailRules
					rules={rules}
					onEditRule={handleEditRule}
					onAddRule={handleAddRule}
				/>

				<MerchantTransactionList
					transactions={transactions}
					categoryDistribution={categoryDistribution}
					isMixed={isMixed}
					timePeriod={timePeriod}
					onTimePeriodChange={setTimePeriod}
				/>
			</div>

			<div className="flex justify-center gap-6 text-xs text-muted-foreground bg-background/80 backdrop-blur px-4 py-2 border-t shrink-0">
				<span>
					<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">E</kbd>{" "}
					Edit Merchant
				</span>
				<span>
					<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">D</kbd>{" "}
					Change Default
				</span>
			</div>

			<RuleDetailModal
				isOpen={editingRuleId !== null}
				onClose={() => setEditingRuleId(null)}
				merchantId={merchantId}
				merchantName={merchant.name}
				rule={editingRule}
				onSave={handleSaveEditRule}
				onDelete={handleDeleteRule}
			/>

			<RuleDetailModal
				isOpen={isAddingRule}
				onClose={() => setIsAddingRule(false)}
				merchantId={merchantId}
				merchantName={merchant.name}
				rule={null}
				onSave={handleSaveAddRule}
			/>

			<EditMerchantModal
				isOpen={isEditingMerchant}
				onClose={() => setIsEditingMerchant(false)}
				merchantId={merchantId}
				currentName={merchant.name}
				currentCategoryId={merchant.defaultCategoryId}
				currentImageUrl={merchant.imageUrl}
			/>
		</div>
	);
}
