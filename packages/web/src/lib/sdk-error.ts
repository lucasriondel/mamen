/**
 * Map an `@mamen/sdk` failure to a human-readable message.
 *
 * The SDK rejects mutations/queries with the contract's tagged errors (each a
 * `Schema.TaggedError` carrying a `_tag` discriminant — see
 * `@mamen/shared/contract` `errors.ts`). The PRD assigns mutation failures to a
 * `sonner` toast whose copy is derived from that `_tag`; this is the single
 * place that translation lives so every feature surfaces the same wording.
 *
 * A few failures are shown *in place* rather than toasted — the PDF upload
 * step's alert, and the AI settings page's per-tile and per-row refusals. Those
 * get their own exported mapper below and are wired into {@link toErrorMessage}
 * as well, so the same failure reads the same way whichever surface catches it.
 */

import type { AiProvider } from "@mamen/shared/contract";
import { AI_PROVIDER_LABELS } from "@mamen/shared/contract";

/** Narrow an unknown thrown value to its SDK error `_tag`, when it has one. */
function tagOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tag = (error as { _tag: unknown })._tag;
    return typeof tag === "string" ? tag : undefined;
  }
  return undefined;
}

/** Join a list into prose: "a", "a and b", "a, b and c". Empty → "". */
function joinClauses(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The guarded-delete refusal, worded from the dependent counts the API returns
 * (`CategoryInUse`). Names each non-zero kind — child categories, transactions,
 * issuer defaults — so the user knows exactly what to re-assign before deleting.
 */
function categoryInUseMessage(error: unknown): string {
  const e = error as {
    children?: number;
    transactions?: number;
    issuers?: number;
  };
  const parts: string[] = [];
  if (e.children) {
    parts.push(`${e.children} categor${e.children === 1 ? "y" : "ies"} inside it`);
  }
  if (e.transactions) {
    parts.push(`${e.transactions} transaction${e.transactions === 1 ? "" : "s"}`);
  }
  if (e.issuers) {
    parts.push(`${e.issuers} issuer${e.issuers === 1 ? "" : "s"}`);
  }
  return parts.length === 0
    ? "This category is still in use, so it can't be deleted yet."
    : `Can't delete — still used by ${joinClauses(parts)}. Re-assign first, then delete.`;
}

/**
 * The refused **Kind flip** (`CategoryHoldsMoney`): a leaf can't take a child
 * while it still holds money. Worded from the two counts the API returns so the
 * user sees what would be stranded, and pointed at the **Spill** gesture that
 * moves it into a new child. (The categories page also opens the spill dialog on
 * this error, so the toast is the explanation, not the only recourse.)
 */
function categoryHoldsMoneyMessage(error: unknown): string {
  const e = error as { transactions?: number; issuers?: number };
  const parts: string[] = [];
  if (e.transactions) {
    parts.push(`${e.transactions} transaction${e.transactions === 1 ? "" : "s"}`);
  }
  if (e.issuers) {
    parts.push(`${e.issuers} issuer default${e.issuers === 1 ? "" : "s"}`);
  }
  return parts.length === 0
    ? "This category holds money, so it can't take a child yet. Spill it into a new category first."
    : `This category holds ${joinClauses(parts)}. Spill them into a new category so nothing is stranded.`;
}

/**
 * If `error` is a refused **Kind flip** (`CategoryHoldsMoney`), return the two
 * dependent counts it carries; otherwise `null`. Lets the categories page branch
 * on the refusal — open the **Spill** dialog rather than only toast — without
 * re-implementing the `_tag` narrowing.
 */
export function categoryHoldsMoney(
  error: unknown,
): { transactions: number; issuers: number } | null {
  if (tagOf(error) !== "CategoryHoldsMoney") return null;
  const e = error as { transactions?: number; issuers?: number };
  return { transactions: e.transactions ?? 0, issuers: e.issuers ?? 0 };
}

/**
 * Turn a caught SDK error into a short sentence fit for a toast. Unknown `_tag`s
 * (and non-tagged throwables like network failures) fall back to a generic line
 * so the user always gets *some* explanation, never a raw stack.
 */
export function toErrorMessage(error: unknown): string {
  switch (tagOf(error)) {
    case "NotFound":
      return "That item no longer exists — it may have been deleted already.";
    case "Conflict":
      return "That name is already taken. Pick a different one.";
    case "InvalidFileType":
      return "That file type isn't supported.";
    case "ExtractionFailed":
      return "Couldn't read that PDF statement. Please try again.";
    case "CategoryInUse":
      return categoryInUseMessage(error);
    case "CategoryHoldsMoney":
      return categoryHoldsMoneyMessage(error);
    case "CategoryWouldCycle":
      return "A category can't be moved under itself or one of its own sub-categories.";
    case "CategoryNotLeaf":
      return "Pick a category, not a folder.";
    case "ImageFetchRefused":
      return imageFetchRefusedMessage(error);
    case "TransferInvalid":
      return transferInvalidMessage(error);
    case "SecretRejected":
      return secretRejectedMessage(error);
    case "TaskProviderRejected":
      return taskProviderRejectedMessage(error);
    case "AiProviderNotConfigured":
      return aiProviderNotConfiguredMessage(error);
    default:
      return "Something went wrong. Please try again.";
  }
}

/**
 * The run-time refusal (`AiProviderNotConfigured`, issue #122): the provider a
 * task runs on has no credential stored — most often the Claude Code token,
 * which since #122 is pasted in the app and read from nowhere else.
 *
 * The sentence names the provider and sends the user to Settings, because that
 * is the only thing that fixes it: unlike every other extraction failure, a
 * retry cannot succeed. Whether the surface can offer an actual link is
 * {@link aiProviderNotConfigured}'s business; this line reads correctly either
 * way.
 */
export function aiProviderNotConfiguredMessage(error: unknown): string {
  const provider = (error as { provider?: AiProvider }).provider;
  const label =
    provider === undefined ? "That AI provider" : (AI_PROVIDER_LABELS[provider] ?? provider);

  return `${label} has no credential stored, so nothing could run. Paste one in Settings, then try again.`;
}

/**
 * If `error` is `AiProviderNotConfigured`, the provider it names; otherwise
 * `null`. Lets a surface route the user — an actual link to the AI settings page
 * — rather than only telling them where to go, without re-implementing the
 * `_tag` narrowing. Mirrors {@link categoryHoldsMoney}, the other error a view
 * branches on rather than only renders.
 */
export function aiProviderNotConfigured(error: unknown): AiProvider | null {
  if (tagOf(error) !== "AiProviderNotConfigured") return null;
  return (error as { provider?: AiProvider }).provider ?? null;
}

/**
 * A refused credential paste (`SecretRejected`, PRD #115), worded from the
 * machine-readable `reason`. Shown **in place, on the tile that was refused** —
 * not toasted — because the field the user has to fix is right there.
 *
 * Neither line quotes the value, for the same reason the error itself carries no
 * field one could travel in (ADR 0011): a refusal that echoed the paste would
 * put a credential in the DOM, in a screenshot and in a pasted bug report.
 */
export function secretRejectedMessage(error: unknown): string {
  switch ((error as { reason?: string }).reason) {
    case "blank":
      return "There's nothing to save — paste a credential first.";
    case "too-short":
      return "That's too short to be a credential. Check the whole value was pasted.";
    default:
      return "That value can't be stored as a credential.";
  }
}

/**
 * A refusal from the **save-time doors** (`TaskProviderRejected`, issue #119),
 * worded from the `reason` and the provider it names.
 *
 * Each line ends where the user's next action is, and the three are genuinely
 * different actions — store a key, pick another model, move the task off this
 * provider — which is why the reasons are not collapsed into one sentence. The
 * task is deliberately not named: `credential-in-use` is raised from the
 * credentials grid, where "which task" is a detail the user cannot act on
 * without leaving the sentence, and mamen has one AI task.
 */
export function taskProviderRejectedMessage(error: unknown): string {
  const e = error as { provider?: AiProvider; reason?: string };
  const provider =
    e.provider === undefined ? "That provider" : (AI_PROVIDER_LABELS[e.provider] ?? e.provider);

  switch (e.reason) {
    case "no-credential":
      return `${provider} has no credential stored yet. Paste one above, then pick it here.`;
    case "model-not-served":
      return `${provider} doesn't serve that model. Pick one of its own.`;
    case "credential-in-use":
      return "An AI task is still using it. Point that task at another provider first, then clear the key.";
    default:
      return `${provider} can't run that task as configured.`;
  }
}

/**
 * Wording for a refused transfer grouping (`TransferInvalid`, PRD #48), keyed
 * off the error's machine-readable `reason`. Each line names why the set can't
 * form one internal transfer so the user knows what to change before retrying.
 */
function transferInvalidMessage(error: unknown): string {
  const reason = (error as { reason?: string }).reason;
  switch (reason) {
    case "too-few-legs":
      return "A transfer needs at least two transactions.";
    case "unbalanced":
      return "Those amounts don't cancel out — a transfer's legs must sum to zero.";
    case "unknown-id":
      return "One of those transactions no longer exists.";
    case "already-grouped":
      return "One of those transactions is already part of another transfer.";
    case "is-refund":
      return "A refund can't be grouped as a transfer.";
    default:
      return "Those transactions can't be grouped as a transfer.";
  }
}

/**
 * PDF-import-specific wording for the two extraction errors, shown as the upload
 * step's inline alert (not the generic toast). Both give a path forward and leak
 * no CLI internals — the server collapses its whole failure taxonomy to a single
 * `ExtractionFailed` (see ADR 0005), so the user only ever learns "it didn't
 * work, here's what to do", never an upstream tag or stderr.
 *
 * - `ExtractionFailed`: the collapsed Claude failure — retry, or fall back to a
 *   CSV export from the bank.
 * - `InvalidFileType`: wrong MIME or over the 10 MB cap — a distinct, actionable
 *   line (the generic {@link toErrorMessage} "type isn't supported" is too terse
 *   here and is shared with the issuer-image path, so it stays untouched).
 * - `AiProviderNotConfigured`: no credential stored for the provider this task
 *   runs on (issue #122). The one extraction failure where a retry is the wrong
 *   advice, which is exactly why the server keeps it out of the collapse — so
 *   this is the one line that sends the user somewhere instead of back to the
 *   drop zone.
 * - `NoTransactionTable`: **discovery** read the PDF and found no transaction
 *   table in it (issue #217) — a payslip, a marketing letter, a scan of nothing.
 *   The only one of these that is about the *file*, so it is the only one that
 *   asks for a different file rather than for another attempt at this one.
 * - `NotFound`: the **Statement Format** this extraction names is gone —
 *   deleted from the account's formats while this import was open. Also a
 *   failure a retry cannot fix, and one whose generic wording ("that item no
 *   longer exists") would leave the user hunting for which item, so it says
 *   which and what to do instead: map the file again.
 *
 * Any other throwable (network failure, unknown tag) falls back to the retry
 * wording — from the user's seat it's the same "extraction didn't complete".
 */
export function pdfExtractionErrorMessage(error: unknown): string {
  switch (tagOf(error)) {
    case "InvalidFileType":
      return "That file isn't a supported PDF. Upload a PDF bank statement under 10 MB, or import a CSV export instead.";
    case "NoTransactionTable":
      return "That PDF carries no transaction table we could read. Check it's a bank statement rather than a summary or a receipt.";
    case "AiProviderNotConfigured":
      return aiProviderNotConfiguredMessage(error);
    case "NotFound":
      return "That statement format was deleted while this import was open. Drop the file again to map it afresh.";
    default:
      return "We couldn't extract transactions from that PDF. Try dropping it again, or import a CSV export from your bank instead.";
  }
}

/**
 * A refused **Logo search** download (`ImageFetchRefused`), worded from the
 * machine-readable `reason` the server sends. The refusals are grouped by what
 * the user can *do*, not by the guard that fired: "that host isn't allowed" and
 * "the scheme isn't https" are one sentence here because the answer to both is
 * *pick a different result* — and naming the SSRF guard that tripped would only
 * describe the API's network to whoever asked about it (ADR 0007).
 *
 * Every line ends in the same place — the results are still on screen, pick
 * another — because that is what the popover leaves the user holding.
 */
export function imageFetchRefusedMessage(error: unknown): string {
  switch ((error as { reason?: string }).reason) {
    case "too-large":
      return "That image is too big to store. Pick another result.";
    case "timeout":
      return "That image's host didn't answer in time. Pick another result.";
    case "not-an-image":
      return "That file isn't an image we can read. Pick another result.";
    default:
      return "That image couldn't be fetched. Pick another result.";
  }
}

/**
 * The three **Logo search** read failures, narrowed to what the popover has to
 * render *differently* — not just different copy, but different affordances
 * (ADR 0007):
 *
 * - `unconfigured` — nothing was attempted and nothing the user does in the app
 *   will change that, so it carries the variable names to set instead.
 * - `quota` — the provider's rate limit is spent. Offers no retry: a retry
 *   cannot succeed until the window resets, and a button that says otherwise
 *   is a lie the user pays for in confusion.
 * - `failed` — anything else, including a network error with no `_tag` at all.
 *   A retry may well work, so this is the one state that offers one.
 */
export type LogoSearchFailure =
  | { kind: "unconfigured"; missing: readonly string[] }
  | { kind: "quota" }
  | { kind: "failed" };

export function logoSearchFailure(error: unknown): LogoSearchFailure {
  switch (tagOf(error)) {
    case "LogoSearchUnconfigured": {
      const missing = (error as { missing?: readonly string[] }).missing;
      return { kind: "unconfigured", missing: missing ?? [] };
    }
    case "LogoSearchQuotaExceeded":
      return { kind: "quota" };
    default:
      return { kind: "failed" };
  }
}
