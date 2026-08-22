import type {
  Account,
  AccountId,
  IssuerId,
  Rule,
  RuleSign,
  Transaction,
} from "@mamen/shared/contract";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import { accountQueries, ruleKeys, ruleMutations } from "@/lib/sdk";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { RulePatternMeta } from "./rule-pattern-meta";
import { RulePredicateBar } from "./rule-predicate-bar";
import { RulePreviewGridSkeleton } from "./rule-preview-grid-skeleton";
import { RulePreviewPanel } from "./rule-preview-panel";
import type { PreviewTabId } from "./rule-preview-tabs";
import { useRuleMutations } from "./use-rule-mutations";

/** How long the pattern field must be idle before the live preview refetches. */
const PREVIEW_DEBOUNCE_MS = 300;

/**
 * Try to compile `pattern` as the case-insensitive regex the matcher will use;
 * return `null` when valid or the failure message when not. Empty is treated as
 * valid-but-inert (no feedback until the user types).
 */
function regexError(pattern: string): string | null {
  if (pattern.length === 0) return null;
  try {
    // Called, not constructed: the compile is the whole point and the object is
    // thrown away, which `new` for side effects alone is exactly what lint
    // objects to. `RegExp(…)` compiles and throws identically.
    RegExp(pattern, "i");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid regular expression";
  }
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
 * The Matching Rule **create/edit form** with a live preview (PRD #8 stories
 * 7–12, 22). Typing a `pattern` refetches a dry-run scoped to that one pattern
 * (`ruleId` present ⇒ update, absent ⇒ create), so the user sees exactly which
 * transactions the rule will match, reassign, or leave (manual) before
 * committing. Save then applies the change — preview and commit are one
 * deliberate action; the server recomputes on commit, so the preview is
 * advisory, never a stale write.
 *
 * The form is **one line over its consequence**. All four predicates —
 * pattern plus the optional **Account**, **Direction** and **Value** matchers
 * (issues #42/#43, #90) — live in a single {@link RulePredicateBar}, because
 * they are one statement about which rows this rule claims and reading them
 * apart was reading the rule apart. Each states its own opt-out ("Any
 * account", "Any", "Any value"); all four thread into the same debounced
 * preview, so the grid narrows as the rule does, and an update always sends
 * all three optional predicates so opting one out clears it rather than
 * dropping a key.
 *
 * Under the bar, {@link RulePatternMeta} shows what the pattern compiles to
 * and offers the regex fragments; under that, {@link RulePreviewPanel} renders
 * the dry-run in the app's own transactions grid. Each manual-collision row
 * offers a "remove manual issuer" action (story 10): clearing the flag makes
 * the row rule-eligible again, and the preview refetches to reflect it.
 */
export function RuleForm({ issuerId, rule, defaultPattern, onDone, onCancel }: RuleFormProps) {
  const [pattern, setPattern] = useState(rule?.pattern ?? defaultPattern ?? "");
  const [value, setValue] = useState(rule?.matchValue != null ? String(rule.matchValue) : "");
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
  const accounts = (accountsQuery.data?.items ?? []) as ReadonlyArray<Account>;

  const trimmedPattern = pattern.trim();
  const patternError = useMemo(() => regexError(trimmedPattern), [trimmedPattern]);

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

  const debouncedPattern = useDebouncedValue(trimmedPattern, PREVIEW_DEBOUNCE_MS);
  const debouncedMatchValue = useDebouncedValue(matchValue, PREVIEW_DEBOUNCE_MS);
  const debouncedMatchAccountId = useDebouncedValue(matchAccountId, PREVIEW_DEBOUNCE_MS);
  const debouncedMatchSign = useDebouncedValue(matchSign, PREVIEW_DEBOUNCE_MS);
  const previewInput = {
    ...(rule ? { ruleId: rule.id } : {}),
    issuerId,
    pattern: debouncedPattern,
    // Each present predicate narrows the dry-run — to rows of that amount
    // magnitude, in that account, of that direction. Omitted entirely when
    // opted out, so the request stays exactly as broad as the rule.
    ...(debouncedMatchValue != null ? { matchValue: debouncedMatchValue } : {}),
    ...(debouncedMatchAccountId != null ? { matchAccountId: debouncedMatchAccountId } : {}),
    ...(debouncedMatchSign != null ? { matchSign: debouncedMatchSign } : {}),
  };

  const previewQuery = useQuery({
    queryKey: ruleKeys.preview(previewInput),
    queryFn: () => ruleMutations.preview(previewInput),
    enabled: debouncedPattern.length > 0,
    // Every settled predicate change is a new key, and without this each one
    // would swap the whole panel for the skeleton mid-edit — the grid the user
    // is reading torn down and rebuilt on a keystroke. The previous dry-run
    // stays on screen while the next is in flight; it is advisory either way,
    // and the save recomputes server-side (issue #200).
    placeholderData: keepPreviousData,
  });

  // The issuers the previewed rows currently belong to, by the ids those rows
  // carry — the three lists are short, and this way none of their issuers can
  // fall off a page of the issuer table (#62). Every list is resolved, not just
  // the tab on screen: switching tabs must not trigger a fresh lookup and flash
  // the rows it reveals as unresolved.
  const preview = previewQuery.data;
  const { issuersById, isPending: issuersPending } = useIssuerLookup([
    ...(preview?.willMatch ?? []).map((t) => t.issuerId),
    ...(preview?.willReassign ?? []).map((t) => t.issuerId),
    ...(preview?.manualCollisions ?? []).map((t) => t.issuerId),
  ]);

  // Which of the preview's three lists is on screen. It lives up here, above
  // the skeleton swap, because the panel below is unmounted by the very
  // refetches the choice has to survive: `keepPreviousData` holds the grid
  // through the dry-run itself, but the issuer lookup is a *dependent* read, so
  // an answer naming different issuers than the last one still shows the
  // skeleton for a beat — and state inside the panel would not outlive it.
  const [previewTab, setPreviewTab] = useState<PreviewTabId>("willMatch");

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* The authoring controls stay a fixed, centred column while the preview
          below runs the full width of the page: the bar is a statement to read
          in one line, and stretching it across a wide viewport would put its
          four fields further apart the more room there is. */}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2.5">
        <RulePredicateBar
          pattern={pattern}
          onPatternChange={setPattern}
          patternRef={inputRef}
          patternError={patternError}
          account={account}
          onAccountChange={setAccount}
          accounts={accounts}
          sign={sign}
          onSignChange={setSign}
          value={value}
          onValueChange={setValue}
          valueError={valueError}
        />
        <RulePatternMeta
          pattern={trimmedPattern}
          patternError={patternError}
          valueError={valueError}
          onInsertToken={insertToken}
        />
      </div>

      {debouncedPattern.length === 0 ? (
        <p className="rounded-2xl border border-gousse-line px-4 py-8 text-center text-sm text-gousse-muted italic">
          Type a pattern to preview its effect.
        </p>
      ) : /* The issuer lookup reads the ids of the previewed rows, so it
             lands a beat after them — one skeleton covers both. */
      previewQuery.isPending || issuersPending ? (
        <RulePreviewGridSkeleton label="Previewing this pattern…" />
      ) : previewQuery.isError ? (
        <p className="text-sm text-gousse-high">Couldn’t load the preview.</p>
      ) : preview ? (
        <RulePreviewPanel
          preview={preview}
          issuersById={issuersById}
          activeTab={previewTab}
          onSelectTab={setPreviewTab}
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

      <div className="flex justify-end gap-2 border-t border-gousse-line pt-4">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={saving || pattern.trim().length === 0 || valueError !== null}
        >
          {rule ? "Save rule" : "Create rule"}
        </Button>
      </div>
    </form>
  );
}
