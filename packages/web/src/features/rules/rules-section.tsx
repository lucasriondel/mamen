import type { Issuer, RuleView } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Replace, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ruleQueries } from "@/lib/sdk";
import { RuleDeleteConfirm } from "./rule-delete-confirm";
import { RuleMovePanel } from "./rule-move-panel";
import { RulesListSkeleton } from "./rules-list-skeleton";

export interface RulesSectionProps {
  issuer: Issuer;
}

/**
 * The per-issuer **Matching Rules** manager (PRD #8 stories 23, 25) — embedded in
 * the issuer detail page and the full hub for its rules. Create and edit are
 * their own pages (`/issuers/$issuerId/rules/new` and `/rules/$ruleId`, issue
 * #16): "Add rule" and each row link into the shared rule form. Delete is an
 * **inline confirm** on the row itself (issue #17) — clicking a row's trash icon
 * expands the delete preview in place (no modal, no route), and confirming
 * removes the rule and refreshes the list. Uses the user-facing term "Matching
 * Rule" throughout (the code entity is `Rule`).
 *
 * Naming the issuers a preview row currently belongs to is the confirm's own
 * business: it holds the rows, so it knows the ids to ask for (#62).
 *
 * **Move** (issue #94) follows the same precedent: a second icon on the row
 * expands the {@link RuleMovePanel} in place. The two expansions are mutually
 * exclusive — one row of the list answers one question at a time, and two open
 * panels would leave "Cancel" ambiguous.
 */
export function RulesSection({ issuer }: RulesSectionProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  const startDelete = (id: number) => {
    setMovingId(null);
    setDeletingId(id);
  };
  const startMove = (id: number) => {
    setDeletingId(null);
    setMovingId(id);
  };

  const rulesQuery = useQuery(ruleQueries.list({ issuerId: issuer.id }));
  const rules = (rulesQuery.data?.items ?? []) as readonly RuleView[];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-balance text-sm font-semibold text-gousse-ink">Matching Rules</h3>
        <Link
          to="/issuers/$issuerId/rules/new"
          params={{ issuerId: String(issuer.id) }}
          className="flex items-center gap-1 rounded-full border border-gousse-line px-3 py-1 text-xs text-gousse-ink"
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
        <p className="py-2 text-sm text-gousse-muted italic">
          No Matching Rules yet — add one to auto-assign this issuer.
        </p>
      ) : (
        <ul className="divide-y divide-gousse-line rounded-2xl border border-gousse-line">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2 text-sm">
                <Link
                  to="/issuers/$issuerId/rules/$ruleId"
                  params={{
                    issuerId: String(issuer.id),
                    ruleId: String(rule.id),
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-full transition-colors hover:text-gousse-ink"
                  aria-label={`Edit rule ${rule.pattern}`}
                >
                  <code className="min-w-0 flex-1 truncate font-mono text-gousse-ink">
                    {rule.pattern}
                  </code>
                  {/* What the rule owns *right now* — derived server-side on
                      every read (issue #63), so it falls when a row is
                      hand-assigned away or a sibling rule out-specifies this
                      one. Worded as the thing it counts, not as "matches". */}
                  <span
                    className="shrink-0 text-xs text-gousse-muted"
                    title="Transactions this Matching Rule currently assigns"
                  >
                    {rule.ownedCount} transaction
                    {rule.ownedCount === 1 ? "" : "s"}
                  </span>
                </Link>
                {/* `Replace`, deliberately not `ArrowRightLeft`: that icon
                    already reads as the transaction **transfer** feature, and
                    a rule move has nothing to do with it. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={`Move rule ${rule.pattern} to another issuer`}
                  onClick={() => startMove(rule.id)}
                >
                  <Replace size={14} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={`Delete rule ${rule.pattern}`}
                  onClick={() => startDelete(rule.id)}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              </div>
              {deletingId === rule.id ? (
                <div className="border-t border-gousse-line px-3 py-3">
                  <RuleDeleteConfirm
                    rule={rule}
                    onDone={() => setDeletingId(null)}
                    onCancel={() => setDeletingId(null)}
                  />
                </div>
              ) : null}
              {movingId === rule.id ? (
                <div className="border-t border-gousse-line px-3 py-3">
                  <RuleMovePanel
                    rule={rule}
                    onDone={() => setMovingId(null)}
                    onCancel={() => setMovingId(null)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
