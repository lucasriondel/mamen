import { AlertCircle, Check, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { CategoryPicker } from "@/components/CategoryPicker";
import { MatchPreviewList } from "@/components/MatchPreviewList";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { validateRulePattern } from "@/features/rules/utils/validateRulePattern";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";
import type { RuleWithMatchCount } from "../../hooks/useMerchantDetail";

export type RuleDetailModalProps = {
	isOpen: boolean;
	onClose: () => void;
	merchantId: number;
	merchantName: string;
	rule: RuleWithMatchCount | null;
	onSave: (data: {
		pattern: string;
		categoryOverride: number | undefined;
	}) => Promise<void>;
	onDelete?: (ruleId: number) => Promise<void>;
};

export function RuleDetailModal({
	isOpen,
	onClose,
	merchantName,
	rule,
	onSave,
	onDelete,
}: RuleDetailModalProps): React.ReactElement {
	const isEditMode = rule !== null;
	const [pattern, setPattern] = useState("");
	const [hasOverride, setHasOverride] = useState(false);
	const [categoryOverride, setCategoryOverride] = useState<number | undefined>(
		undefined,
	);
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
	const { getCategoryById } = useCategories();

	useEffect(() => {
		if (isOpen) {
			if (rule) {
				setPattern(rule.pattern);
				setHasOverride(rule.categoryOverride != null);
				setCategoryOverride(rule.categoryOverride);
			} else {
				setPattern("");
				setHasOverride(false);
				setCategoryOverride(undefined);
			}
		}
	}, [rule, isOpen]);

	const validation = validateRulePattern(pattern);

	const hasChanges = isEditMode
		? pattern !== rule.pattern ||
			(hasOverride ? categoryOverride : undefined) !== rule.categoryOverride
		: pattern.trim().length > 0;

	const canSave = validation.isValid && hasChanges && !isSaving;

	const handleSave = async (): Promise<void> => {
		if (!canSave) return;
		setIsSaving(true);
		try {
			await onSave({
				pattern,
				categoryOverride: hasOverride ? categoryOverride : undefined,
			});
			onClose();
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (): Promise<void> => {
		if (!isEditMode || !onDelete) return;
		setIsDeleting(true);
		try {
			await onDelete(rule.id);
			onClose();
		} finally {
			setIsDeleting(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent): void => {
		if (e.key === "Enter" && canSave) {
			e.preventDefault();
			handleSave();
		}
	};

	const selectedCategory =
		categoryOverride !== undefined
			? getCategoryById(categoryOverride)
			: undefined;

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[480px]" onKeyDown={handleKeyDown}>
				<DialogHeader>
					<DialogTitle>{isEditMode ? "Edit Rule" : "Add Rule"}</DialogTitle>
					<DialogDescription>Merchant: {merchantName}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<Label htmlFor="rule-pattern">Pattern</Label>
						<Input
							id="rule-pattern"
							value={pattern}
							onChange={(e) => setPattern(e.target.value)}
							className={cn(
								"font-mono",
								!validation.isValid && pattern && "border-destructive",
							)}
							placeholder="Enter regex pattern..."
							autoFocus
						/>
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
													style={{
														backgroundColor: selectedCategory.color,
													}}
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

				<DialogFooter className="gap-2">
					{isEditMode && onDelete && (
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={isDeleting}
							className="mr-auto"
						>
							{isDeleting ? "Deleting..." : "Delete"}
						</Button>
					)}
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!canSave}>
						{isSaving ? "Saving..." : isEditMode ? "Save Changes" : "Add Rule"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
