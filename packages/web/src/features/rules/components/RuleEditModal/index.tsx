import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { CategoryPicker } from "@/components/CategoryPicker";
import { MatchPreviewList } from "@/components/MatchPreviewList";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useCategories } from "@/hooks/useCategories";
import { merchantsApi, queryKeys, rulesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { validateRulePattern } from "../../utils/validateRulePattern";

type RuleEditModalProps = {
	ruleId: number | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (
		ruleId: number,
		updates: { pattern: string; categoryOverride?: number },
	) => Promise<void>;
};

export function RuleEditModal({
	ruleId,
	open,
	onOpenChange,
	onSave,
}: RuleEditModalProps): React.ReactElement {
	const [pattern, setPattern] = useState("");
	const [hasOverride, setHasOverride] = useState(false);
	const [categoryOverride, setCategoryOverride] = useState<number | undefined>(
		undefined,
	);
	const [isSaving, setIsSaving] = useState(false);
	const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
	const { getCategoryById } = useCategories();

	const { data: rule } = useQuery({
		queryKey: queryKeys.rules.detail(ruleId!),
		queryFn: () => rulesApi.get(ruleId!),
		enabled: ruleId != null,
	});

	const { data: merchant } = useQuery({
		queryKey: queryKeys.merchants.detail(rule?.merchantId!),
		queryFn: () => merchantsApi.get(rule!.merchantId),
		enabled: rule?.merchantId != null,
	});

	useEffect(() => {
		if (rule && open) {
			setPattern(rule.pattern);
			setHasOverride(rule.categoryOverride !== undefined);
			setCategoryOverride(rule.categoryOverride);
		}
	}, [rule, open]);

	const validation = validateRulePattern(pattern);
	const hasChanges =
		rule &&
		(pattern !== rule.pattern ||
			(hasOverride ? categoryOverride : undefined) !== rule.categoryOverride);

	const canSave = validation.isValid && hasChanges && !isSaving;

	const handleSave = async (): Promise<void> => {
		if (!ruleId || !canSave) return;
		setIsSaving(true);
		try {
			await onSave(ruleId, {
				pattern,
				categoryOverride: hasOverride ? categoryOverride : undefined,
			});
			onOpenChange(false);
		} finally {
			setIsSaving(false);
		}
	};

	const selectedCategory =
		categoryOverride !== undefined
			? getCategoryById(categoryOverride)
			: undefined;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>Edit Rule</DialogTitle>
					{merchant && (
						<p className="text-sm text-muted-foreground">
							Merchant: {merchant.name}
						</p>
					)}
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<Label htmlFor="rule-pattern">Pattern</Label>
						<div className="relative">
							<Input
								id="rule-pattern"
								value={pattern}
								onChange={(e) => setPattern(e.target.value)}
								className={cn(
									"font-mono",
									!validation.isValid && pattern && "border-destructive",
								)}
								placeholder="Enter regex pattern..."
							/>
						</div>
						{pattern && (
							<div className="flex items-center gap-1.5 text-xs">
								{validation.isValid ? (
									<>
										<Check className="h-3 w-3 text-green-500" />
										<span className="text-green-500">Valid regex pattern</span>
									</>
								) : (
									<>
										<AlertCircle className="h-3 w-3 text-destructive" />
										<span className="text-destructive">{validation.error}</span>
									</>
								)}
							</div>
						)}
					</div>

					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="category-override"
								checked={hasOverride}
								onCheckedChange={(checked) => {
									setHasOverride(checked === true);
									if (!checked) setCategoryOverride(undefined);
								}}
							/>
							<Label htmlFor="category-override" className="text-sm">
								Override merchant's default category
							</Label>
						</div>

						{hasOverride && (
							<Popover
								open={categoryPickerOpen}
								onOpenChange={setCategoryPickerOpen}
							>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										className="w-full justify-between"
										role="combobox"
										aria-expanded={categoryPickerOpen}
									>
										{selectedCategory ? (
											<span className="flex items-center gap-2">
												<span
													className="h-2 w-2 rounded-full shrink-0"
													style={{ backgroundColor: selectedCategory.color }}
												/>
												{selectedCategory.name}
											</span>
										) : (
											<span className="text-muted-foreground">
												Select category...
											</span>
										)}
										<ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="p-0" align="start">
									<CategoryPicker
										value={categoryOverride}
										onSelect={(catId, subId) => {
											setCategoryOverride(subId ?? catId);
											setCategoryPickerOpen(false);
										}}
									/>
								</PopoverContent>
							</Popover>
						)}
					</div>

					<div className="space-y-2">
						<Label>Match Preview</Label>
						<div className="rounded-md border p-3 bg-muted/50">
							<MatchPreviewList pattern={validation.isValid ? pattern : ""} />
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!canSave}>
						{isSaving ? "Saving..." : "Save Changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
