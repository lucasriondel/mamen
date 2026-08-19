import { cn } from "@/lib/utils";

export interface RulesCoverageBarProps {
  /** Rows this issuer's rules currently own — the sum of every `ownedCount`. */
  ruleMatched: number;
  /** Every row pointing at this issuer, rule-matched or not. */
  total: number;
}

/**
 * The coverage line above the rules table: **how much of this issuer's history
 * its rules actually account for**.
 *
 * The rules tab's real question is not "which rules exist" but "is this issuer
 * covered, and by what" — a list of patterns answers the first and leaves the
 * second to arithmetic the reader has to do themselves. Both figures are already
 * on the page: `ruleMatched` is the sum of the rules' derived `ownedCount`
 * (issue #63) and `total` the issuer's unfiltered reference count, so the split
 * costs no extra read.
 *
 * The remainder is **hand-assigned**: a row can only carry this issuer because a
 * rule won it or because someone picked it, so `total - ruleMatched` is exactly
 * the set no rule will ever claim (`manualIssuer`). Naming it is the point —
 * it's the answer to "why didn't my rule pick these up".
 */
export function RulesCoverageBar({ ruleMatched, total }: RulesCoverageBarProps) {
  // Clamped, not trusted: the two figures come from separate queries and can
  // disagree for a beat while one refetches. A bar that overflows its track (or
  // reports negative manual rows) would make a transient look like a bug.
  const matched = Math.max(0, Math.min(ruleMatched, total));
  const manual = total - matched;
  const matchedPct = total === 0 ? 0 : (matched / total) * 100;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gousse-line bg-gousse-line/20 px-4 py-3">
      <p className="text-xs text-gousse-muted">
        <span className="text-sm font-semibold tabular-nums text-gousse-ink">{matched}</span> of{" "}
        <span className="tabular-nums">{total}</span> transaction
        {total === 1 ? "" : "s"} matched by rules
      </p>

      {/* A real `<meter>`, not a div wearing the role: the element already
          means "a value within a range", so the figures live in its own
          attributes. Its native rendering is replaced wholesale — appearance is
          reset and the fill is drawn with a gradient stop at the matched share,
          because the per-browser pseudo-elements (`::-webkit-meter-*`,
          `::-moz-meter-bar`) can't be styled from one rule. */}
      <meter
        className="h-1.5 min-w-30 flex-1 appearance-none overflow-hidden rounded-full"
        style={{
          background: `linear-gradient(to right, rgb(var(--gousse-accent)) ${matchedPct}%, rgb(var(--gousse-line) / 0.7) ${matchedPct}%)`,
        }}
        value={matched}
        min={0}
        max={Math.max(total, 1)}
        aria-label={`${matched} of ${total} transactions matched by rules, ${manual} assigned by hand`}
      />

      <div className="flex items-center gap-3 text-[11px] text-gousse-muted" aria-hidden>
        <LegendKey className="bg-gousse-accent">rule-matched</LegendKey>
        <LegendKey className="bg-gousse-line">
          hand-assigned <span className="tabular-nums">{manual}</span>
        </LegendKey>
      </div>
    </div>
  );
}

/** One swatch-and-label pair in the bar's legend. */
function LegendKey({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-1.5 rounded-full", className)} />
      {children}
    </span>
  );
}
