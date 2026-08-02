import type {
	Issuer,
	IssuerId,
	Rule,
	Transaction,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ruleKeys, ruleMutations } from "@/lib/sdk";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { RulePreviewLists } from "./rule-preview-lists";
import { RulePreviewSkeleton } from "./rule-preview-skeleton";
import { useRuleMutations } from "./use-rule-mutations";

const INPUT_CLASS =
	"w-full rounded-md border border-gousse-line bg-gousse-bg px-3 py-2 font-mono text-sm text-gousse-ink outline-none focus:border-gousse-accent";

/** How long the pattern field must be idle before the live preview refetches. */
const PREVIEW_DEBOUNCE_MS = 300;

/**
 * Common regex fragments offered as one-click authoring aids. Clicking a chip
 * splices its `token` into the pattern at the caret (story: make writing a
 * pattern easier than a bare text box). `hint` doubles as the button's
 * accessible name so each chip is addressable in tests/AT.
 */
const REGEX_TOKENS: ReadonlyArray<{
	label: string;
	token: string;
	hint: string;
}> = [
	{ label: ".*", token: ".*", hint: "any characters" },
	{ label: "\\d+", token: "\\d+", hint: "one or more digits" },
	{ label: "\\s", token: "\\s", hint: "a whitespace character" },
	{ label: "^", token: "^", hint: "start of string" },
	{ label: "$", token: "$", hint: "end of string" },
	{ label: "|", token: "|", hint: "either alternative" },
];

/**
 * Try to compile `pattern` as the case-insensitive regex the matcher will use;
 * return `null` when valid or the failure message when not. Empty is treated as
 * valid-but-inert (no feedback until the user types).
 */
function regexError(pattern: string): string | null {
	if (pattern.length === 0) return null;
	try {
		new RegExp(pattern, "i");
		return null;
	} catch (error) {
		return error instanceof Error
			? error.message
			: "Invalid regular expression";
	}
}

/**
 * Inline validity note for the pattern field: silent until the user types, then
 * the compile error (as an alert) or a confirmation once the regex is valid.
 */
function PatternValidity({
	pattern,
	error,
}: {
	pattern: string;
	error: string | null;
}) {
	if (pattern.length === 0) return null;
	if (error !== null) {
		return (
			<span role="alert" className="text-xs text-gousse-high">
				Invalid regular expression — {error}
			</span>
		);
	}
	return <span className="text-xs text-gousse-low">✓ Valid pattern</span>;
}

/**
 * The optional Value matcher field (issue #43): leave blank for a text-only
 * rule, or enter a positive amount magnitude to also require that amount. Shows
 * the parse error as an alert once a non-parsing value is typed, otherwise the
 * sign-agnostic helper note.
 */
function ValueMatcherField({
	value,
	onChange,
	error,
}: {
	value: string;
	onChange: (next: string) => void;
	error: string | null;
}) {
	return (
		<label className="flex flex-col gap-1 text-sm text-gousse-muted">
			Value
			<input
				className={INPUT_CLASS}
				type="number"
				inputMode="decimal"
				step="0.01"
				min="0"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder="e.g. 6.99 — leave blank for text-only"
				aria-label="Matching Rule value"
				aria-invalid={error !== null}
			/>
			{error !== null ? (
				<span role="alert" className="text-xs text-gousse-high">
					{error}
				</span>
			) : (
				<span className="text-xs text-gousse-muted">
					Optional — also require the transaction's amount to equal this
					magnitude (sign-agnostic).
				</span>
			)}
		</label>
	);
}

export interface RuleFormProps {
	issuerId: IssuerId;
	/** Issuer lookup so the preview can name a row's current issuer. */
	issuersById: ReadonlyMap<number, Issuer>;
	/** The rule being edited; omit to create a new one. */
	rule?: Rule;
	/** Initial pattern when creating (ignored when editing — the rule wins). */
	defaultPattern?: string;
	/** Called after a successful create/update (to leave the form). */
	onDone: () => void;
	/** Called to abandon the form without saving. */
	onCancel: () => void;
}

/**
 * The Matching Rule **create/edit form** with a live three-list preview (PRD #8
 * stories 7–12, 22). Typing a `pattern` refetches a dry-run scoped to that one
 * pattern (`ruleId` present ⇒ update, absent ⇒ create), so the user sees exactly
 * which transactions the rule will match, reassign, or leave (manual) before
 * committing. Save then applies the change — preview and commit are one
 * deliberate action; the server recomputes on commit, so the preview is
 * advisory, never a stale write.
 *
 * Each manual-collision row offers a "remove manual issuer" action (story 10):
 * clearing the flag makes the row rule-eligible again, and the preview refetches
 * to reflect it.
 */
