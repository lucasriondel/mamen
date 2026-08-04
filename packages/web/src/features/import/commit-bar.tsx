import type { AccountId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { formatMonth } from "@/lib/format";
import { transactionQueries } from "@/lib/sdk";
import { distinctMonths } from "./commit";
import type { ParsedTransaction } from "./parsers/types";
import { useImportCommit } from "./use-import-commit";

/**
 * The shared foot of both preview paths (CSV plain table and PDF side-by-side):
 * the per-month warnings plus the Commit / Back buttons. Committing runs the
 * same delete-then-create-per-month rail regardless of source, so this is the
 * single place that owns the destructive-replace notices and the commit action.
 *
 * Two notices per month, from two independent reads: the rows the commit
 * replaces, and the **bundles** it dissolves (issue #77). They are separate
 * questions with separate answers — a bundle can span two months or two
 * accounts, so it is destroyed by a statement whose own rows it barely touches.
 */
export function CommitBar({
	records,
	accountId,
	onBack,
}: {
	records: readonly ParsedTransaction[];
	accountId: AccountId;
	onBack: () => void;
}) {
	const commit = useImportCommit();
	const months = distinctMonths(records);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				{months.map((month) => (
					<Fragment key={month}>
						<MonthReplacement accountId={accountId} month={month} />
						<BundleDissolution accountId={accountId} month={month} />
					</Fragment>
				))}
			</div>

			<div className="flex items-center gap-3">
				<Button
					variant="primary"
					size="md"
					onClick={() => commit.mutate({ records, accountId })}
					disabled={commit.isPending}
				>
					{commit.isPending ? "Importing…" : "Commit import"}
				</Button>
				<Button
					variant="secondary"
					size="md"
					onClick={onBack}
					disabled={commit.isPending}
				>
					Back
				</Button>
			</div>
		</div>
	);
}

/**
 * A per-month replacement notice: reads the account's existing row count for the
 * month and, when non-zero, warns that committing will replace those rows.
 *
 * The count is **approximate since issue #87**: `count`'s `importMonth` filter
 * now buckets by the row's own `date`, while the delete this warns about still
 * acts on the `importMonth` column — so a row whose date moved after import (a
 * **bundle parent** dated by hand, a corrected date) is counted under one month
 * and deleted under another. The number is advisory and the divergence is
 * confined to rows whose two months disagree; the honest fix is epic #85's, which
 * removes the delete this notice is about altogether — an import stops replacing
 * anything, and the warning goes with it.
 */
function MonthReplacement({
	accountId,
	month,
}: {
	accountId: AccountId;
	month: string;
}) {
	const countQuery = useQuery(
		transactionQueries.count({ accountId, importMonth: month }),
	);
	const count = countQuery.data?.count ?? 0;

	if (count === 0) return null;

	return (
		<p role="alert" className="text-sm text-gousse-high">
			This will replace {count} existing row{count === 1 ? "" : "s"} for{" "}
			{formatMonth(month)}.
		</p>
	);
}

/**
 * A per-month **bundle** notice (issue #77): committing deletes everything for
 * the account and month, and a bundle parent is a row in that same table — so
 * the bundling goes with it and the recap quietly reverts to counting the gross
 * rows. Say so first.
 *
 * The count is the server's (`bundleImpact`), not a client-side scan: a bundle
 * only *partly* inside this month — spanning two months, or two accounts — is
 * dissolved too, and nothing on this page could see it. Re-bundling afterwards
 * is manual, so the notice says that rather than implying it will be restored.
 */
function BundleDissolution({
	accountId,
	month,
}: {
	accountId: AccountId;
	month: string;
}) {
	const impactQuery = useQuery(
		transactionQueries.bundleImpact({ accountId, importMonth: month }),
	);
	const count = impactQuery.data?.count ?? 0;

	if (count === 0) return null;

	return (
		<p role="alert" className="text-sm text-gousse-high">
			This will dissolve {count} bundle{count === 1 ? "" : "s"} including rows
			from {formatMonth(month)}. Re-bundling is manual.
		</p>
	);
}
