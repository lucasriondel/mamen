import type { Issuer, RulePreviewResult, Transaction } from "@mamen/shared/contract";
import { RulePreviewTable } from "./rule-preview-table";
import { PREVIEW_TABS, type PreviewTabId, RulePreviewTabs } from "./rule-preview-tabs";

/** The count pills' source — one number per list, in the tabs' own shape. */
function countsOf(preview: RulePreviewResult): Readonly<Record<PreviewTabId, number>> {
  return {
    willMatch: preview.willMatch.length,
    willReassign: preview.willReassign.length,
    manualCollisions: preview.manualCollisions.length,
  };
}

/**
 * The one-line consequence summary under the grid. It reads across all three
 * lists, which is the number the save decision actually turns on — the tab on
 * screen shows one of them, and switching tabs to add them up is work the
 * sentence can do instead.
 */
function PreviewSummary({ preview }: { preview: RulePreviewResult }) {
  const changing = preview.willMatch.length + preview.willReassign.length;
  const manual = preview.manualCollisions.length;
  return (
    <span className="text-xs text-gousse-muted">
      {changing === 0
        ? "No transaction changes issuer"
        : `${changing} transaction${changing === 1 ? "" : "s"} change${changing === 1 ? "s" : ""} issuer`}
      {manual > 0
        ? ` · ${manual} hand-assigned row${manual === 1 ? "" : "s"} left untouched`
        : null}
    </span>
  );
}

export interface RulePreviewPanelProps {
  preview: RulePreviewResult;
  /** The issuers the previewed rows point at, resolved by id (#62). */
  issuersById: ReadonlyMap<number, Issuer>;
  /** Which of the three lists is on screen — held by the caller, see below. */
  activeTab: PreviewTabId;
  onSelectTab: (id: PreviewTabId) => void;
  /** Per-row "remove manual issuer" action for the manual-collision rows. */
  renderManualAction?: (transaction: Transaction) => React.ReactNode;
}

/**
 * The Matching Rule preview (PRD #8 stories 7–11): the three lists a dry-run
 * reports, as tabs over one {@link RulePreviewTable}.
 *
 * - **will match** — currently-unmatched rows this rule claims;
 * - **will reassign** — rows another issuer's rule owns that this rule wins;
 * - **manual collisions** — rows matching the pattern but assigned by hand,
 *   left untouched by default (each offers a per-row remove action).
 *
 * Which tab is open is a way of looking at one result rather than a property of
 * the rule being written — but it is held by the **caller**, not here (issue
 * #200). Nothing outside acts on the choice; what the caller owns it for is
 * that this component is unmounted by a refetch it must survive. The preview is
 * dependent on a second read (the previewed rows' issuers, `useIssuerLookup`),
 * so a dry-run naming issuers the last one didn't still swaps this panel for the
 * skeleton for a beat — and `useState` here would come back on "Will match",
 * bouncing a reader off the list they were reading on every keystroke.
 *
 * The tab deliberately does **not** follow the counts either: one that jumped to
 * whichever list happened to be non-empty would move the rows out from under
 * that same reader.
 *
 * When the pattern is an invalid regex the server reports `skipped`; all three
 * lists come back empty and we say so rather than showing three zeroes (story
 * 19).
 */
export function RulePreviewPanel({
  preview,
  issuersById,
  activeTab,
  onSelectTab,
  renderManualAction,
}: RulePreviewPanelProps) {
  if (preview.skipped) {
    return (
      <output className="text-sm text-gousse-high">
        That pattern isn’t a valid regular expression — it will be skipped and match nothing.
      </output>
    );
  }

  const tab = PREVIEW_TABS.find((candidate) => candidate.id === activeTab) ?? PREVIEW_TABS[0];
  const rows = preview[tab.id];

  return (
    <div className="flex flex-col gap-3">
      {/* Centred over the grid, with the description on its own line beneath:
          the strip is the switch for everything below it, so it sits on the
          page's axis rather than trailing a sentence off to one side. */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <RulePreviewTabs active={tab.id} onSelect={onSelectTab} counts={countsOf(preview)} />
        {/* The heading the tab replaced, kept as the panel's accessible name so
            the grid below is still announced as *which* list it is. */}
        <h3 id="rule-preview-heading" className="sr-only">
          {tab.label} ({rows.length})
        </h3>
        <p className="text-xs text-gousse-muted">{tab.description}</p>
      </div>

      <div
        id="rule-preview-panel"
        role="tabpanel"
        aria-labelledby={`rule-preview-tab-${tab.id}`}
        tabIndex={-1}
      >
        <RulePreviewTable
          transactions={rows}
          issuersById={issuersById}
          emptyLabel="None."
          renderActions={tab.id === "manualCollisions" ? renderManualAction : undefined}
        />
      </div>

      <PreviewSummary preview={preview} />
    </div>
  );
}
