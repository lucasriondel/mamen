import { AlertTriangle, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CategoryPicker } from "@/components/CategoryPicker";
import { MatchPreviewList } from "@/components/MatchPreviewList";
import { RegexCheatsheet } from "@/components/RegexCheatsheet";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	cleanExpiredNewMerchantFlags,
	detectNewMerchantAnomalies,
} from "@/features/anomalies/services/anomalyDetector";
import {
	type BatchUndoParams,
	batchAssignMerchant,
	undoBatchAssign,
} from "@/features/merchants/services/batchAssignMerchant";
import {
	addRuleToMerchant,
	undoAddRule,
} from "@/features/rules/services/addRuleToMerchant";
import {
	applyRuleToTransactions,
	undoRuleApplication,
} from "@/features/rules/services/applyRule";
import {
	analyzeBatchPatterns,
	type BatchPatternSuggestion,
	getMatchingTransactionsOutsideSelection,
} from "@/features/rules/services/batchPatternAnalyzer";
import { detectRuleConflict } from "@/features/rules/services/detectRuleConflict";
import {
	generatePatternSuggestions,
	type PatternSuggestion,
} from "@/features/rules/services/ruleEngine";
import { useCategories } from "@/hooks/useCategories";
import { useMerchants } from "@/hooks/useMerchants";
import { invalidateEntity, rulesApi, transactionsApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import { formatDate } from "@/lib/utils/formatDate";
import {
	cleanMerchantString,
	validateRegexPattern,
} from "@/lib/utils/patternUtils";
import type { Transaction } from "@/types";
import { useExistingMerchant } from "../../hooks/useExistingMerchant";
import { MerchantRulesList } from "../MerchantRulesList";
import { MerchantSearchSelect } from "../MerchantSearchSelect";
import { PatternSuggestionRadioGroup } from "../PatternSuggestionRadioGroup";

type MerchantAssignmentModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	transaction: Transaction | null;
	transactions?: Transaction[];
	powerMode?: boolean;
	onComplete?: () => void;
	onCascade?: (affectedIds: string[]) => void;
};

type ConflictWarning = {
	conflictingMerchant: string;
	conflictingPattern: string;
	specificity: "more" | "less" | "equal";
};

type NoPatternOption = "multiple-rules" | "assign-without-rule" | null;

