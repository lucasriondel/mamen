import { cn } from "@/lib/utils";

/** Which of the preview's three lists is on screen. */
export type PreviewTabId = "willMatch" | "willReassign" | "manualCollisions";

/**
 * The three lists a preview reports, in the order the consequence escalates:
 * rows nobody owns, rows taken off another issuer, and rows a hand overrode
 * that this rule cannot take at all.
 *
 * The `description` is the sentence that used to sit under each list's heading.
 * It survives the move to tabs because it is the part that says what the count
 * *means* — a count alone doesn't distinguish "claimed" from "taken away".
 */
export const PREVIEW_TABS: ReadonlyArray<{
  id: PreviewTabId;
  label: string;
  description: string;
}> = [
  {
    id: "willMatch",
    label: "Will match",
    description: "Currently-unmatched transactions this rule will claim.",
  },
  {
    id: "willReassign",
    label: "Will reassign",
    description: "Transactions another issuer's rule owns that this rule will win.",
  },
  {
    id: "manualCollisions",
    label: "Manual collisions",
    description:
      "Hand-assigned transactions matching this pattern — left untouched unless you remove their manual issuer.",
  },
];

export interface RulePreviewTabsProps {
  active: PreviewTabId;
  onSelect: (id: PreviewTabId) => void;
  /** How many rows each list holds, for the count pills. */
  counts: Readonly<Record<PreviewTabId, number>>;
}

/**
 * The preview's three lists as **tabs over one table**.
 *
 * Stacked, the three lists pushed the third below the fold and gave each an
 * arbitrary share of a fixed-height scroll box. As tabs they share the full
 * width — which is what lets the real transactions grid render here at all —
 * and the counts stay visible on the tab strip, so the blast radius is legible
 * without opening each list.
 *
 * A tab with no rows stays enabled: an empty **Manual collisions** is a fact
 * worth checking, and disabling it would make "none" indistinguishable from
 * "not loaded yet".
 */
export function RulePreviewTabs({ active, onSelect, counts }: RulePreviewTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Rule preview"
      className="inline-flex gap-1 rounded-full border border-gousse-line bg-gousse-panel p-1"
    >
      {PREVIEW_TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`rule-preview-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls="rule-preview-panel"
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gousse-accent",
              selected
                ? "bg-gousse-bg font-medium text-gousse-ink"
                : "text-gousse-muted hover:text-gousse-ink",
            )}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                selected
                  ? "bg-gousse-accent/15 text-gousse-accent"
                  : "bg-gousse-line text-gousse-ink",
              )}
            >
              {counts[tab.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
