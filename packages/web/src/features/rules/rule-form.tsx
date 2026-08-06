import type {
	Account,
	AccountId,
	IssuerId,
	Rule,
	RuleSign,
	Transaction,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import { accountQueries, ruleKeys, ruleMutations } from "@/lib/sdk";
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

/**
 * The optional Account matcher field (issue #90): a select whose first entry is
 * **"Any account"** — the opt-out is a visible, selectable choice rather than a
 * blank, since an unselected select reads as *incomplete* rather than as
 * *deliberately unscoped*. One account, never a set: a row lives in exactly one
 * account, so several accounts are several rules.
 */
function AccountMatcherField({
	value,
	accounts,
	onChange,
}: {
	value: string;
	accounts: ReadonlyArray<Account>;
	onChange: (next: string) => void;
}) {
	return (
		<label className="flex flex-col gap-1 text-sm text-gousse-muted">
			Account
			<select
				className={INPUT_CLASS}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				aria-label="Matching Rule account"
			>
				<option value="">Any account</option>
				{accounts.map((account) => (
					<option key={account.id} value={account.id}>
						{account.name}
					</option>
				))}
			</select>
			<span className="text-xs text-gousse-muted">
				Optional — also require the transaction to live in this account.
			</span>
		</label>
	);
}

/**
 * The optional Sign matcher field (issue #90): **Any / Money in / Money out**.
 * The wording follows the statement rather than the sign, matching how the app
 * already frames an Issuer as bidirectional. A zero-amount row (a bundle that
 * nets out) is neither, so it is claimable only by a rule left on **Any**.
 */
function SignMatcherField({
	value,
	onChange,
}: {
	value: string;
	onChange: (next: string) => void;
}) {
	return (
		<label className="flex flex-col gap-1 text-sm text-gousse-muted">
			Direction
			<select
				className={INPUT_CLASS}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				aria-label="Matching Rule direction"
			>
				<option value="">Any</option>
				<option value="positive">Money in</option>
				<option value="negative">Money out</option>
			</select>
			<span className="text-xs text-gousse-muted">
				Optional — also require the transaction's direction. A row of exactly
				zero is neither.
			</span>
		</label>
	);
}

export interface RuleFormProps {
	issuerId: IssuerId;
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
 * The three optional predicates — **Value**, **Account** and **Sign** matchers
 * (issues #42/#43, #90) — all thread into that same debounced preview, so the
 * lists narrow as the rule does and the user sees the consequence before saving.
 * Each states its own opt-out ("Any account", "Any", a blank value); an update
 * always sends all three so opting one out clears it rather than dropping a key.
 *
 * Each manual-collision row offers a "remove manual issuer" action (story 10):
 * clearing the flag makes the row rule-eligible again, and the preview refetches
 * to reflect it.
 */
export function RuleForm({
	issuerId,
	rule,
	defaultPattern,
	onDone,
	onCancel,
}: RuleFormProps) {
	const [pattern, setPattern] = useState(rule?.pattern ?? defaultPattern ?? "");
	const [value, setValue] = useState(
		rule?.matchValue != null ? String(rule.matchValue) : "",
	);
	// The two selects hold their opt-out ("Any account" / "Any") as the empty
	// string, so an edited rule pre-fills from its stored predicate or from the
	// opt-out when it carries none.
	const [account, setAccount] = useState(
		rule?.matchAccountId != null ? String(rule.matchAccountId) : "",
	);
	const [sign, setSign] = useState<string>(rule?.matchSign ?? "");
	const inputRef = useRef<HTMLInputElement>(null);
	const { create, update, removeManualIssuer } = useRuleMutations();

	// The accounts the Account matcher offers. A failed/pending read leaves the
	// select with its opt-out alone — the rest of the form still works.
	const accountsQuery = useQuery(accountQueries.list());
	const accounts = accountsQuery.data?.items ?? [];

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

	// The two new predicates (issue #90). Each is the committed value or `null` =
	// explicitly none; the empty option is the deliberate opt-out, not a blank.
	const matchAccountId = account === "" ? null : (Number(account) as AccountId);
	const matchSign = sign === "" ? null : (sign as RuleSign);

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
	const debouncedMatchAccountId = useDebouncedValue(
		matchAccountId,
		PREVIEW_DEBOUNCE_MS,
	);
	const debouncedMatchSign = useDebouncedValue(matchSign, PREVIEW_DEBOUNCE_MS);
	const previewInput = {
		...(rule ? { ruleId: rule.id } : {}),
		issuerId,
		pattern: debouncedPattern,
		// Each present predicate narrows the dry-run — to rows of that amount
		// magnitude, in that account, of that direction. Omitted entirely when
		// opted out, so the request stays exactly as broad as the rule.
		...(debouncedMatchValue != null ? { matchValue: debouncedMatchValue } : {}),
		...(debouncedMatchAccountId != null
			? { matchAccountId: debouncedMatchAccountId }
			: {}),
		...(debouncedMatchSign != null ? { matchSign: debouncedMatchSign } : {}),
	};

	const previewQuery = useQuery({
		queryKey: ruleKeys.preview(previewInput),
		queryFn: () => ruleMutations.preview(previewInput),
		enabled: debouncedPattern.length > 0,
	});

	// The issuers the previewed rows currently belong to, by the ids those rows
	// carry — the three lists are short, and this way none of their issuers can
	// fall off a page of the issuer table (#62).
	const preview = previewQuery.data;
	const { issuersById, isPending: issuersPending } = useIssuerLookup([
		...(preview?.willMatch ?? []).map((t) => t.issuerId),
		...(preview?.willReassign ?? []).map((t) => t.issuerId),
		...(preview?.manualCollisions ?? []).map((t) => t.issuerId),
	]);

	const saving = create.isPending || update.isPending;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = pattern.trim();
		if (trimmed.length === 0 || saving || valueError !== null) return;
		if (rule) {
			// On update always send all three predicates so opting one out clears it;
			// `null` is the explicit clear sentinel (a dropped key would leave it
			// set). The form holds the rule's whole prospective state, so nothing it
			// sends is a partial patch.
			update.mutate(
				{
					id: rule.id,
					patch: { pattern: trimmed, matchValue, matchAccountId, matchSign },
				},
				{ onSuccess: onDone },
			);
		} else {
			create.mutate(
				{
					issuerId,
					pattern: trimmed,
					...(matchValue != null ? { matchValue } : {}),
					...(matchAccountId != null ? { matchAccountId } : {}),
					...(matchSign != null ? { matchSign } : {}),
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

			<AccountMatcherField
				value={account}
				accounts={accounts}
				onChange={setAccount}
			/>

			<SignMatcherField value={sign} onChange={setSign} />

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
				) : /* The issuer lookup reads the ids of the previewed rows, so it
				      lands a beat after them — one skeleton covers both. */
				previewQuery.isPending || issuersPending ? (
					<RulePreviewSkeleton label="Previewing this pattern…" />
				) : previewQuery.isError ? (
					<p className="text-sm text-gousse-high">Couldn’t load the preview.</p>
				) : preview ? (
					<RulePreviewLists
						preview={preview}
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
