import type { Issuer, RulePreviewResult, Transaction } from "@mamen/shared/contract";
import { useState } from "react";
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
 * Which tab is open is this component's own state: nothing outside it acts on
 * the choice, and it is a way of looking at one result rather than a property
 * of the rule being written. It deliberately does **not** follow the counts —
 * a tab that jumped to whichever list happened to be non-empty would move the
 * rows out from under a reader mid-keystroke, and the pattern field refetches
 * on every keystroke.
 *
 * When the pattern is an invalid regex the server reports `skipped`; all three
 * lists come back empty and we say so rather than showing three zeroes (story
 * 19).
 */
export function RulePreviewPanel({
  preview,
  issuersById,
  renderManualAction,
}: RulePreviewPanelProps) {
  const [active, setActive] = useState<PreviewTabId>("willMatch");

  if (preview.skipped) {
    return (
      <output className="text-sm text-gousse-high">
        That pattern isn’t a valid regular expression — it will be skipped and match nothing.
      </output>
    );
  }

  const tab = PREVIEW_TABS.find((candidate) => candidate.id === active) ?? PREVIEW_TABS[0];
  const rows = preview[tab.id];

  return (
    <div className="flex flex-col gap-3">
      {/* Centred over the grid, with the description on its own line beneath:
          the strip is the switch for everything below it, so it sits on the
          page's axis rather than trailing a sentence off to one side. */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <RulePreviewTabs active={active} onSelect={setActive} counts={countsOf(preview)} />
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