export function RuleForm({
	issuerId,
	issuersById,
	rule,
	defaultPattern,
	onDone,
	onCancel,
}: RuleFormProps) {
	const [pattern, setPattern] = useState(rule?.pattern ?? defaultPattern ?? "");
	const [value, setValue] = useState(
		rule?.matchValue != null ? String(rule.matchValue) : "",
	);
	const inputRef = useRef<HTMLInputElement>(null);
	const { create, update, removeManualIssuer } = useRuleMutations();

	const trimmedPattern = pattern.trim();
	const patternError = useMemo(
		() => regexError(trimmedPattern),
		[trimmedPattern],
	);

	// The optional Value matcher (issue #43): a blank field is the opt-out (a
	// regex-only rule); a filled field must parse to a positive amount magnitude.
	// `matchValue` is the committed number (or `null` = explicitly none); the
	// error only nags once a non-parsing value is typed.
	const trimmedValue = value.trim();
	const parsedValue = trimmedValue === "" ? null : Number(trimmedValue);
	const valueError =
		parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue <= 0)
			? "Value must be a positive number."
			: null;
	const matchValue = valueError === null ? parsedValue : null;

	/** Splice a helper token into the pattern at the caret (or append). */
	const insertToken = (token: string) => {
		const input = inputRef.current;
		const start = input?.selectionStart ?? pattern.length;
		const end = input?.selectionEnd ?? pattern.length;
		const next = pattern.slice(0, start) + token + pattern.slice(end);
		setPattern(next);
		// Restore focus and drop the caret just after the inserted token.
		requestAnimationFrame(() => {
			if (!input) return;
			input.focus();
			const caret = start + token.length;
			input.setSelectionRange(caret, caret);
		});
	};

	const debouncedPattern = useDebouncedValue(
		trimmedPattern,
		PREVIEW_DEBOUNCE_MS,
	);
	const debouncedMatchValue = useDebouncedValue(
		matchValue,
		PREVIEW_DEBOUNCE_MS,
	);
	const previewInput = {
		...(rule ? { ruleId: rule.id } : {}),
		issuerId,
		pattern: debouncedPattern,
		// A present value narrows the dry-run to rows of that amount magnitude;
		// omitted entirely when blank so the request stays regex-only.
		...(debouncedMatchValue != null ? { matchValue: debouncedMatchValue } : {}),
	};

	const previewQuery = useQuery({
		queryKey: ruleKeys.preview(previewInput),
		queryFn: () => ruleMutations.preview(previewInput),
		enabled: debouncedPattern.length > 0,
	});

	const saving = create.isPending || update.isPending;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = pattern.trim();
		if (trimmed.length === 0 || saving || valueError !== null) return;
		if (rule) {
			// On update always send `matchValue` so blanking it clears the matcher;
			// `null` is the explicit clear sentinel (a dropped key would leave it set).
			update.mutate(
				{ id: rule.id, patch: { pattern: trimmed, matchValue } },
				{ onSuccess: onDone },
			);
		} else {
			create.mutate(
				{
					issuerId,
					pattern: trimmed,
					matchCount: 0,
					...(matchValue != null ? { matchValue } : {}),
				},
				{ onSuccess: onDone },
			);
		}
	};

	const removeManual = (transaction: Transaction) => {
		if (removeManualIssuer.isPending) return;
		removeManualIssuer.mutate(transaction.id);
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<label className="flex flex-col gap-1 text-sm text-gousse-muted">
				Pattern
				<input
					ref={inputRef}
					className={INPUT_CLASS}
					value={pattern}
					onChange={(event) => setPattern(event.target.value)}
					placeholder="e.g. amazon"
					aria-label="Matching Rule pattern"
					aria-invalid={patternError !== null}
					// biome-ignore lint/a11y/noAutofocus: focus the sole field on open
					autoFocus
				/>
				<span className="text-xs text-gousse-muted">
					A case-insensitive regular expression matched against the raw issuer
					string.
				</span>
			</label>

			<ValueMatcherField value={value} onChange={setValue} error={valueError} />

			{/* Readable rendering of the regex the matcher will actually run, plus
			    live validity feedback so a broken pattern is caught before save. */}
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="text-xs text-gousse-muted">Runs as</span>
				<code className="rounded bg-gousse-panel px-2 py-1 font-mono text-gousse-ink">
					/{trimmedPattern || "…"}/i
				</code>
				<PatternValidity pattern={trimmedPattern} error={patternError} />
			</div>

			{/* One-click authoring aids: splice a common regex fragment at the caret. */}
			<div className="flex flex-col gap-1">
				<span className="text-xs text-gousse-muted">Insert:</span>
				<div className="flex flex-wrap gap-1.5">
					{REGEX_TOKENS.map((tok) => (
						<button
							key={tok.token}
							type="button"
							className="rounded border border-gousse-line px-2 py-0.5 font-mono text-xs text-gousse-ink outline-none transition-[transform,border-color] hover:border-gousse-accent focus-visible:ring-2 focus-visible:ring-gousse-accent active:scale-[0.97]"
							aria-label={`Insert ${tok.hint}`}
							title={tok.hint}
							onClick={() => insertToken(tok.token)}
						>
							{tok.label}
						</button>
					))}
				</div>
			</div>

			<div className="max-h-72 overflow-y-auto rounded-md border border-gousse-line p-3">
				{debouncedPattern.length === 0 ? (
					<p className="text-sm text-gousse-muted italic">
						Type a pattern to preview its effect.
					</p>
				) : previewQuery.isPending ? (
					<RulePreviewSkeleton label="Previewing this pattern…" />
				) : previewQuery.isError ? (
					<p className="text-sm text-gousse-high">Couldn’t load the preview.</p>
				) : previewQuery.data ? (
					<RulePreviewLists
						preview={previewQuery.data}
						issuersById={issuersById}
						renderManualAction={(transaction) => (
							<Button
								variant="secondary"
								size="sm"
								className="shrink-0"
								onClick={() => removeManual(transaction)}
								disabled={removeManualIssuer.isPending}
							>
								Remove manual issuer
							</Button>
						)}
					/>
				) : null}
			</div>

			<div className="flex justify-end gap-2">
				<Button variant="secondary" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					type="submit"
					size="sm"
					disabled={
						saving || pattern.trim().length === 0 || valueError !== null
					}
				>
					{rule ? "Save rule" : "Create rule"}
				</Button>
			</div>
		</form>
	);
}
