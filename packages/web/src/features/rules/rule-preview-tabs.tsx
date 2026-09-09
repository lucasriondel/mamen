import { TabsCount, TabsIndicator, TabsList, TabsTab } from "@/components/ui/tabs";

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
  /** How many rows each list holds, for the count pills. */
  counts: Readonly<Record<PreviewTabId, number>>;
}

/**
 * The strip that switches the preview's three lists — the app's tab widget
 * ({@link TabsList}), not a strip of buttons wearing `role="tab"`.
 *
 * Stacked, the three lists pushed the third below the fold and gave each an
 * arbitrary share of a fixed-height scroll box. As tabs they share the full
 * width — which is what lets the real transactions grid render here at all —
 * and the counts stay visible on the strip, so the blast radius is legible
 * without opening each list.
 *
 * It was hand-rolled once, and that is what issue #206 retired: `ui/tabs.tsx`
 * exists to own the half a hand-rolled strip always gets wrong — the roving
 * `tabIndex` (one stop for the whole strip rather than one per tab), the arrow
 * keys, Home/End, and the `aria-controls`/`aria-labelledby` wiring to the panels
 * — and a second tab widget with its own keyboard semantics is a keyboard user
 * having to learn this page separately. Only the placement lives here: the strip
 * is centred over the grid it switches, because it is the control for
 * everything below it rather than a sentence trailing off to one side.
 *
 * A tab with no rows stays enabled: an empty **Manual collisions** is a fact
 * worth checking, and disabling it would make "none" indistinguishable from
 * "not loaded yet".
 *
 * The root and the panels are the caller's ({@link RulePreviewPanel}) — a
 * `TabsList` outside a `Tabs` root has nothing to switch.
 */
export function RulePreviewTabs({ counts }: RulePreviewTabsProps) {
  return (
    <TabsList aria-label="Rule preview" className="justify-center">
      {PREVIEW_TABS.map((tab) => (
        <TabsTab key={tab.id} value={tab.id} className="text-xs">
          {tab.label}
          <TabsCount>{counts[tab.id]}</TabsCount>
        </TabsTab>
      ))}
      <TabsIndicator />
    </TabsList>
  );
}
