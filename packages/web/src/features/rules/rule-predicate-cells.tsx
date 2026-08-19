import type { Account, RuleView } from "@mamen/shared/contract";
import { cn } from "@/lib/utils";

/**
 * An **unset** matcher, printed rather than left blank.
 *
 * A blank cell and a scoped cell are the same shape, so a table of them can't be
 * read down a column — which is the whole reason the predicates moved into
 * columns. "Any" is the same word the rule form's own fields use for the opt-out
 * (`Any account`, `Any`, `Any value`), so the list and the editor agree on what
 * an absent predicate is called.
 */
export function AnyValue({ children = "Any" }: { children?: React.ReactNode }) {
  return <span className="text-xs italic text-gousse-muted/70">{children}</span>;
}

/** The rule's account matcher, resolved to a name. */
export function RuleAccountCell({
  rule,
  accounts,
}: {
  rule: RuleView;
  accounts: ReadonlyArray<Account>;
}) {
  if (rule.matchAccountId == null) return <AnyValue />;
  const account = accounts.find((item) => item.id === rule.matchAccountId);
  // An account can be deleted out from under a rule (no FK, per the contract),
  // and a list still loading has no names yet. Either way the matcher is *set* —
  // saying "Any" would be a lie about the rule's scope — so the id stands in.
  return <span className="text-sm">{account?.name ?? `Account #${rule.matchAccountId}`}</span>;
}

/** The rule's sign matcher as a direction badge. */
export function RuleSignCell({ rule }: { rule: RuleView }) {
  if (rule.matchSign == null) return <AnyValue />;
  const isIn = rule.matchSign === "positive";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px]",
        isIn
          ? "border-gousse-low/40 bg-gousse-low/10 text-gousse-low"
          : "border-gousse-high/35 bg-gousse-high/10 text-gousse-high",
      )}
    >
      {isIn ? "↑" : "↓"} {isIn ? "Money in" : "Money out"}
    </span>
  );
}

/** The rule's value matcher — a magnitude, so no sign is shown. */
export function RuleValueCell({ rule }: { rule: RuleView }) {
  if (rule.matchValue == null) return <AnyValue />;
  return <span className="font-mono text-xs tabular-nums">{rule.matchValue.toFixed(2)}</span>;
}

/**
 * The owned count (issue #63). A **0** is badged amber rather than printed
 * plain: a rule owning nothing is the single most common "why isn't this
 * working", and a bare zero in a column of numbers doesn't read as a finding.
 */
export function RuleOwnedCell({ rule }: { rule: RuleView }) {
  if (rule.ownedCount === 0) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-gousse-medium/40 bg-gousse-medium/10 px-2 py-px text-[11px] tabular-nums text-gousse-medium"
        title="This rule currently owns no transactions — a narrower rule may be winning them, or they were assigned by hand."
      >
        0
      </span>
    );
  }
  return <span className="font-mono text-sm tabular-nums">{rule.ownedCount}</span>;
}