export function MerchantAssignmentModal({
	open,
	onOpenChange,
	transaction,
	transactions,
	powerMode = false,
	onComplete,
	onCascade,
}: MerchantAssignmentModalProps): React.ReactElement {
	const { createMerchant, getMerchantByName } = useMerchants();
	const { getCategoryById } = useCategories();

	const isBatchMode = !!transactions && transactions.length > 1;

	// Assignment mode: new or existing
	const [assignmentMode, setAssignmentMode] = useState<"new" | "existing">(
		"new",
	);

	// New merchant state
	const [merchantName, setMerchantName] = useState("");
	const [duplicateWarning, setDuplicateWarning] = useState("");

	// Existing merchant state
	const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(
		null,
	);

	// Shared state
	const [selectedPattern, setSelectedPattern] = useState("");
	const [customPattern, setCustomPattern] = useState("");
	const [isCustomMode, setIsCustomMode] = useState(false);
	const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
	const [setAsDefault, setSetAsDefault] = useState(true);
	const [categoryOverrideEnabled, setCategoryOverrideEnabled] = useState(false);
	const [suggestions, setSuggestions] = useState<PatternSuggestion[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
	const [conflictWarning, setConflictWarning] =
		useState<ConflictWarning | null>(null);
	const [duplicatePatternError, setDuplicatePatternError] = useState("");

	// Batch mode state
	const [batchSuggestions, setBatchSuggestions] = useState<
		BatchPatternSuggestion[]
	>([]);
	const [batchResultType, setBatchResultType] = useState<
		"common-prefix" | "combined" | "no-pattern"
	>("no-pattern");
	const [noPatternOption, setNoPatternOption] = useState<NoPatternOption>(null);
	const [outsideWarningExpanded, setOutsideWarningExpanded] = useState(false);
	const [outsideMatches, setOutsideMatches] = useState<
		{ rawMerchantString: string; date: Date; amount: number }[]
	>([]);

	const { merchant: existingMerchant, rules: existingRules } =
		useExistingMerchant(
			assignmentMode === "existing" ? selectedMerchantId : null,
		);

	const activePattern = isCustomMode ? customPattern : selectedPattern;
	const patternValidation = isCustomMode
		? validateRegexPattern(customPattern)
		: { valid: true };

	// Form validity for no-pattern batch mode
	const isNoPatternValid =
		isBatchMode &&
		batchResultType === "no-pattern" &&
		noPatternOption !== null &&
		categoryId !== undefined &&
		(assignmentMode === "new"
			? merchantName.trim().length > 0
			: selectedMerchantId !== null);

	const isNewFormValid =
		assignmentMode === "new" &&
		merchantName.trim().length > 0 &&
		(isNoPatternValid ||
			(activePattern.length > 0 && patternValidation.valid)) &&
		categoryId !== undefined &&
		!duplicateWarning &&
		!duplicatePatternError;

	const isExistingFormValid =
		assignmentMode === "existing" &&
		selectedMerchantId !== null &&
		(isNoPatternValid ||
			(activePattern.length > 0 && patternValidation.valid)) &&
		!duplicatePatternError &&
		(categoryOverrideEnabled
			? categoryId !== undefined
			: existingMerchant?.defaultCategoryId !== undefined);

	const isFormValid = isNewFormValid || isExistingFormValid;

	// Reset form when transaction/transactions changes
	useEffect(() => {
		if (!open) return;

		if (isBatchMode && transactions) {
			// Batch mode initialization
			const rawStrings = transactions.map((t) => t.rawMerchantString);
			const firstCleaned = cleanMerchantString(rawStrings[0]);
			setMerchantName(firstCleaned);
			setAssignmentMode("new");
			setSelectedMerchantId(null);
			setSelectedPattern("");
			setCustomPattern("");
			setIsCustomMode(false);
			setCategoryId(undefined);
			setSetAsDefault(true);
			setCategoryOverrideEnabled(false);
			setDuplicateWarning("");
			setCategoryPickerOpen(false);
			setConflictWarning(null);
			setDuplicatePatternError("");
			setNoPatternOption(null);
			setOutsideWarningExpanded(false);
			setOutsideMatches([]);
			setSuggestions([]);

			analyzeBatchPatterns(rawStrings).then((result) => {
				setBatchResultType(result.type);
				setBatchSuggestions(result.suggestions);
				if (result.suggestions.length > 0) {
					setSelectedPattern(result.suggestions[0].pattern);
				}
			});
		} else if (transaction) {
			// Single mode initialization (existing behavior)
			const cleaned = cleanMerchantString(transaction.rawMerchantString);
			setMerchantName(cleaned);
			setAssignmentMode("new");
			setSelectedMerchantId(null);
			setSelectedPattern("");
			setCustomPattern("");
			setIsCustomMode(powerMode);
			setCategoryId(undefined);
			setSetAsDefault(true);
			setCategoryOverrideEnabled(false);
			setDuplicateWarning("");
			setCategoryPickerOpen(false);
			setConflictWarning(null);
			setDuplicatePatternError("");
			setBatchSuggestions([]);
			setBatchResultType("no-pattern");
			setNoPatternOption(null);
			setOutsideWarningExpanded(false);
			setOutsideMatches([]);

			generatePatternSuggestions(transaction.rawMerchantString).then(
				(result) => {
					setSuggestions(result);
					if (result.length > 0 && !powerMode) {
						setSelectedPattern(result[0].pattern);
					}
				},
			);
		}
	}, [transaction, transactions, open, powerMode, isBatchMode]);

	// Check for duplicate merchant names (new mode only)
	useEffect(() => {
		if (assignmentMode !== "new" || !merchantName.trim()) {
			setDuplicateWarning("");
			return;
		}
		const timer = setTimeout(async () => {
			const existing = await getMerchantByName(merchantName.trim());
			if (existing) {
				setDuplicateWarning(`Merchant "${existing.name}" already exists`);
			} else {
				setDuplicateWarning("");
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [merchantName, getMerchantByName, assignmentMode]);

	// When existing merchant is selected, default category to merchant's default
	useEffect(() => {
		if (existingMerchant && assignmentMode === "existing") {
			if (existingMerchant.defaultCategoryId !== undefined) {
				setCategoryId(existingMerchant.defaultCategoryId);
			}
			setCategoryOverrideEnabled(false);
		}
	}, [existingMerchant, assignmentMode]);

	// Check for rule conflicts when pattern changes
	useEffect(() => {
		if (!activePattern) {
			setConflictWarning(null);
			return;
		}
		const timer = setTimeout(async () => {
			const excludeId =
				assignmentMode === "existing"
					? (selectedMerchantId ?? undefined)
					: undefined;
			const result = await detectRuleConflict(activePattern, excludeId);
			if (result.hasConflict) {
				setConflictWarning({
					conflictingMerchant: result.conflictingMerchant!,
					conflictingPattern: result.conflictingPattern!,
					specificity: result.specificity!,
				});
			} else {
				setConflictWarning(null);
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [activePattern, assignmentMode, selectedMerchantId]);

	// Check for duplicate pattern within same merchant
	useEffect(() => {
		if (
			assignmentMode !== "existing" ||
			!selectedMerchantId ||
			!activePattern
		) {
			setDuplicatePatternError("");
			return;
		}
		const isDuplicate = existingRules.some((r) => r.pattern === activePattern);
		if (isDuplicate) {
			setDuplicatePatternError(
				`This pattern already exists for ${existingMerchant?.name ?? "this merchant"}`,
			);
		} else {
			setDuplicatePatternError("");
		}
	}, [
		activePattern,
		existingRules,
		existingMerchant,
		assignmentMode,
		selectedMerchantId,
	]);

	// Load outside-selection matches when a batch suggestion with outside matches is selected
	useEffect(() => {
		if (!isBatchMode || !activePattern || !transactions) return;
		const selectedSuggestion = batchSuggestions.find(
			(s) => s.pattern === activePattern,
		);
		if (
			!selectedSuggestion ||
			selectedSuggestion.matchesOutsideSelection <= 0
		) {
			setOutsideMatches([]);
			return;
		}
		const rawStrings = transactions.map((t) => t.rawMerchantString);
		getMatchingTransactionsOutsideSelection(activePattern, rawStrings).then(
			setOutsideMatches,
		);
	}, [activePattern, batchSuggestions, isBatchMode, transactions]);

	const handleCategorySelect = useCallback(
		(catId: number, subCatId?: number) => {
			setCategoryId(subCatId ?? catId);
			setCategoryPickerOpen(false);
		},
		[],
	);

	const handleSubmit = async (): Promise<void> => {
		if (!isFormValid) return;

		setIsSubmitting(true);
		try {
			if (isBatchMode && transactions) {
				await handleBatchSubmit();
			} else if (transaction) {
				await handleSingleSubmit();
			}
		} catch (error) {
			toast.error(
				assignmentMode === "new"
					? "Failed to create merchant"
					: "Failed to add rule",
				{
					description: error instanceof Error ? error.message : "Unknown error",
				},
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleSingleSubmit = async (): Promise<void> => {
		if (!transaction) return;

		if (assignmentMode === "new") {
			const merchantId = await createMerchant(
				merchantName.trim(),
				setAsDefault ? categoryId : undefined,
			);

			const ruleId = await rulesApi.create({
				merchantId,
				pattern: activePattern,
				matchCount: 0,
				createdAt: new Date(),
			});

			const rule = {
				id: ruleId,
				merchantId,
				pattern: activePattern,
				matchCount: 0,
				createdAt: new Date(),
			};

			const { count, affectedIds } = await applyRuleToTransactions(
				rule,
				categoryId!,
			);
			invalidateEntity("merchants", "rules", "transactions");

			onOpenChange(false);
			onComplete?.();
			onCascade?.(affectedIds.map(String));

			toast(
				`${count} transaction${count !== 1 ? "s" : ""} → ${merchantName.trim()}`,
				{
					action: {
						label: "Undo",
						onClick: () => {
							undoRuleApplication(merchantId, ruleId, affectedIds).then(() => {
								invalidateEntity("merchants", "rules", "transactions");
							});
							toast("Merchant creation undone");
						},
					},
					duration: 10000,
				},
			);

			// Fire-and-forget new-merchant anomaly detection
			cleanExpiredNewMerchantFlags().then(() => detectNewMerchantAnomalies());
		} else {
			if (!selectedMerchantId) return;

			const overrideId = categoryOverrideEnabled ? (categoryId ?? null) : null;
			const result = await addRuleToMerchant({
				merchantId: selectedMerchantId,
				pattern: activePattern,
				categoryOverrideId: overrideId,
			});
			invalidateEntity("rules", "transactions");

			onOpenChange(false);
			onComplete?.();
			onCascade?.(result.affectedTransactionIds.map(String));

			const merchantDisplayName = existingMerchant?.name ?? "merchant";
			toast(
				`${result.matchCount} transaction${result.matchCount !== 1 ? "s" : ""} → ${merchantDisplayName}`,
				{
					action: {
						label: "Undo",
						onClick: () => {
							undoAddRule(result.ruleId, result.affectedTransactionIds).then(
								() => {
									invalidateEntity("rules", "transactions");
								},
							);
							toast("Rule addition undone");
						},
					},
					duration: 10000,
				},
			);
		}
	};

	const handleBatchSubmit = async (): Promise<void> => {
		if (!transactions) return;

		const txIds = transactions.map((t) => t.id!).filter(Boolean);

		// Save previous state for undo
		const previousState = transactions.map((t) => ({
			id: t.id!,
			merchantId: (t.merchantId as number) ?? null,
			categoryId: (t.categoryId as number) ?? null,
		}));

		const isAssignWithoutRule = noPatternOption === "assign-without-rule";
		const isMultipleRules =
			noPatternOption === "multiple-rules" && batchResultType === "no-pattern";

		// For multiple-rules: compute per-group patterns
		let additionalPatterns: string[] | undefined;
		if (isMultipleRules) {
			const { extractPrefix, escapeRegex } = await import(
				"@/lib/utils/patternUtils"
			);
			const groups: Record<string, boolean> = {};
			for (const tx of transactions) {
				const prefix = extractPrefix(tx.rawMerchantString);
				const root =
					prefix ??
					tx.rawMerchantString.split(/\s+/)[0] ??
					tx.rawMerchantString;
				groups[root.toUpperCase()] = true;
			}
			const rootKeys = Object.keys(groups);
			additionalPatterns = rootKeys.slice(1).map((r) => `^${escapeRegex(r)}.*`);
			// First pattern used as primary
			const firstPattern = `^${escapeRegex(rootKeys[0])}.*`;
			// We'll set this as the main pattern
			// (selectedPattern might not be set in no-pattern mode)
			await doBatchAssign(
				firstPattern,
				additionalPatterns,
				txIds,
				previousState,
				false,
			);
			return;
		}

		await doBatchAssign(
			activePattern,
			undefined,
			txIds,
			previousState,
			isAssignWithoutRule,
		);
	};

	const doBatchAssign = async (
		pattern: string,
		additionalPatterns: string[] | undefined,
		txIds: number[],
		previousState: Array<{
			id: number;
			merchantId: number | null;
			categoryId: number | null;
		}>,
		assignWithoutRule: boolean,
	): Promise<void> => {
		const effectiveCategoryId =
			categoryOverrideEnabled && existingMerchant
				? (categoryId ?? existingMerchant.defaultCategoryId!)
				: categoryId!;

		const result = await batchAssignMerchant({
			mode: assignmentMode,
			merchantName: assignmentMode === "new" ? merchantName.trim() : undefined,
			merchantId:
				assignmentMode === "existing" ? selectedMerchantId! : undefined,
			pattern,
			additionalPatterns,
			categoryId: effectiveCategoryId,
			categoryOverrideId: categoryOverrideEnabled
				? (categoryId ?? null)
				: undefined,
			transactionIds: txIds,
			assignWithoutRule,
		});

		// Also capture any additional affected transactions for undo (rule applied globally)
		const allAffectedPreviousState: BatchUndoParams["previousState"] = [];
		const previousIds = new Set(previousState.map((p) => p.id));
		for (const affId of result.affectedTransactionIds) {
			if (previousIds.has(affId)) {
				allAffectedPreviousState.push(
					previousState.find((p) => p.id === affId)!,
				);
			} else {
				// Fetch previous state for transactions outside selection
				const tx = await transactionsApi.get(affId);
				if (tx) {
					allAffectedPreviousState.push({
						id: affId,
						merchantId: (tx.merchantId as number) ?? null,
						categoryId: (tx.categoryId as number) ?? null,
					});
				}
			}
		}

		const isNewMerchant = assignmentMode === "new";
		const merchantDisplayName = isNewMerchant
			? merchantName.trim()
			: (existingMerchant?.name ?? "merchant");

		invalidateEntity("merchants", "rules", "transactions");

		onOpenChange(false);
		onComplete?.();
		onCascade?.(result.affectedTransactionIds.map(String));

		toast(
			`${result.matchCount} transaction${result.matchCount !== 1 ? "s" : ""} → ${merchantDisplayName}`,
			{
				action: {
					label: "Undo",
					onClick: () => {
						undoBatchAssign({
							merchantId: result.merchantId,
							ruleIds: result.ruleIds,
							affectedTransactionIds: result.affectedTransactionIds,
							previousState: allAffectedPreviousState,
							deleteNewMerchant: isNewMerchant,
						}).then(() => {
							invalidateEntity("merchants", "rules", "transactions");
						});
						toast("Batch assignment undone");
					},
				},
				duration: 10000,
			},
		);

		// Fire-and-forget new-merchant anomaly detection
		if (isNewMerchant) {
			cleanExpiredNewMerchantFlags().then(() => detectNewMerchantAnomalies());
		}
	};

	const selectedCategory = categoryId ? getCategoryById(categoryId) : undefined;
	const defaultCategory = existingMerchant?.defaultCategoryId
		? getCategoryById(existingMerchant.defaultCategoryId)
		: undefined;

	const specificityMessage =
		conflictWarning?.specificity === "more"
			? "Your rule is more specific and will take priority"
			: conflictWarning?.specificity === "less"
				? "Your rule is less specific and will be overridden"
				: "Both rules have equal specificity";

	const selectedBatchSuggestion = batchSuggestions.find(
		(s) => s.pattern === activePattern,
	);
	const hasOutsideMatches =
		selectedBatchSuggestion &&
		selectedBatchSuggestion.matchesOutsideSelection > 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto"
				aria-labelledby="merchant-modal-title"
				onKeyDown={(e) => {
					if (e.key === "Enter" && isFormValid && !isSubmitting) {
						e.preventDefault();
						handleSubmit();
					}
				}}
			>
				<DialogHeader>
					<DialogTitle id="merchant-modal-title">
						{isBatchMode
							? `Assign ${transactions!.length} Transactions to Merchant`
							: "Assign to Merchant"}
					</DialogTitle>
					<DialogDescription>
						{isBatchMode ? (
							<span className="space-y-1 block">
								<span className="text-xs text-muted-foreground block">
									Selected transactions:
								</span>
								<span className="block max-h-24 overflow-y-auto space-y-0.5">
									{transactions!.slice(0, 5).map((tx, i) => (
										<code
											key={tx.id ?? i}
											className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono block truncate"
										>
											{tx.rawMerchantString}
										</code>
									))}
									{transactions!.length > 5 && (
										<span className="text-xs text-muted-foreground block">
											+{transactions!.length - 5} more
										</span>
									)}
								</span>
							</span>
						) : (
							<>
								Transaction:{" "}
								<code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
									{transaction?.rawMerchantString}
								</code>
							</>
						)}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{/* Assignment Mode Toggle */}
					<div className="space-y-2">
						<Label>Assign to</Label>
						<RadioGroup
							value={assignmentMode}
							onValueChange={(val) =>
								setAssignmentMode(val as "new" | "existing")
							}
							className="flex gap-4"
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="new" id="mode-new" />
								<Label htmlFor="mode-new" className="cursor-pointer text-sm">
									New merchant
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="existing" id="mode-existing" />
								<Label
									htmlFor="mode-existing"
									className="cursor-pointer text-sm"
								>
									Existing merchant
								</Label>
							</div>
						</RadioGroup>
					</div>

					{/* New Merchant Name Input */}
					{assignmentMode === "new" && (
						<div className="space-y-2">
							<Label htmlFor="merchant-name">Merchant name</Label>
							<Input
								id="merchant-name"
								value={merchantName}
								onChange={(e) => setMerchantName(e.target.value)}
								placeholder="Enter merchant name"
								aria-invalid={!!duplicateWarning}
							/>
							{duplicateWarning && (
								<p className="text-xs text-amber-500" role="alert">
									{duplicateWarning}
								</p>
							)}
						</div>
					)}

					{/* Existing Merchant Search */}
					{assignmentMode === "existing" && (
						<div className="space-y-2">
							<Label>Select merchant</Label>
							<MerchantSearchSelect
								value={selectedMerchantId}
								onChange={setSelectedMerchantId}
							/>
							{selectedMerchantId !== null && existingMerchant && (
								<div className="space-y-1">
									<Label className="text-xs text-muted-foreground">
										Current rules
									</Label>
									<MerchantRulesList merchantId={selectedMerchantId} />
								</div>
							)}
						</div>
					)}

					{/* Pattern Selection */}
					{isBatchMode && batchResultType === "no-pattern" ? (
						/* No-pattern batch mode */
						<div className="space-y-2">
							<Label>No common pattern found</Label>
							<p className="text-xs text-muted-foreground">
								The selected transactions are too diverse for a single pattern.
							</p>
							<RadioGroup
								value={noPatternOption ?? ""}
								onValueChange={(val) =>
									setNoPatternOption(val as NoPatternOption)
								}
								className="space-y-2"
							>
								<div className="flex items-center gap-2">
									<RadioGroupItem value="multiple-rules" id="opt-multi-rules" />
									<Label
										htmlFor="opt-multi-rules"
										className="cursor-pointer text-sm"
									>
										Create merchant with multiple rules
									</Label>
								</div>
								<div className="flex items-center gap-2">
									<RadioGroupItem
										value="assign-without-rule"
										id="opt-no-rule"
									/>
									<Label
										htmlFor="opt-no-rule"
										className="cursor-pointer text-sm"
									>
										Assign without rule
									</Label>
								</div>
							</RadioGroup>
						</div>
					) : (
						/* Pattern suggestions (single or batch with pattern) */
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<Label>
									{assignmentMode === "new"
										? "Create rule from pattern"
										: "Add rule pattern"}
								</Label>
								{isCustomMode && <RegexCheatsheet />}
							</div>

							{isCustomMode ? (
								<div className="space-y-1">
									<Input
										value={customPattern}
										onChange={(e) => setCustomPattern(e.target.value)}
										placeholder="Enter regex pattern"
										className="font-mono text-sm"
										aria-invalid={
											!patternValidation.valid || !!duplicatePatternError
										}
										aria-describedby={
											!patternValidation.valid
												? "pattern-error"
												: duplicatePatternError
													? "duplicate-pattern-error"
													: undefined
										}
									/>
									{!patternValidation.valid && patternValidation.error && (
										<p
											id="pattern-error"
											className="text-xs text-destructive"
											role="alert"
										>
											{patternValidation.error}
										</p>
									)}
									<Button
										type="button"
										variant="link"
										size="sm"
										className="h-auto p-0 text-xs"
										onClick={() => {
											setIsCustomMode(false);
											const allSuggestions = isBatchMode
												? batchSuggestions
												: suggestions;
											if (allSuggestions.length > 0) {
												setSelectedPattern(allSuggestions[0].pattern);
											}
										}}
									>
										Use suggestions
									</Button>
								</div>
							) : isBatchMode && batchSuggestions.length > 0 ? (
								<BatchPatternSuggestions
									suggestions={batchSuggestions}
									value={selectedPattern}
									onChange={setSelectedPattern}
									onCustomMode={() => setIsCustomMode(true)}
								/>
							) : (
								<PatternSuggestionRadioGroup
									suggestions={suggestions}
									value={selectedPattern}
									onChange={setSelectedPattern}
									onCustomMode={() => setIsCustomMode(true)}
								/>
							)}

							{/* Duplicate pattern error */}
							{duplicatePatternError && (
								<p
									id="duplicate-pattern-error"
									className="text-xs text-destructive"
									role="alert"
								>
									{duplicatePatternError}
								</p>
							)}
						</div>
					)}

					{/* Outside Selection Warning (batch mode) */}
					{isBatchMode && hasOutsideMatches && (
						<div className="space-y-1">
							<button
								type="button"
								className="flex items-center gap-2 text-xs text-amber-500 hover:text-amber-400"
								onClick={() =>
									setOutsideWarningExpanded(!outsideWarningExpanded)
								}
							>
								<AlertTriangle
									className="h-3.5 w-3.5 shrink-0"
									aria-hidden="true"
								/>
								<span>
									Pattern also matches{" "}
									<span className="font-medium text-destructive">
										{selectedBatchSuggestion!.matchesOutsideSelection}
									</span>{" "}
									other transaction
									{selectedBatchSuggestion!.matchesOutsideSelection !== 1
										? "s"
										: ""}
								</span>
							</button>
							{outsideWarningExpanded && outsideMatches.length > 0 && (
								<div className="ml-5 space-y-0.5 border-l-2 border-amber-500/30 pl-2">
									{outsideMatches.slice(0, 5).map((tx, i) => (
										<div
											key={i}
											className="flex items-center gap-2 text-xs text-muted-foreground"
										>
											<span className="truncate flex-1 font-mono">
												{tx.rawMerchantString}
											</span>
											<span className="shrink-0">{formatDate(tx.date)}</span>
											<span className="shrink-0 font-mono">
												{formatCurrency(tx.amount)}
											</span>
										</div>
									))}
									{selectedBatchSuggestion!.matchesOutsideSelection > 5 && (
										<p className="text-xs text-muted-foreground">
											and {selectedBatchSuggestion!.matchesOutsideSelection - 5}{" "}
											more
										</p>
									)}
								</div>
							)}
						</div>
					)}

					{/* Conflict Warning */}
					{conflictWarning && (
						<div
							className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3"
							role="alert"
						>
							<AlertTriangle
								className="h-4 w-4 text-amber-500 shrink-0 mt-0.5"
								aria-hidden="true"
							/>
							<div className="text-sm">
								<p className="font-medium text-amber-500">
									Pattern overlaps with {conflictWarning.conflictingMerchant}
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									{specificityMessage}
								</p>
							</div>
						</div>
					)}

					{/* Category Picker */}
					<div className="space-y-2">
						<Label>Category</Label>

						{assignmentMode === "existing" && existingMerchant ? (
							<>
								<div className="flex items-center gap-2">
									<Checkbox
										id="category-override"
										checked={categoryOverrideEnabled}
										onCheckedChange={(checked) =>
											setCategoryOverrideEnabled(checked === true)
										}
									/>
									<Label
										htmlFor="category-override"
										className="text-xs cursor-pointer"
									>
										Override category for this rule
									</Label>
								</div>

								{!categoryOverrideEnabled && defaultCategory && (
									<p className="text-xs text-muted-foreground">
										Uses merchant default:{" "}
										<span className="inline-flex items-center gap-1">
											<span
												className="h-2 w-2 rounded-full inline-block"
												style={{ backgroundColor: defaultCategory.color }}
												aria-hidden="true"
											/>
											{defaultCategory.name}
										</span>
									</p>
								)}

								{categoryOverrideEnabled && (
									<Popover
										open={categoryPickerOpen}
										onOpenChange={setCategoryPickerOpen}
									>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												className="w-full justify-between"
												type="button"
											>
												{selectedCategory ? (
													<span className="flex items-center gap-2">
														<span
															className="h-2 w-2 rounded-full shrink-0"
															style={{
																backgroundColor: selectedCategory.color,
															}}
															aria-hidden="true"
														/>
														{selectedCategory.name}
													</span>
												) : (
													<span className="text-muted-foreground">
														Select category...
													</span>
												)}
												<ChevronDown className="h-4 w-4 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[280px] p-0" align="start">
											<CategoryPicker
												value={categoryId}
												onSelect={handleCategorySelect}
											/>
										</PopoverContent>
									</Popover>
								)}
							</>
						) : (
							<>
								<Popover
									open={categoryPickerOpen}
									onOpenChange={setCategoryPickerOpen}
								>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											className="w-full justify-between"
											type="button"
										>
											{selectedCategory ? (
												<span className="flex items-center gap-2">
													<span
														className="h-2 w-2 rounded-full shrink-0"
														style={{ backgroundColor: selectedCategory.color }}
														aria-hidden="true"
													/>
													{selectedCategory.name}
												</span>
											) : (
												<span className="text-muted-foreground">
													Select category...
												</span>
											)}
											<ChevronDown className="h-4 w-4 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[280px] p-0" align="start">
										<CategoryPicker
											value={categoryId}
											onSelect={handleCategorySelect}
										/>
									</PopoverContent>
								</Popover>

								{!isBatchMode && (
									<div className="flex items-center gap-2">
										<Checkbox
											id="set-default"
											checked={setAsDefault}
											onCheckedChange={(checked) =>
												setSetAsDefault(checked === true)
											}
										/>
										<Label
											htmlFor="set-default"
											className="text-xs cursor-pointer"
										>
											Set as default category for this merchant
										</Label>
									</div>
								)}
							</>
						)}
					</div>

					{/* Match Preview */}
					{activePattern &&
						!(isBatchMode && batchResultType === "no-pattern") && (
							<div className="space-y-2">
								<Label>Preview</Label>
								<MatchPreviewList pattern={activePattern} />
							</div>
						)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleSubmit}
						disabled={!isFormValid || isSubmitting}
					>
						{assignmentMode === "new" ? "Create" : "Add Rule"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// Batch pattern suggestion radio group
function BatchPatternSuggestions({
	suggestions,
	value,
	onChange,
	onCustomMode,
}: {
	suggestions: BatchPatternSuggestion[];
	value: string;
	onChange: (pattern: string) => void;
	onCustomMode: () => void;
}): React.ReactElement {
	return (
		<RadioGroup
			value={value}
			onValueChange={(val) => {
				if (val === "__custom__") {
					onCustomMode();
				} else {
					onChange(val);
				}
			}}
			aria-label="Pattern suggestions"
			className="space-y-2"
		>
			{suggestions.map((suggestion) => (
				<div key={suggestion.pattern} className="flex items-start gap-2">
					<RadioGroupItem
						value={suggestion.pattern}
						id={`batch-pattern-${suggestion.type}`}
						className="mt-0.5"
					/>
					<Label
						htmlFor={`batch-pattern-${suggestion.type}`}
						className="flex flex-col gap-0.5 cursor-pointer text-sm"
					>
						<code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">
							{suggestion.pattern}
						</code>
						<span className="text-muted-foreground text-xs">
							{suggestion.matchCount} transaction
							{suggestion.matchCount !== 1 ? "s" : ""} will match
							{suggestion.matchesOutsideSelection > 0 && (
								<span className="ml-1 text-destructive font-medium">
									(+{suggestion.matchesOutsideSelection} outside selection)
								</span>
							)}
						</span>
					</Label>
				</div>
			))}
			<div className="flex items-center gap-2">
				<RadioGroupItem value="__custom__" id="batch-pattern-custom" />
				<Label
					htmlFor="batch-pattern-custom"
					className="cursor-pointer text-sm text-muted-foreground"
				>
					Custom pattern...
				</Label>
			</div>
		</RadioGroup>
	);
}
