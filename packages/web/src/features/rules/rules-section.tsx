import type { Account, Issuer, RuleView } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { accountQueries, transactionQueries } from "@/lib/sdk";
import { issuerRulesQuery } from "./issuer-rules-query";
import { RulesCoverageBar, RulesCoveragePartial } from "./rules-coverage-bar";
import { RulesListSkeleton } from "./rules-list-skeleton";
import { RulesTableHead } from "./rules-table-head";
import { RulesTableRow } from "./rules-table-row";

export interface RulesSectionProps {
  issuer: Issuer;
}

/** Which in-place panel is open, and on which rule — one row, one question. */
type Expansion = { ruleId: number; kind: "move" | "delete" };

/**
 * The per-issuer **Matching Rules** manager (PRD #8 stories 23, 25) — embedded in
 * the issuer detail page and the full hub for its rules. Create and edit are
 * their own pages (`/issuers/$issuerId/rules/new` and `/rules/$ruleId`, issue
 * #16): "Add rule" and each row's pattern link into the shared rule form. Delete
 * and move are **inline confirms** on the row itself (issues #17, #94) — the
 * panel expands in place, no modal and no route. Uses the user-facing term
 * "Matching Rule" throughout (the code entity is `Rule`).
 *
 * The section is a **coverage console**: a coverage bar over a table whose
 * columns are the rule form's own predicates. The list previously showed one
 * thing per rule — the pattern, stretched across the full row — while
 * `matchAccountId`, `matchSign` and `matchValue` stayed invisible, so two rules
 * differing only by account rendered identically. They are what the rule *is*,
 * so they are columns, in the predicate bar's order (`RulePredicateBar`).
 *
 * Coverage costs no extra read: rule-matched rows are the sum of the rules'
 * derived `ownedCount` (issue #63) and the denominator is the issuer's
 * unfiltered reference count, which the detail page already asks for. Ownership
 * is exclusive — one row has exactly one winning rule — so the sum never
 * double-counts.
 *
 * The two figures must therefore cover the **same set**, on both axes. The
 * denominator is an unpaged count, so the numerator is summed over an unpaged
 * list ({@link issuerRulesQuery}): read a page at a time it under-counted by
 * every rule past the 50th and reported their rows as hand-assigned (issue
 * #198), and the table dropped those rules with no page to turn to reach them.
 * The denominator also hides **bundle members** — the parent stands for them —
 * so an `ownedCount` leaves them out too, decided server-side in the tally
 * rather than by anything on this page (issue #199).
 *
 * Only one panel is open at a time across the whole list: two would leave
 * "Cancel" ambiguous.
 */
export function RulesSection({ issuer }: RulesSectionProps) {
  const [expansion, setExpansion] = useState<Expansion | null>(null);

  // The issuer's **whole** rule set, not a page of it — the table lists all of
  // them and the bar sums all of them, so a page-sized read would drop rules
  // off the bottom and skew the coverage figure by exactly those.
  const rulesQuery = useQuery(issuerRulesQuery(issuer.id));
  const rules = (rulesQuery.data?.items ?? []) as readonly RuleView[];

  // Names for the account column. A rule's account matcher is stored as an id,
  // and the row falls back to that id when this hasn't landed (or the account is
  // gone), so the table never waits on it.
  const accountsQuery = useQuery(accountQueries.list());
  const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];

  // The **unfiltered** count, matching the delete guard's: coverage asks "of
  // every row this issuer counts, how much do rules account for", a question
  // the user's account/month/search filters must not narrow. Its default hides
  // bundle members, which is why the sum below can be put over it (issue #199).
  const totalQuery = useQuery(transactionQueries.count({ issuerId: issuer.id }));
  const total = totalQuery.data?.count ?? 0;

  const ruleMatched = rules.reduce((sum, rule) => sum + rule.ownedCount, 0);

  // Did the read reach the end of the list? The envelope's `total` is the full
  // filtered count, so a shortfall against the rows in hand is the one thing
  // that can make `ruleMatched` a lie — and it is the numerator of a bar whose
  // remainder is named "hand-assigned" (issue #198).
  const ruleTotal = rulesQuery.data?.total ?? rules.length;
  const listedEveryRule = rules.length >= ruleTotal;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-balance text-sm font-semibold text-gousse-ink">Matching Rules</h3>
        <Link
          to="/issuers/$issuerId/rules/new"
          params={{ issuerId: String(issuer.id) }}
          className="flex items-center gap-1 rounded-full border border-gousse-line px-3 py-1 text-xs text-gousse-ink transition-colors hover:border-gousse-accent"
        >
          <Plus size={14} aria-hidden />
          Add rule
        </Link>
      </div>

      {rulesQuery.isPending ? (
        <RulesListSkeleton />
      ) : rulesQuery.isError ? (
        <p className="py-2 text-sm text-gousse-high">Couldn’t load this issuer’s rules.</p>
      ) : rules.length === 0 ? (
        <p className="py-2 text-sm italic text-gousse-muted">
          No Matching Rules yet — add one to auto-assign this issuer.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gousse-line bg-gousse-panel">
          {listedEveryRule ? (
            <RulesCoverageBar ruleMatched={ruleMatched} total={total} />
          ) : (
            <RulesCoveragePartial listed={rules.length} ruleTotal={ruleTotal} />
          )}
          {/* The table scrolls inside its own box rather than pushing the page
              sideways: six columns don't fit a narrow viewport, and the panel
              this sits in is already width-constrained by the tab strip. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">
                Matching Rules for {issuer.name}, with the predicates each one matches on and how
                many transactions it currently owns.
              </caption>
              <RulesTableHead />
              <tbody>
                {rules.map((rule) => (
                  <RulesTableRow
                    key={rule.id}
                    rule={rule}
                    issuer={issuer}
                    accounts={accounts}
                    expanded={expansion?.ruleId === rule.id ? expansion.kind : null}
                    onStartMove={() => setExpansion({ ruleId: rule.id, kind: "move" })}
                    onStartDelete={() => setExpansion({ ruleId: rule.id, kind: "delete" })}
                    onCloseExpansion={() => setExpansion(null)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
