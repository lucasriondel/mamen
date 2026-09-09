import type { Account, Issuer, RuleView } from "@mamen/shared/contract";
import { Link } from "@tanstack/react-router";
import { Pencil, Replace, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RuleDeleteConfirm } from "./rule-delete-confirm";
import { RuleMovePanel } from "./rule-move-panel";
import {
  RuleAccountCell,
  RuleOwnedCell,
  RuleSignCell,
  RuleValueCell,
} from "./rule-predicate-cells";

/**
 * The edit action's chassis — the `ghost`/`icon` Button's shape, on an anchor.
 * Kept beside its one call-site rather than exported from the primitive: it is a
 * link that looks like a button, not a new button variant.
 */
const EDIT_LINK_CLASS = cn(
  "inline-flex size-9 items-center justify-center rounded-full text-gousse-ink transition-[transform,colors] active:scale-[0.96]",
  "hover:bg-gousse-line/60 outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-bg",
);

/** How many columns a row spans — the expansion panel has to match the head. */
const COLUMN_COUNT = 6;

export interface RulesTableRowProps {
  rule: RuleView;
  issuer: Issuer;
  accounts: ReadonlyArray<Account>;
  /** Which in-place panel this row is showing, if any. */
  expanded: "move" | "delete" | null;
  onStartMove: () => void;
  onStartDelete: () => void;
  onCloseExpansion: () => void;
}

/**
 * One Matching Rule as a table row: its four predicates, what it owns, and its
 * three actions.
 *
 * The row used to be a link with two icon buttons inside it — a hit target that
 * both navigated and didn't, depending on the pixel. Edit is now its own icon,
 * peer to move and delete, and the pattern keeps a link of its own for the
 * pointer that goes for the text.
 *
 * The move and delete panels stay **in place** (issues #17, #94), which in a
 * table means a second full-width `<tr>` beneath this one rather than a nested
 * div: a `<td>` spanning every column is the only way to give the panel the
 * row's full width without breaking the column alignment above it.
 */
export function RulesTableRow({
  rule,
  issuer,
  accounts,
  expanded,
  onStartMove,
  onStartDelete,
  onCloseExpansion,
}: RulesTableRowProps) {
  const editLink = {
    to: "/issuers/$issuerId/rules/$ruleId" as const,
    params: { issuerId: String(issuer.id), ruleId: String(rule.id) },
  };

  return (
    <>
      <tr className="group border-b border-gousse-line/55 last:border-b-0 hover:bg-gousse-line/20">
        <td className="px-4 py-2.5">
          <RuleAccountCell rule={rule} accounts={accounts} />
        </td>
        <td className="max-w-0 px-4 py-2.5">
          {/* Named by its own text, not by an `aria-label`: the pencil beside
              it is the action called "Edit rule <pattern>", and two links with
              one name pointing at one page is a name collision, not a
              convenience. `title` carries the full regex when it truncates. */}
          <Link
            {...editLink}
            className="block truncate font-mono text-[13px] text-gousse-ink transition-colors hover:text-gousse-accent"
            title={rule.pattern}
          >
            {rule.pattern}
          </Link>
        </td>
        <td className="px-4 py-2.5">
          <RuleSignCell rule={rule} />
        </td>
        <td className="px-4 py-2.5 text-right">
          <RuleValueCell rule={rule} />
        </td>
        <td className="px-4 py-2.5 text-right">
          <RuleOwnedCell rule={rule} />
        </td>
        <td className="px-4 py-2.5">
          {/* Half-lit until the row is pointed at or something in it takes focus:
              three always-on icons per row turned a four-rule list into twelve
              competing targets. `focus-within` keeps them from disappearing for
              a keyboard, which `hover` alone would do. */}
          <div className="flex justify-end gap-0.5 opacity-55 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {/* A link, not a `Button`: this action navigates, and the
                primitive has no `asChild`. It borrows the ghost icon button's
                shape so the three actions read as one set. */}
            <Link
              {...editLink}
              className={EDIT_LINK_CLASS}
              aria-label={`Edit rule ${rule.pattern}`}
            >
              <Pencil size={14} aria-hidden />
            </Link>
            {/* `Replace`, deliberately not `ArrowRightLeft`: that icon already
                reads as the transaction **transfer** feature. */}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move rule ${rule.pattern} to another issuer`}
              onClick={onStartMove}
            >
              <Replace size={14} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete rule ${rule.pattern}`}
              onClick={onStartDelete}
            >
              <Trash2 size={14} aria-hidden />
            </Button>
          </div>
        </td>
      </tr>

      {expanded !== null ? (
        <tr className="border-b border-gousse-line/55 last:border-b-0">
          <td colSpan={COLUMN_COUNT} className="bg-gousse-line/10 px-4 py-3">
            {expanded === "delete" ? (
              <RuleDeleteConfirm
                rule={rule}
                onDone={onCloseExpansion}
                onCancel={onCloseExpansion}
              />
            ) : (
              <RuleMovePanel rule={rule} onDone={onCloseExpansion} onCancel={onCloseExpansion} />
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
